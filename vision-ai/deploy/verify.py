#!/usr/bin/env python3
"""Verify the installed model bundle without a camera, GNSS, MCU or cloud account."""
import argparse
import gc
import hashlib
import json
import os
import platform
from pathlib import Path
import statistics
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--require-arm64', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.require_arm64 and platform.machine() not in ('aarch64', 'arm64'):
        raise SystemExit('This check must run on the ARM64 board, not the development host.')
    os.environ['YOLO_AUTOINSTALL'] = 'False'
    os.environ['OMP_NUM_THREADS'] = '4'
    import cv2
    import numpy
    import torch
    import ultralytics
    from ultralytics import YOLO

    torch.set_num_threads(4)
    cv2.setNumThreads(4)
    output = root / 'verification'
    output.mkdir(exist_ok=True)
    models = root / 'output/models/rdd2022-yolov8n'
    checkpoint = models / 'best.pt'
    expected = 'd1c3536d8e4a873b7ff251d1cb81c0047100f06c86f92e08596de2d618618a3e'
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == expected, 'Checkpoint checksum mismatch'
    for name, item in json.loads((root / 'SHA256.json').read_text()).items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == item['sha256'], name
    image = cv2.imread(str(root / 'samples/india-pothole-source.jpg'))
    assert image is not None, 'Cannot decode real RDD2022 sample'
    report = {
        'machine': platform.machine(), 'python': platform.python_version(),
        'versions': {'opencv': cv2.__version__, 'numpy': numpy.__version__,
                     'torch': torch.__version__, 'ultralytics': ultralytics.__version__},
        'checkpoint_sha256': expected, 'threads': 4, 'confidence': .30,
        'input': 'Recorded RDD2022 Indian still; no live camera, GPS, IMU or battery',
        'replay_alert_gates': {'lane_margin': 0, 'area_threshold': 200,
                               'reason': 'The fixture pothole is outside the default center lane; production defaults are unchanged.'},
        'benchmarks': [],
    }
    thermal = Path('/sys/class/thermal/thermal_zone0/temp')
    if thermal.exists():
        report['temperature_before_celsius'] = int(thermal.read_text()) / 1000
    predictions = {}
    for name, size in [('best.pt', 640), ('pothole-320_ncnn_model', 320),
                       ('pothole-416_ncnn_model', 416), ('pothole-640_ncnn_model', 640)]:
        model = YOLO(str(models / name), task='detect')
        assert str(model.names[3]).lower() == 'pothole', 'Incorrect class map'
        options = dict(source=image, imgsz=size, conf=.30, classes=[3], rect=False, verbose=False)
        model.predict(**options)
        durations = []
        for _ in range(3):
            start = time.perf_counter()
            result = model.predict(**options)[0]
            durations.append((time.perf_counter() - start) * 1000)
        boxes = result.boxes.data.cpu().tolist()
        assert all(int(box[5]) == 3 for box in boxes), 'Cracks must not become pothole alerts'
        predictions[name] = boxes
        entry = {'model': name, 'imgsz': size, 'potholes': len(boxes),
                 'median_prediction_ms': statistics.median(durations), 'samples_ms': durations}
        report['benchmarks'].append(entry)
        if name == 'pothole-640_ncnn_model':
            assert boxes, 'Default model missed the known diagnostic pothole sample'
            assert cv2.imwrite(str(output / 'india-pothole-detection.jpg'), result.plot())
        print(json.dumps(entry), flush=True)
        del model, result
        gc.collect()
    # Match 640px detections by overlap rather than assuming a stable box order.
    baseline = predictions['best.pt']
    exported = predictions['pothole-640_ncnn_model']
    assert len(baseline) == len(exported) > 0, 'Export detection count differs'
    remaining = list(exported)
    for box in baseline:
        def overlap(other):
            area = max(0, min(box[2], other[2]) - max(box[0], other[0])) * max(0, min(box[3], other[3]) - max(box[1], other[1]))
            union = (box[2]-box[0])*(box[3]-box[1]) + (other[2]-other[0])*(other[3]-other[1]) - area
            return area / union if union > 0 else 0
        match = max(remaining, key=overlap)
        assert overlap(match) >= .90 and abs(box[4] - match[4]) <= .03, 'Export parity failed'
        remaining.remove(match)
    video = output / 'recorded-still.avi'
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'MJPG'), 6, (image.shape[1], image.shape[0]))
    assert writer.isOpened(), 'OpenCV MJPEG encoder unavailable'
    for _ in range(6):
        writer.write(image)
    writer.release()
    events = output / 'events.jsonl'
    process = subprocess.run([
        sys.executable, str(root / 'vision-ai/bpi_inference.py'), '--headless',
        '--model', str(models / 'pothole-640_ncnn_model'), '--camera', str(video),
        '--outbox', str(output / 'outbox.sqlite3'), '--events-out', str(events),
        '--imgsz', '640', '--conf', '.30', '--threads', '4',
        '--lane-margin', '0', '--area-threshold', '200',
    ], capture_output=True, text=True, timeout=600,
        env={key: value for key, value in os.environ.items() if not key.startswith('VIZOR_')})
    (output / 'runner.log').write_text(process.stdout + process.stderr)
    assert process.returncode == 0, 'Recorded runner failed; see verification/runner.log'
    observations = [json.loads(line)['observation'] for line in events.read_text().splitlines()]
    assert observations, 'No real inference observations emitted'
    assert all(row['source'] == 'replay' and row['location'] is None for row in observations), 'Recorded input must not create live locations'
    report['recorded_video_observations'] = len(observations)
    report['export_parity'] = 'passed on the diagnostic sample at 640px'
    if thermal.exists():
        report['temperature_after_celsius'] = int(thermal.read_text()) / 1000
    report['status'] = 'passed'
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Passed. Results: ' + str(output / 'report.json'))


if __name__ == '__main__':
    main()
