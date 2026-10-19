"""Diagnostic pothole evaluation, validation-only threshold choice, and export parity."""
import json
import hashlib
import os
from pathlib import Path
import platform
import shutil
import statistics
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/evaluation'
MODELS = ROOT / 'output/models'


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection / union if union else 0


def metrics(samples, predictions, threshold):
    tp = fp = fn = negative_frames = false_positive_frames = 0
    for sample in samples:
        gt = [[x, y, x+w, y+h] for (x,y,w,h), cls in zip(sample['objects']['bbox'], sample['objects']['categories']) if cls == 3]
        detections = sorted([p for p in predictions[sample['file_name']] if p[4] >= threshold], key=lambda p: -p[4])
        unmatched = set(range(len(gt)))
        for prediction in detections:
            best = max(unmatched, key=lambda i: iou(prediction,gt[i]), default=None)
            if best is not None and iou(prediction, gt[best]) >= 0.5:
                tp += 1
                unmatched.remove(best)
            else:
                fp += 1
        fn += len(unmatched)
        if not gt:
            negative_frames += 1
            false_positive_frames += bool(detections)
    precision = tp/(tp+fp) if tp+fp else 0
    recall = tp/(tp+fn) if tp+fn else 0
    return dict(tp=tp, fp=fp, fn=fn, precision=precision, recall=recall, f1=2*precision*recall/(precision+recall) if precision+recall else 0, negative_frames=negative_frames, false_positive_frames=false_positive_frames)


def run_predictions(model, samples, size, threshold=0.01):
    predictions, timings = {}, []
    for sample in samples:
        image = OUT / 'dataset/images' / sample['split'] / sample['file_name']
        start = time.perf_counter()
        result = model.predict(str(image), imgsz=size, conf=threshold, classes=[3], device='cpu', verbose=False)[0]
        timings.append((time.perf_counter()-start)*1000)
        predictions[sample['file_name']] = [list(map(float, b.xyxy[0])) + [float(b.conf[0])] for b in result.boxes]
    return predictions, timings


def main():
    import cv2
    import torch
    os.environ['YOLO_AUTOINSTALL'] = 'False'
    os.environ.setdefault('YOLO_CONFIG_DIR', str(OUT / '.ultralytics'))
    from ultralytics import YOLO
    torch.set_num_threads(2)
    cv2.setNumThreads(2)
    samples = json.loads((OUT / 'subset.json').read_text())['samples']
    valid = [s for s in samples if s['split'] == 'valid']
    test = [s for s in samples if s['split'] == 'test']
    report = dict(host=platform.platform(), cpu=platform.processor(), torch_threads=2, note='Small stratified diagnostic subset. IoU >= 0.5; confidence selected only on validation. Latencies include loading/preprocessing/postprocessing on this host and do not measure Banana Pi.', models={}, exports=[])
    for name, sizes in [('rdd2022-yolov8n', [320,416,640]), ('rdd2022-yolov8s',[416,640])]:
        model = YOLO(str(MODELS/name/'best.pt'))
        assert model.names[3] == 'pothole', model.names
        for size in sizes:
            predictions, timings = run_predictions(model, samples, size)
            thresholds = [round(t/100, 2) for t in range(10, 81, 5)]
            chosen = max(thresholds, key=lambda t:(metrics(valid,predictions,t)['f1'],t))
            key = f'{name}-{size}'
            report['models'][key] = dict(imgsz=size, threshold=chosen, validation=metrics(valid,predictions,chosen), test=metrics(test,predictions,chosen), host_median_wall_ms=statistics.median(timings[1:]), test_by_country={country:metrics([s for s in test if s['country']==country],predictions,chosen) for country in sorted({s['country'] for s in test})})
            (OUT / f'{key}-predictions.json').write_text(json.dumps(predictions,indent=2))
            (OUT/'report.json').write_text(json.dumps(report,indent=2))
            print(key, json.dumps(report['models'][key]), flush=True)
        del model
    nano = YOLO(str(MODELS/'rdd2022-yolov8n/best.pt'))
    for size in [320,416,640]:
        for fmt in ['onnx','ncnn']:
            exported = Path(nano.export(format=fmt, imgsz=size, device='cpu', half=False, simplify=True, opset=12))
            target = MODELS/'rdd2022-yolov8n'/f'pothole-{size}{".onnx" if fmt=="onnx" else "_ncnn_model"}'
            if target.exists():
                shutil.rmtree(target) if target.is_dir() else target.unlink()
            shutil.move(str(exported),target)
            candidates = [s for s in test if s['country']=='India' and s['group']=='pothole'][:2] + [s for s in test if s['group']=='clean'][:2]
            reference,_ = run_predictions(nano,candidates,size,0.25)
            alternate,_ = run_predictions(YOLO(str(target),task='detect'),candidates,size,0.25)
            differences = []
            for sample in candidates:
                a,b = reference[sample['file_name']],alternate[sample['file_name']]
                matched = []
                available = list(b)
                for prediction in a:
                    best = max(available,key=lambda p:iou(prediction,p),default=None)
                    if best:
                        matched.append(dict(iou=iou(prediction,best), confidence_delta=abs(prediction[4]-best[4])))
                        available.remove(best)
                differences.append(dict(file=sample['file_name'], reference_count=len(a), export_count=len(b), matches=matched))
            report['exports'].append(dict(format=fmt,imgsz=size,path=str(target.relative_to(ROOT)),parity=differences, passed=all(d['reference_count']==d['export_count']==len(d['matches']) and all(m['iou']>=0.95 and m['confidence_delta']<=0.005 for m in d['matches']) for d in differences)))
            (OUT/'report.json').write_text(json.dumps(report,indent=2))
    # Real inference on a labelled test image; no invented GPS coordinates.
    sample = next(s for s in test if s['country']=='India' and s['group']=='pothole')
    image = OUT/'dataset/images/test'/sample['file_name']
    result = nano.predict(str(image),imgsz=640,conf=report['models']['rdd2022-yolov8n-640']['threshold'],classes=[3],verbose=False)[0]
    result.save(filename=str(OUT/'india-pothole-inference.jpg'))
    shutil.copyfile(image,OUT/'india-pothole-source.jpg')
    (OUT/'demo-provenance.json').write_text(json.dumps(dict(sample=sample, checkpoint='rdd2022-yolov8n',imgsz=640, source_is_still_image=True, location=None, note='RDD2022 test still, not a live ride. Original CC BY-SA 4.0 attribution applies.'),indent=2))
    example = next(s for s in test if s['country']=='China_MotorBike' and s['group']=='pothole')
    source = OUT/'dataset/images/test'/example['file_name']
    demo_result = nano.predict(str(source),imgsz=416,conf=report['models']['rdd2022-yolov8n-416']['threshold'],classes=[3],verbose=False)[0]
    demo_result.save(filename=str(OUT/'pothole-detection-inference.jpg'))
    shutil.copyfile(source,OUT/'pothole-detection-source.jpg')
    (OUT/'detection-provenance.json').write_text(json.dumps(dict(sample=example, checkpoint='rdd2022-yolov8n',imgsz=416, source_is_still_image=True,location=None,note='Real inference on an RDD2022 China MotorBike test still, not an Indian live ride. CC BY-SA 4.0.'),indent=2))
    (OUT/'report.json').write_text(json.dumps(report,indent=2))
    assets = [dict(path=str(p.relative_to(ROOT)), sha256=hashlib.sha256(p.read_bytes()).hexdigest(), bytes=p.stat().st_size) for p in sorted(MODELS.rglob('*')) if p.is_file() and p.name != 'artifacts.json']
    (MODELS/'artifacts.json').write_text(json.dumps(assets,indent=2))


if __name__ == '__main__':
    main()
