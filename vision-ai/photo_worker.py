"""Owner-scoped cloud photo queue -> real pothole inference on the Banana Pi.

The worker only makes outbound HTTPS requests. It never opens a web port or owns
GPS/UART. A photo's map location is explicitly supplied by its uploader.
"""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

REVISION = 'rdd2022-yolov8n@acf216a43d796f7910fc854f662c1e9cfa03fc01'


class CloudApi:
    def __init__(self):
        self.url = os.environ.get('VIZOR_SUPABASE_URL', '').rstrip('/')
        self.key = os.environ.get('VIZOR_SUPABASE_ANON_KEY', '')
        self.token = os.environ.get('VIZOR_DEVICE_TOKEN', '')
        if not self.url.startswith('https://') or not self.key or not self.token:
            raise ValueError('Configure the Supabase URL, public key and device token in the service environment.')

    def call(self, action, payload=None):
        req = urllib.request.Request(self.url + '/functions/v1/api',
            data=json.dumps({'action': action, 'payload': payload or {}, 'deviceSecret': self.token}).encode(),
            headers={'Content-Type': 'application/json', 'apikey': self.key, 'Authorization': 'Bearer ' + self.key})
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Avoid echoing credentials, private image URLs or arbitrary server text.
            raise RuntimeError(f'Cloud operation {action} failed (HTTP {error.code}).') from None
        if isinstance(result, dict) and result.get('error'):
            raise RuntimeError(f'Cloud operation {action} was rejected.')
        return result


def load_photo(raw):
    import cv2
    import numpy as np
    from PIL import Image
    if len(raw) > 5_000_000 or not raw.startswith(b'\xff\xd8\xff'):
        raise ValueError('Photo must be JPEG, at most 5 MB.')
    with Image.open(io.BytesIO(raw)) as photo:
        w, h = photo.size
        if w < 1 or h < 1 or max(w, h) > 8192 or w * h > 16_000_000:
            raise ValueError('Photo dimensions exceed the worker limit (16 megapixels).')
        photo.thumbnail((1280, 1280))
        return cv2.cvtColor(np.asarray(photo.convert('RGB')), cv2.COLOR_RGB2BGR)


def pothole_classes(model):
    classes = [int(i) for i, name in model.names.items() if str(name).lower() in ('pothole', 'potholes', 'd40')]
    if not classes:
        raise ValueError('Checkpoint has no pothole class. Road cracks must not become pothole detections.')
    return classes


def infer_photo(model, raw, confidence=0.30):
    import cv2
    frame = load_photo(raw)
    height, width = frame.shape[:2]
    start = time.perf_counter()
    prediction = model.predict(source=frame, conf=confidence, iou=0.45, imgsz=640,
        classes=pothole_classes(model), max_det=20, verbose=False)[0]
    elapsed = (time.perf_counter() - start) * 1000
    detections = []
    for box in prediction.boxes:
        x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())
        bbox = [max(0, min(1, v)) for v in (x1 / width, y1 / height, x2 / width, y2 / height)]
        if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            continue
        score = float(box.conf[0])
        detections.append({'confidence': score, 'bbox': bbox})
        cv2.rectangle(frame, (round(x1), round(y1)), (round(x2), round(y2)), (35, 220, 235), 2)
        cv2.putText(frame, f'Pothole {score:.0%}', (round(x1), max(18, round(y1) - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (35, 220, 235), 2)
    ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise RuntimeError('Could not encode the result image.')
    result = {'modelRevision': REVISION, 'inferenceMs': round(elapsed, 1),
        'imageWidth': width, 'imageHeight': height, 'detections': detections}
    return result, encoded.tobytes()


def download_photo(job, api):
    from urllib.parse import urlparse
    url = job['imageUrl']
    # Do not let a queue row redirect the device into its LAN or another host.
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc != urlparse(api.url).netloc or not parsed.path.startswith('/storage/v1/object/sign/evidence/'):
        raise ValueError('Unexpected photo download origin.')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError('Photo download redirects are disabled.')
    with urllib.request.build_opener(NoRedirect).open(url, timeout=25) as response:
        raw = response.read(5_000_001)
    if len(raw) > 5_000_000:
        raise ValueError('Photo is larger than 5 MB.')
    return raw


def process_job(api, model, job, confidence=0.30):
    try:
        result, annotation = infer_photo(model, download_photo(job, api), confidence)
        evidence = api.call('uploadEvidence', {'eventId': f"inference-{job['id']}-result",
            'image': base64.b64encode(annotation).decode()})
        result['annotatedPath'] = evidence['path']
        # Stable IDs and a lease-attempt fence make completion retries idempotent.
        payload = {'id': job['id'], 'attempt': job['attempts'], 'result': result}
        for attempt in range(3):
            try:
                api.call('finishInference', payload)
                break
            except (OSError, RuntimeError):
                if attempt == 2:
                    raise
                time.sleep(2)
        print(json.dumps({'job': job['id'], 'status': 'completed', 'potholes': len(result['detections']), 'inferenceMs': result['inferenceMs']}), flush=True)
    except Exception as error:
        try:
            api.call('finishInference', {'id': job['id'], 'attempt': job['attempts'],
                'error': 'Photo processing failed: ' + type(error).__name__ + '. Retry with a clear JPEG image.'})
        except (OSError, RuntimeError):
            pass  # The lease expires and another attempt can claim this job.
        print(json.dumps({'job': job['id'], 'status': 'failed', 'errorType': type(error).__name__}), flush=True)


def main():
    import fcntl
    from ultralytics import YOLO
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', default='/opt/vizor/output/models/rdd2022-yolov8n/pothole-640_ncnn_model')
    parser.add_argument('--confidence', type=float, default=0.30)
    parser.add_argument('--poll-seconds', type=float, default=5)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--self-test', type=Path)
    parser.add_argument('--output', type=Path, default=Path('photo-result.jpg'))
    args = parser.parse_args()
    if not 0.05 <= args.confidence <= 1 or args.poll_seconds < 2:
        parser.error('Confidence must be 0.05–1; polling must be at least 2 seconds.')
    model = YOLO(args.model, task='detect')
    pothole_classes(model)
    if args.self_test:
        result, image = infer_photo(model, args.self_test.read_bytes(), args.confidence)
        args.output.write_bytes(image)
        print(json.dumps(result))
        return
    lock = open(os.environ.get('VIZOR_PHOTO_LOCK', '/tmp/vizor-photo-worker.lock'), 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    api = CloudApi()
    heartbeat = 0
    while True:
        try:
            if time.monotonic() - heartbeat > 30:
                api.call('workerHeartbeat', {'modelRevision': REVISION})
                heartbeat = time.monotonic()
            job = api.call('claimInference')
            if job:
                process_job(api, model, job, args.confidence)
            elif not args.once:
                time.sleep(args.poll_seconds)
        except (OSError, RuntimeError) as error:
            print('Cloud unavailable; queued jobs remain in Supabase. ' + type(error).__name__, flush=True)
            if not args.once:
                time.sleep(15)
        if args.once:
            break


if __name__ == '__main__':
    main()
