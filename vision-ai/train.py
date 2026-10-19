"""
Pothole Detection Model Training & Export Script for Banana Pi M4
Uses Ultralytics YOLOv8-nano and exports to NCNN & ONNX formats.

Beyond the base IVCNZ dataset, this script can merge in any number of extra
YOLO-format datasets (--extra-data, repeatable) so the model can be trained
on many more images than the built-in downloader alone provides. After
training it also calibrates the deployed confidence threshold by sweeping
val-set precision/recall instead of guessing a fixed value.
"""

import argparse
import glob
import json
import os
import shutil
import urllib.request
import zipfile

import yaml
from sklearn.model_selection import train_test_split
from ultralytics import YOLO

DATASET_URL = "https://github.com/jaygala24/pothole-detection/releases/download/v1.0.0/Pothole.Dataset.IVCNZ.zip"
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp")


# --------------------------------------------------------------------------- #
# Dataset collection & merging
# --------------------------------------------------------------------------- #

def _download_primary_dataset(raw_dir="raw_data"):
    """Download & extract the built-in IVCNZ pothole dataset if needed.

    Returns a list of (image_path, label_path) pairs; label_path may not exist
    on disk (background images without a matching .txt are dropped later).
    """
    flat_dir = os.path.join(raw_dir, "Pothole Dataset")
    if not os.path.isdir(flat_dir):
        zip_path = "potholes.zip"
        print("Downloading IVCNZ Pothole Dataset... ⏳")
        urllib.request.urlretrieve(DATASET_URL, zip_path)

        print("Extracting files... \U0001f4c2")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(raw_dir)

        if os.path.exists(zip_path):
            os.remove(zip_path)

    images = sorted(glob.glob(os.path.join(flat_dir, "*.jpg")))
    return [(img, os.path.splitext(img)[0] + ".txt") for img in images]


def _label_path_for_image(img_path):
    """Mirror Ultralytics' images/ -> labels/ convention for an image path.

    Falls back to a same-directory .txt file when the path has no "images"
    segment (e.g. a flat dataset folder).
    """
    parts = img_path.replace("\\", "/").split("/")
    for i in range(len(parts) - 1, -1, -1):
        if parts[i] == "images":
            parts[i] = "labels"
            return os.path.splitext("/".join(parts))[0] + ".txt"
    return os.path.splitext(img_path)[0] + ".txt"


def _collect_yaml_dataset_images(yaml_path):
    """Collect (image_path, label_path) pairs for every split in a YOLO data.yaml."""
    with open(yaml_path) as f:
        data = yaml.safe_load(f)

    yaml_dir = os.path.dirname(os.path.abspath(yaml_path))
    base = data.get("path")
    base = os.path.join(yaml_dir, base) if base else yaml_dir

    pairs = []
    for split_key in ("train", "val", "valid", "test"):
        split_value = data.get(split_key)
        if not split_value:
            continue
        for split_dir in (split_value if isinstance(split_value, list) else [split_value]):
            abs_dir = os.path.normpath(os.path.join(base, split_dir))
            if not os.path.isdir(abs_dir):
                print(f"[WARN] {yaml_path}: split dir not found, skipping: {abs_dir}")
                continue
            for img_path in sorted(glob.glob(os.path.join(abs_dir, "*"))):
                if os.path.splitext(img_path)[1].lower() in IMAGE_EXTENSIONS:
                    pairs.append((img_path, _label_path_for_image(img_path)))

    return pairs, data.get("names")


def _validate_single_class(names, source_label):
    """This project trains a single-class 'pothole' detector; refuse to silently
    merge in a multi-class dataset, which would mislabel non-pothole classes."""
    if names is None:
        print(f"[WARN] {source_label}: data.yaml has no 'names'; assuming single-class pothole (id 0).")
        return
    count = len(names)
    if count != 1:
        raise SystemExit(
            f"[ERROR] {source_label} declares {count} classes ({names}), but this project "
            "trains a single-class 'pothole' detector. Filter/re-export it to a single "
            "'pothole' class (id 0) before passing it via --extra-data."
        )


def _frange(start, stop, step):
    values = []
    x = start
    while x <= stop + 1e-9:
        values.append(round(x, 6))
        x += step
    return values


def _split_pairs(pairs, val_split, test_split, seed):
    """Split a combined pool into train/val/test so val_split and test_split are
    fractions of the *whole* pool, not of what's left after carving off test."""
    if test_split > 0:
        train_val, test = train_test_split(pairs, test_size=test_split, random_state=seed)
    else:
        train_val, test = pairs, []

    relative_val = val_split / (1.0 - test_split)
    train, val = train_test_split(train_val, test_size=relative_val, random_state=seed)
    return train, val, test


def _write_split(data_dir, split_name, tagged_pairs):
    """tagged_pairs: list of (source_prefix, image_path, label_path)."""
    img_dir = os.path.join(data_dir, "images", split_name)
    lbl_dir = os.path.join(data_dir, "labels", split_name)
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(lbl_dir, exist_ok=True)

    for prefix, img_path, lbl_path in tagged_pairs:
        # Prefix every file with its source so images with the same generic
        # filename from two different datasets (e.g. "img_001.jpg") never collide.
        dest_stem = f"{prefix}_{os.path.splitext(os.path.basename(img_path))[0]}"
        dest_img = dest_stem + os.path.splitext(img_path)[1]
        shutil.copy(img_path, os.path.join(img_dir, dest_img))
        if os.path.exists(lbl_path):
            shutil.copy(lbl_path, os.path.join(lbl_dir, dest_stem + ".txt"))


def prepare_dataset(args):
    data_dir = args.data_dir
    if os.path.exists(os.path.join(data_dir, "data.yaml")):
        print(f"Dataset already exists at {data_dir}. Skipping download/merge.")
        if args.extra_data:
            print(f"[WARN] --extra-data given but {data_dir}/ already exists; "
                  f"delete it first to rebuild the merged dataset with the new sources.")
        return os.path.abspath(os.path.join(data_dir, "data.yaml"))

    primary_pairs = _download_primary_dataset()
    tagged_pairs = [("primary", img, lbl) for img, lbl in primary_pairs]

    for i, extra_yaml in enumerate(args.extra_data):
        extra_pairs, extra_names = _collect_yaml_dataset_images(extra_yaml)
        _validate_single_class(extra_names, extra_yaml)
        if not extra_pairs:
            print(f"[WARN] No images found for --extra-data {extra_yaml}; skipping.")
            continue
        prefix = f"extra{i}"
        tagged_pairs += [(prefix, img, lbl) for img, lbl in extra_pairs]
        print(f"[INFO] Merged {len(extra_pairs)} images from {extra_yaml} (prefix '{prefix}_').")

    if not tagged_pairs:
        raise SystemExit("[ERROR] No images found to train on.")

    print(f"[INFO] Combined pool: {len(tagged_pairs)} images "
          f"({len(primary_pairs)} primary + {len(tagged_pairs) - len(primary_pairs)} from --extra-data).")

    train_pairs, val_pairs, test_pairs = _split_pairs(
        tagged_pairs, args.val_split, args.test_split, args.seed
    )
    for split_name, split_pairs in (("train", train_pairs), ("val", val_pairs), ("test", test_pairs)):
        _write_split(data_dir, split_name, split_pairs)
        print(f"[INFO] {split_name}: {len(split_pairs)} images")

    yaml_lines = [
        f"path: {os.path.abspath(data_dir)}",
        "train: images/train",
        "val: images/val",
    ]
    if test_pairs:
        yaml_lines.append("test: images/test")
    yaml_lines += ["names:", "  0: pothole"]

    yaml_path = os.path.join(data_dir, "data.yaml")
    with open(yaml_path, "w") as f:
        f.write("\n".join(yaml_lines) + "\n")

    print("Dataset setup completed! ✅")
    return os.path.abspath(yaml_path)


# --------------------------------------------------------------------------- #
# Confidence-threshold calibration
# --------------------------------------------------------------------------- #

def calibrate_confidence(model, yaml_path, imgsz, split, thresholds, fallback=0.5):
    """Sweep confidence thresholds on `split` and return the one maximizing F1.

    Guarded with a broad except: this runs after a (possibly hours-long)
    training run, so a validator API quirk on the user's installed ultralytics
    version should degrade to the fallback threshold rather than lose the run.
    """
    sweep = []
    best_threshold, best_f1 = fallback, -1.0
    try:
        for conf in thresholds:
            metrics = model.val(data=yaml_path, imgsz=imgsz, conf=conf, split=split,
                                 plots=False, verbose=False)
            precision = float(metrics.box.p[0]) if len(metrics.box.p) else 0.0
            recall = float(metrics.box.r[0]) if len(metrics.box.r) else 0.0
            f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
            sweep.append({
                "conf": conf, "precision": precision, "recall": recall,
                "f1": f1, "map50": float(metrics.box.map50),
            })
            if f1 > best_f1:
                best_f1, best_threshold = f1, conf
    except Exception as exc:
        print(f"[WARN] Confidence calibration sweep failed ({exc}); falling back to conf={fallback}.")
        return fallback, sweep

    if not sweep:
        return fallback, sweep
    return best_threshold, sweep


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 Pothole Model for Banana Pi M4")

    dataset = parser.add_argument_group("dataset")
    dataset.add_argument("--data-dir", type=str, default="dataset",
                          help="Where the merged dataset is written (default: dataset)")
    dataset.add_argument("--extra-data", action="append", default=[], metavar="DATA_YAML",
                          help="Path to an additional YOLO-format data.yaml to merge in "
                               "(repeatable). Must be single-class pothole; filter/re-export "
                               "multi-class sources before passing them here.")
    dataset.add_argument("--val-split", type=float, default=0.2,
                          help="Fraction of the combined pool used for validation (default 0.2)")
    dataset.add_argument("--test-split", type=float, default=0.1,
                          help="Fraction of the combined pool held out as a final test set, "
                               "never used for training or confidence calibration (default 0.1)")
    dataset.add_argument("--seed", type=int, default=42, help="Split/shuffle random seed")

    training = parser.add_argument_group("training")
    training.add_argument("--epochs", type=int, default=100, help="Max training epochs")
    training.add_argument("--patience", type=int, default=25,
                           help="Stop early after this many epochs with no val mAP improvement")
    training.add_argument("--imgsz", type=int, default=416, help="Image size (default 416 for BPI-M4)")
    training.add_argument("--batch", type=int, default=16, help="Batch size")
    training.add_argument("--model", type=str, default="yolov8n.pt", help="Base model weights")
    training.add_argument("--device", type=str, default="0", help="CUDA device or 'cpu'")
    training.add_argument("--optimizer", type=str, default="AdamW",
                           help="SGD/Adam/AdamW/NAdam/RAdam/RMSProp/auto (default AdamW)")
    training.add_argument("--cos-lr", action=argparse.BooleanOptionalAction, default=True,
                           help="Cosine LR schedule (default on)")
    training.add_argument("--degrees", type=float, default=5.0, help="Random rotation augmentation, +/- deg")
    training.add_argument("--mixup", type=float, default=0.1, help="Mixup augmentation probability")
    training.add_argument("--copy-paste", type=float, default=0.0, help="Copy-paste augmentation probability")

    calibration = parser.add_argument_group("confidence calibration")
    calibration.add_argument("--conf-sweep-min", type=float, default=0.15)
    calibration.add_argument("--conf-sweep-max", type=float, default=0.85)
    calibration.add_argument("--conf-sweep-step", type=float, default=0.05)

    args = parser.parse_args()
    if not 0 < args.val_split < 1 or not 0 <= args.test_split < 1 or args.val_split + args.test_split >= 1:
        raise SystemExit("[ERROR] --val-split and --test-split must be within (0,1) and sum to < 1.")

    yaml_path = prepare_dataset(args)

    print(f"\n--- Starting Training ({args.model}) ---")
    model = YOLO(args.model)
    model.train(
        data=yaml_path,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        name="pothole_model",
        device=args.device,
        patience=args.patience,
        optimizer=args.optimizer,
        cos_lr=args.cos_lr,
        degrees=args.degrees,
        mixup=args.mixup,
        copy_paste=args.copy_paste,
        seed=args.seed,
    )

    best_weights = "runs/detect/pothole_model/weights/best.pt"
    best_model = YOLO(best_weights)

    print("\n--- Calibrating confidence threshold on the validation split ---")
    thresholds = _frange(args.conf_sweep_min, args.conf_sweep_max, args.conf_sweep_step)
    best_conf, sweep = calibrate_confidence(best_model, yaml_path, args.imgsz, "val", thresholds)
    calibrated = next((s for s in sweep if s["conf"] == best_conf), None)
    if calibrated:
        print(f"[INFO] Calibrated confidence threshold: {best_conf} "
              f"(val F1={calibrated['f1']:.3f}, P={calibrated['precision']:.3f}, R={calibrated['recall']:.3f})")
    else:
        print(f"[INFO] Using fallback confidence threshold: {best_conf}")

    has_test = bool(args.test_split > 0)
    final_split = "test" if has_test else "val"
    print(f"\nEvaluating Best Model on '{final_split}' split at conf={best_conf}: {best_weights}")
    metrics = best_model.val(data=yaml_path, imgsz=args.imgsz, conf=best_conf, split=final_split)

    print("\n" + "=" * 45)
    print("\U0001f3af EVALUATION RESULTS" + (" (held-out test set)" if has_test else " (validation set)"))
    print("=" * 45)
    print(f"Confidence threshold : {best_conf} (calibrated for best F1 on val)")
    print(f"Precision : {metrics.box.p[0]*100:.2f}%")
    print(f"Recall    : {metrics.box.r[0]*100:.2f}%")
    print(f"mAP@50    : {metrics.box.map50*100:.2f}%")
    print("=" * 45)

    print("\n--- Exporting for Banana Pi BPI-M4 ---")
    print("1. Exporting to NCNN (fastest for ARM NEON CPUs)...")
    best_model.export(format="ncnn", imgsz=args.imgsz)

    print("2. Exporting to ONNX (graph-simplified)...")
    best_model.export(format="onnx", imgsz=args.imgsz, simplify=True)

    weights_dir = os.path.dirname(best_weights)
    metadata = {
        "base_model": args.model,
        "imgsz": args.imgsz,
        "epochs": args.epochs,
        "dataset_yaml": yaml_path,
        "calibrated_conf_threshold": best_conf,
        "confidence_sweep": sweep,
        f"{final_split}_metrics_at_calibrated_conf": {
            "precision": float(metrics.box.p[0]),
            "recall": float(metrics.box.r[0]),
            "map50": float(metrics.box.map50),
            "split": final_split,
        },
    }
    metadata_path = os.path.join(weights_dir, "model_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"[INFO] Wrote calibration metadata to {metadata_path}")

    # bpi_inference.py is normally pointed at the NCNN export directory itself
    # (`--model best_ncnn_model`), so the metadata needs to travel inside it.
    ncnn_dir = os.path.join(weights_dir, "best_ncnn_model")
    if os.path.isdir(ncnn_dir):
        shutil.copy(metadata_path, os.path.join(ncnn_dir, "model_metadata.json"))
        print(f"[INFO] Copied metadata into {ncnn_dir}/ for Banana Pi deployment.")

    print("\nExports complete. Ready for Banana Pi deployment! \U0001f680")


if __name__ == "__main__":
    main()
