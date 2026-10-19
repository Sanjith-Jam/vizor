#!/usr/bin/env python3
"""Reproduce an authenticated photo -> actual Banana Pi -> database acceptance test.

Export VIZOR_SUPABASE_URL, VIZOR_SUPABASE_ANON_KEY, VIZOR_ACCESS_TOKEN and
VIZOR_DEVICE_ID in your shell. Never pass secrets on the command line.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jpeg', type=Path)
    parser.add_argument('--expect-min', type=int, default=0)
    parser.add_argument('--output', type=Path, default=Path('photo-demo-report.json'))
    args = parser.parse_args()
    url = os.environ['VIZOR_SUPABASE_URL'].rstrip('/')
    token = os.environ['VIZOR_ACCESS_TOKEN']
    key = os.environ['VIZOR_SUPABASE_ANON_KEY']
    assert url.startswith('https://'), 'Use the HTTPS project URL.'
    raw = args.jpeg.read_bytes()
    assert raw.startswith(b'\xff\xd8\xff') and len(raw) <= 5_000_000, 'Use a JPEG below 5 MB.'

    def api(action, payload=None):
        request = urllib.request.Request(url + '/functions/v1/api',
            data=json.dumps({'action': action, 'payload': payload or {}}).encode(),
            headers={'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + token})
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'{action} rejected (HTTP {error.code}); check session/configuration.') from None

    identifier = str(uuid.uuid4())
    payload = {'id': identifier, 'deviceId': os.environ['VIZOR_DEVICE_ID'],
        'image': base64.b64encode(raw).decode(), 'mode': 'demo',
        'location': {'lat': 12.973, 'lon': 79.145}, 'locationConfirmed': False}
    job = api('createInference', payload)
    assert job['id'] == identifier
    assert api('createInference', payload)['id'] == identifier, 'Upload retry duplicated the job.'
    for _ in range(45):
        state = api('inferenceState')
        job = next(job for job in state['jobs'] if job['id'] == identifier)
        if job['status'] in ('completed', 'failed', 'cancelled'):
            break
        time.sleep(2)
    assert job['status'] == 'completed', f"Worker did not complete: {job['status']}"
    detections = job['result']['detections']
    assert len(detections) >= args.expect_min, 'Fewer detections than expected.'
    observations = [row for row in state['observations'] if row['event_id'] == 'photo-' + identifier]
    assert len(observations) == (1 if detections else 0)
    assert all(row['source'] == 'replay' and row['pothole_id'] is None for row in observations)
    args.output.write_text(json.dumps({'job': job, 'observations': observations}, indent=2))
    print(f"PASS: {len(detections)} potholes, {job['result']['inferenceMs']} ms inference; private demo rows verified.")


if __name__ == '__main__':
    main()
