# Pinned pretrained pothole assets

The pinned source weights are `output/models/rdd2022-yolov8n/best.pt`; the edge runner defaults to the Nano640 NCNN export; pothole is class **3**, not class 0. Crack classes must not trigger pothole alerts. `manifest.json` fixes both model revisions and validates checkpoints before loading them.

```bash
uv python install 3.11
uv venv --python 3.11 vision-ai/model_assets/.venv
uv pip install --python vision-ai/model_assets/.venv/bin/python torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv pip install --python vision-ai/model_assets/.venv/bin/python ultralytics==8.3.228 huggingface-hub 'onnx==1.19.1' onnxruntime onnxslim ncnn pnnx
python vision-ai/model_assets/download.py
YOLO_AUTOINSTALL=False vision-ai/model_assets/.venv/bin/python vision-ai/model_assets/evaluate.py
python -m unittest discover -s vision-ai/model_assets -p 'test_*.py'
```

`requirements-lock.txt` records the installed versions (CPU PyTorch requires the CPU registry shown above). Export artifacts are generated at 320, 416 and 640 pixels. Evaluation chooses confidence on validation samples only, then reports test precision/recall at IoU 0.5; it is a small diagnostic and not a performance guarantee. The checkpoint author's full-set pothole mAP@50 is 70.76% (Nano) and 73.77% (Small), at the author's settings; these are not Vizor hardware measurements.

`output/evaluation/subset.json` records fixed sample provenance and hashes. `report.json` records actual local diagnostic results and export comparison. `india-pothole-source.jpg` and `india-pothole-inference.jpg` are real 640px test-image inference, not video or GPS recordings. `pothole-detection-inference.jpg` uses416px on a China MotorBike test image. Read `NOTICE.md` before sharing images or distributing models.
