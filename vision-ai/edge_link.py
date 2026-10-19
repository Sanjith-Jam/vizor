"""Persistent observation outbox and the single-owner hardware/cloud bridge."""
import base64
import json
import os
import sqlite3
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone


def gps_location(fix, now=None):
    now = time.time() if now is None else now
    if not fix or not fix.get('fix') or now - fix.get('received_at', 0) > 5:
        return None, None
    lat, lon = fix.get('lat'), fix.get('lon')
    if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    accuracy = fix.get('accuracyMeters')
    return {'lat': lat, 'lon': lon}, accuracy


def parse_imu(line, now=None):
    try:
        prefix, kind, force = line.strip().split(':')
        force=float(force)
        if prefix!='IMU' or kind not in ('1','2') or not 0<=force<=655.35:
            return None
        return {'type':int(kind),'gForce':force,'received_at':time.time() if now is None else now}
    except (ValueError,TypeError):
        return None


class EdgeLink:
    def __init__(self, path, enabled=True):
        self.path = path
        self.url = os.environ.get('VIZOR_SUPABASE_URL', '').rstrip('/')
        self.key = os.environ.get('VIZOR_SUPABASE_ANON_KEY', '')
        self.secret = os.environ.get('VIZOR_DEVICE_TOKEN', '')
        self.device_id = os.environ.get('VIZOR_DEVICE_ID', '')
        self.enabled = enabled and bool(self.url and self.key and self.secret)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.execute('create table if not exists outbox(event_id text primary key, payload text not null)')
        self.db.commit()
        self.stop = threading.Event()
        self.worker = None
        self.telemetry = None
        self.evidence_path = None
        if self.enabled:
            self.worker = threading.Thread(target=self._worker, daemon=True)
            self.worker.start()

    def request(self, action, payload):
        raw = json.dumps({'action': action, 'payload': payload, 'deviceSecret': self.secret}).encode()
        req = urllib.request.Request(self.url + '/functions/v1/api', data=raw, headers={
            'Content-Type': 'application/json', 'apikey': self.key,
            'Authorization': 'Bearer ' + self.key,
        })
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.load(response)

    def add(self, payload):
        with self.lock:
            self.db.execute('insert or ignore into outbox values(?,?)', (payload['eventId'], json.dumps(payload)))
            self.db.commit()

    def flush(self, send=None):
        if send is None:
            def send(payload):
                image = payload.pop('_evidence', None)
                if image:
                    result=self.request('uploadEvidence', {'image':image,'eventId':payload['eventId']})
                    payload['evidencePath']=result['path']
                    self.evidence_path=result['path']
                return self.request('observe', payload)
        with self.lock:
            rows = self.db.execute('select event_id,payload from outbox order by rowid limit 20').fetchall()
        for identifier, raw in rows:
            if self.stop.is_set(): break
            send(json.loads(raw))
            with self.lock:
                self.db.execute('delete from outbox where event_id=?', (identifier,))
                self.db.commit()
        return len(rows)

    def _worker(self):
        while not self.stop.wait(5):
            try:
                self.flush()
                if self.telemetry:
                    self.request('telemetry', {**self.telemetry, 'evidence_path':self.evidence_path})
            except Exception as error:
                print('[WARN] Cloud unavailable; observations remain in the local outbox:', type(error).__name__)

    def publish(self, fix, confidence, source, revision, evidence=None):
        location, accuracy = gps_location(fix)
        event = {'eventId': str(uuid.uuid4()), 'observedAt': datetime.now(timezone.utc).isoformat(),
                 'source': source, 'location': location, 'accuracyMeters': accuracy,
                 'confidence': confidence, 'modelRevision': revision}
        imu=fix.get('imu') if fix else None
        if imu and time.time()-imu.get('received_at',0)<=2 and imu.get('type')==1:
            event['gForce']=imu['gForce']
        # Persist images with the outbox; network I/O never blocks inference.
        if evidence is not None:
            event['_evidence']=base64.b64encode(evidence).decode()
        self.add(event)
        return event

    def close(self):
        self.stop.set()
        if self.worker:
            self.worker.join(timeout=20)
        with self.lock:
            self.db.close()
