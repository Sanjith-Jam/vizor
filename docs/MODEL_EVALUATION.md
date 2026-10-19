# Pretrained pothole model verification

Completed on 14 October 2026. This is a diagnostic software check, not a riding-safety validation or an official RDD2022 benchmark.

## Assets and reproducibility

Downloaded and SHA-256-verified both pinned checkpoints from `vision-ai/model_assets/manifest.json`. No training or fine-tuning was performed. Model cards are retained beside the checkpoints. Nano pothole class is **3**; classes 0–2 are cracks.

- `output/models/rdd2022-yolov8n/best.pt`: default pretrained Nano weights.
- `output/models/rdd2022-yolov8s/best.pt`: Small comparison weights.
- Nano exports: `pothole-{320,416,640}.onnx` (FP32, opset12) and `pothole-{320,416,640}_ncnn_model/` (FP32).
- `output/models/artifacts.json`: generated artifact SHA-256 checksums.
- Isolated host environment: `vision-ai/model_assets/.venv/bin/python` (Python 3.11.17). Exact packages in `vision-ai/model_assets/requirements-lock.txt`. This is a host evaluation environment, not a tested Banana Pi installation lock.
- Reproduction and downloading instructions: [model assets README](../vision-ai/model_assets/README.md).

## Diagnostic design

Pinned dataset: `dronefreak/RDD2022` revision `72b01f94c2e5bfe430861afd73995f2d412b8855`. Downloaded 36 validation and 36 held-out test images, not the full dataset. Selection uses a fixed seeded sample of up to 2 images per available country/capture group and category: pothole, no in-taxonomy annotations, and non-pothole damage. Included China Drone, China MotorBike, Czech, India, Japan, Norway and United States. Only 4 of these groups have pothole annotations in this subset. There are 10 validation potholes and 8 test potholes; the 28 negative test frames are heavily represented. This sample is deliberately stratified, not representative of real-world class frequency.

Predictions are restricted to class 3. Match each prediction to a unique ground-truth box at IoU ≥ 0.5; count duplicate detections as false positives. Select confidence from 0.10–0.80 in 0.05 steps using validation F1 only; test images do not select thresholds. No mAP claim is made from this small subset. Raw predictions, split provenance, URLs and image/label hashes are in `output/evaluation/`.

## Measured results

| Model / input pixels | Validation-selected confidence | Test TP/FP/FN | Test precision | Test recall | Host median wall time |
|---|---:|---:|---:|---:|---:|
| rdd2022-yolov8n-320 | 0.50 | 4/0/4 | 100.0% | 50.0% | 14.5 ms |
| rdd2022-yolov8n-416 | 0.30 | 6/0/2 | 100.0% | 75.0% | 16.5 ms |
| rdd2022-yolov8n-640 | 0.30 | 8/4/0 | 66.7% | 100.0% | 30.6 ms |
| rdd2022-yolov8s-416 | 0.40 | 6/0/2 | 100.0% | 75.0% | 37.8 ms |
| rdd2022-yolov8s-640 | 0.35 | 6/1/2 | 85.7% | 75.0% | 68.5 ms |

Host: AMD Ryzen 9 270 with Radeon 780M Graphics, CPU inference, PyTorch/OpenCV limited to 2 threads. Wall time includes image loading, preprocessing and postprocessing; excludes the first image of each configuration. Host load varies. These numbers do not establish Banana Pi FPS or camera-to-OLED latency.

**India result matters:** at 320/416 px, both Indian test potholes were missed at the validation-selected thresholds. Nano 640px detected both; it also produced 4 false-positive boxes across the whole test subset (including 2 negative Japanese frames). Small 640px missed both Indian potholes. Use Nano 640/confidence0.30 as the India-sensitive demonstration candidate pending Banana Pi benchmarking. Treat416px as a performance candidate, not the recommended accuracy setting. Neither is validated for real riding.

A manual negative-frame inspection found road shadows/patches in `India_003535.jpg`, an off-road sidewalk manhole in `China_Drone_002189.jpg`, and asphalt repair seams in `Japan_003561.jpg`. No selected configuration raised a pothole above its calibrated threshold on those 3 frames. These are individual examples, not subgroup robustness measurements; the manhole is not a roadway-cover test. `negative-case-review.json` records the counts. Some positive source boxes encompass repaired-looking pavement; results follow supplied D40 annotations and cannot establish physical depth or severity.

## Export verification and demonstration assets

All 6 exports passed comparisons against original PyTorch weights on 4 test probes (2 Indian positive-labelled frames and 2 negative frames) at confidence0.25. Counts matched; every matched box had IoU>0.99999 and confidence difference<0.000002. This is limited functional parity, not exhaustive numeric equivalence. Full comparison is in `report.json`.

- `output/evaluation/india-pothole-source.jpg` and `india-pothole-inference.jpg`: actual Nano 640 inference on an Indian held-out still. At416px this frame is missed at confidence0.30.
- `output/evaluation/pothole-detection-source.jpg` and `pothole-detection-inference.jpg`: actual Nano 416 inference on a China MotorBike held-out still.
- `demo-provenance.json` and `detection-provenance.json`: source, split, checkpoint, image size and license. No GPS is available; location is explicitly null. These are still-image demonstrations, not live road recordings.
- `test-contact-sheet.jpg`: visual review of all 36 test frames.

Model download integrity and evaluation matching tests: **4 passed**. ONNX and NCNN inference was executed locally. This model-asset task did not check hardware. Later actual Pi and stationary GNSS acceptance is recorded in [HARDWARE.md](HARDWARE.md); moving camera/phone/OLED checks remain pending.

## Attribution and limitations

The checkpoint author's reported full-set pothole mAP@50 is 70.76% for Nano and 73.77% for Small; these are author-reported values at their evaluation settings, not Vizor measurements. Source model cards: https://huggingface.co/dronefreak/rdd2022-yolov8n and https://huggingface.co/dronefreak/rdd2022-yolov8s. Dataset: https://huggingface.co/datasets/dronefreak/RDD2022.

Weights/framework are **AGPL-3.0**, and source/annotated images are **CC BY-SA 4.0**. See [notices](../vision-ai/model_assets/NOTICE.md) and retained license texts. Do not apply the application's MIT license to these assets. Before public distribution or service use, account for their license obligations. No larger labelled helmet-camera evaluation, wet/night testing or local calibration was performed.
