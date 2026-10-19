# Model and evaluation assets

The repository's application license does not replace third-party licenses.

- **YOLOv8 Nano/Small RDD2022 checkpoints**: dronefreak / DetectionBench, based on Ultralytics YOLOv8. Model cards declare **AGPL-3.0**. Pinned repositories, revisions and SHA-256 values are in `manifest.json`. Model cards are downloaded alongside checkpoints. Exports are derived from those checkpoints and retain the same notice. AGPL terms may affect distribution/service use; do not describe these weights as MIT-licensed.
- **RDD2022 sample images and annotations**: Deeksha Arya, Hiroya Maeda, Sanjay Kumar Ghosh, Durga Toshniwal, and Yoshihide Sekimoto. *RDD2022: A multi-national image dataset for automatic Road Damage Detection* (2022), https://arxiv.org/abs/2209.08538. Unofficial YOLO-format redistribution by dronefreak, https://huggingface.co/datasets/dronefreak/RDD2022, pinned in the manifest. **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/. Derived annotated demo images retain CC BY-SA 4.0. Modifications: resized/annotated with model predictions; originals remain available with provenance in `output/evaluation`.
- **Framework**: Glenn Jocher, Ayush Chaurasia, Jing Qiu, Ultralytics YOLOv8, https://github.com/ultralytics/ultralytics, AGPL-3.0.

The selected samples are diagnostic validation/test subsets of the redistribution's held-out split, not the official competition's unlabeled test set. Images contain no supplied GPS coordinates; never attach the computer's live GPS or invented coordinates to these detections as real observations.
