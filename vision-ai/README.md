# Banana Pi inference

Two entry points share the pretrained pothole model:

| Entry point | Purpose |
| --- | --- |
| `photo_worker.py` | Owner-scoped cloud photo queue → real inference → private evidence/result |
| `bpi_inference.py` | Camera/video + GPS/IMU replay → observations, outbox and MCU UART |

Default model: pinned RDD2022 YOLOv8n, Nano640 NCNN, confidence 0.30, pothole/D40 class only. Smaller inputs missed the diagnostic Indian pothole. Do not treat cracks as pothole alerts or infer a safe steering direction from an image. [Pinned downloads/export/evaluation](model_assets/README.md); [measurements](../docs/MODEL_EVALUATION.md).

## Runtime

Use an isolated Python environment. Install CPU Torch/Torchvision compatible with the actual ARM64 OS/Python before `deploy/requirements.txt`; do not install both headless and normal OpenCV distributions into the same environment. The verified Pi installation and Wi-Fi/service instructions are in [Hardware](../docs/HARDWARE.md).

`model_assets/download.py` verifies checkpoint revisions/hashes and writes generated assets under `output/models/`. Export with the model-assets workflow before selecting an NCNN directory. Checkpoints are downloaded, not committed. The optional `train.py` helper is retained for experiments; retraining is not part of the default product.

## Cloud photo worker

Configure `.env.example` values in a root-owned mode-600 environment file on the board; register the device under the client account first. Install/adapt `deploy/vizor-photo.service` for `/opt/vizor`, its `helmet` user, venv and model export.

```sh
/opt/vizor/.venv/bin/python /opt/vizor/vision-ai/photo_worker.py --help
sudo systemctl status vizor-photo.service
```

The worker makes outbound HTTPS only, validates download origins/images and completion attempts, filters potholes, and uploads annotated JPEG evidence. It opens no Pi web port and owns no camera/GPS/MCU UART. A heartbeat is not sensor or BLE health. Complete operation: [Live demo](../docs/LIVE_DEMO.md).

## Camera and recorded input

```sh
python vision-ai/bpi_inference.py --help
python vision-ai/gps_sim7600x.py --mode at --once
```

Adapt the full-camera `deploy/vizor.service` to actual ports and credentials before enabling it. One process owns MCU serial; the modem AT/NMEA reader uses a different device. `edge_link.py` persists offline observations/evidence in SQLite and retries idempotently. Real camera/IMU/UART/OLED integration remains a physical acceptance stage. Replay must be labeled and excluded from live shared hazards.

## Checks

```sh
python -m unittest discover -s vision-ai -p 'test_*.py'
python -m unittest discover -s vision-ai/model_assets -p 'test_*.py'
# On the provisioned board:
cd /opt/vizor
.venv/bin/python vision-ai/deploy/verify.py --require-arm64
```

Logic tests stub heavy ML modules; install `pyyaml` and `scikit-learn` for the optional training-helper tests. `scripts/verify-photo-demo.py` reproduces real cloud/Pi acceptance using exported user credentials without putting secrets in command arguments. Licenses and attribution remain in `model_assets/`; the application's MIT license does not replace AGPL-3.0 or CC BY-SA obligations.
