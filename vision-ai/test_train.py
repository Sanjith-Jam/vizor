"""Unit tests for train.py's dataset-merging/splitting and confidence
calibration logic.

train.py imports ultralytics at module level for the actual training run,
which this test doesn't need (and doesn't want to require installed) to
exercise the pure dataset/calibration logic, so it's stubbed the same way
test_bpi_inference.py stubs cv2/ultralytics.
"""

import os
import shutil
import sys
import tempfile
import types
import unittest

if "ultralytics" not in sys.modules:
    fake_ultralytics = types.ModuleType("ultralytics")

    class _StubYOLO:
        def __init__(self, *args, **kwargs):
            pass

    fake_ultralytics.YOLO = _StubYOLO
    sys.modules["ultralytics"] = fake_ultralytics

import train  # noqa: E402


def _make_images(dir_path, n, label_text="0 0.5 0.5 0.2 0.2\n", start=0):
    os.makedirs(dir_path, exist_ok=True)
    pairs = []
    for i in range(start, start + n):
        img = os.path.join(dir_path, f"img_{i}.jpg")
        with open(img, "wb") as f:
            f.write(b"\xff\xd8\xff\xe0fakejpeg")
        lbl = os.path.splitext(img)[0] + ".txt"
        if label_text is not None:
            with open(lbl, "w") as f:
                f.write(label_text)
        pairs.append((img, lbl))
    return pairs


class FrangeTests(unittest.TestCase):
    def test_inclusive_endpoints_and_count(self):
        values = train._frange(0.15, 0.85, 0.05)
        self.assertEqual(len(values), 15)
        self.assertAlmostEqual(values[0], 0.15)
        self.assertAlmostEqual(values[-1], 0.85)


class CollectYamlDatasetImagesTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)

    def test_images_to_labels_path_resolution(self):
        root = os.path.join(self.tmpdir.name, "extra_ds")
        train_imgs = os.path.join(root, "images", "train")
        train_lbls = os.path.join(root, "labels", "train")
        _make_images(train_imgs, 6)
        os.makedirs(train_lbls, exist_ok=True)
        for fn in os.listdir(train_imgs):
            if fn.endswith(".txt"):
                shutil.move(os.path.join(train_imgs, fn), os.path.join(train_lbls, fn))

        yaml_path = os.path.join(root, "data.yaml")
        with open(yaml_path, "w") as f:
            f.write("path: .\ntrain: images/train\nnames:\n  0: pothole\n")

        pairs, names = train._collect_yaml_dataset_images(yaml_path)
        self.assertEqual(len(pairs), 6)
        self.assertEqual(names, {0: "pothole"})
        for img, lbl in pairs:
            self.assertTrue(os.path.isfile(lbl))
            self.assertIn("labels/train", lbl.replace("\\", "/"))


class ValidateSingleClassTests(unittest.TestCase):
    def test_rejects_multi_class(self):
        with self.assertRaises(SystemExit):
            train._validate_single_class({0: "pothole", 1: "crack"}, "fake.yaml")

    def test_accepts_single_class_or_missing_names(self):
        train._validate_single_class({0: "pothole"}, "ok.yaml")  # should not raise
        train._validate_single_class(None, "ok2.yaml")  # should not raise


class SplitPairsTests(unittest.TestCase):
    def test_split_proportions(self):
        pool = [("primary", f"img{i}.jpg", f"img{i}.txt") for i in range(100)]
        train_p, val_p, test_p = train._split_pairs(pool, val_split=0.2, test_split=0.1, seed=42)
        self.assertEqual(len(train_p), 70)
        self.assertEqual(len(val_p), 20)
        self.assertEqual(len(test_p), 10)
        all_ids = [p[1] for p in (train_p + val_p + test_p)]
        self.assertEqual(len(set(all_ids)), 100)

    def test_zero_test_split(self):
        pool = [("primary", f"img{i}.jpg", f"img{i}.txt") for i in range(100)]
        train_p, val_p, test_p = train._split_pairs(pool, val_split=0.25, test_split=0, seed=1)
        self.assertEqual(len(test_p), 0)
        self.assertEqual(len(train_p), 75)
        self.assertEqual(len(val_p), 25)


class PrepareDatasetTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self._orig_download = train._download_primary_dataset

    def tearDown(self):
        train._download_primary_dataset = self._orig_download

    def test_merges_primary_and_extra_sources(self):
        primary_dir = os.path.join(self.tmpdir.name, "primary_raw")
        primary_pairs = _make_images(primary_dir, 20)
        train._download_primary_dataset = lambda raw_dir="raw_data": primary_pairs

        extra_root = os.path.join(self.tmpdir.name, "extra_ds")
        extra_imgs = os.path.join(extra_root, "images", "train")
        extra_lbls = os.path.join(extra_root, "labels", "train")
        _make_images(extra_imgs, 6)
        os.makedirs(extra_lbls, exist_ok=True)
        for fn in os.listdir(extra_imgs):
            if fn.endswith(".txt"):
                shutil.move(os.path.join(extra_imgs, fn), os.path.join(extra_lbls, fn))
        extra_yaml = os.path.join(extra_root, "data.yaml")
        with open(extra_yaml, "w") as f:
            f.write("path: .\ntrain: images/train\nnames:\n  0: pothole\n")

        class Args:
            data_dir = os.path.join(self.tmpdir.name, "dataset")
            extra_data = [extra_yaml]
            val_split = 0.2
            test_split = 0.1
            seed = 42

        yaml_path = train.prepare_dataset(Args())
        self.assertTrue(os.path.isfile(yaml_path))

        total_images = 0
        seen_names = set()
        for split in ("train", "val", "test"):
            split_dir = os.path.join(Args.data_dir, "images", split)
            files = os.listdir(split_dir) if os.path.isdir(split_dir) else []
            total_images += len(files)
            for fn in files:
                self.assertNotIn(fn, seen_names)
                seen_names.add(fn)
                lbl = os.path.join(Args.data_dir, "labels", split, os.path.splitext(fn)[0] + ".txt")
                self.assertTrue(os.path.isfile(lbl))

        self.assertEqual(total_images, 26)

        with open(yaml_path) as f:
            yaml_text = f.read()
        self.assertIn("0: pothole", yaml_text)
        self.assertIn("test: images/test", yaml_text)

        # Re-running with an existing dataset dir should reuse it, not rebuild.
        yaml_path_again = train.prepare_dataset(Args())
        self.assertEqual(yaml_path_again, yaml_path)


class CalibrateConfidenceTests(unittest.TestCase):
    def test_picks_argmax_f1_threshold(self):
        class FakeBox:
            def __init__(self, p, r, map50):
                self.p = [p]
                self.r = [r]
                self.map50 = map50

        class FakeMetrics:
            def __init__(self, p, r, map50):
                self.box = FakeBox(p, r, map50)

        def synthetic_pr(conf):
            precision = min(1.0, 0.4 + 0.6 * conf)
            recall = max(0.0, 1.0 - 0.9 * conf)
            return precision, recall

        class FakeModel:
            def __init__(self):
                self.calls = []

            def val(self, data, imgsz, conf, split, plots, verbose):
                self.calls.append(conf)
                p, r = synthetic_pr(conf)
                return FakeMetrics(p, r, 0.42)

        grid = train._frange(0.1, 0.9, 0.05)
        expected_best, expected_f1 = None, -1.0
        for c in grid:
            p, r = synthetic_pr(c)
            f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
            if f1 > expected_f1:
                expected_f1, expected_best = f1, c

        model = FakeModel()
        best_conf, sweep = train.calibrate_confidence(model, "fake.yaml", 416, "val", grid)
        self.assertAlmostEqual(best_conf, expected_best)
        self.assertEqual(len(sweep), len(grid))
        self.assertEqual(model.calls, grid)

    def test_exception_falls_back_cleanly(self):
        class ExplodingModel:
            def val(self, *args, **kwargs):
                raise RuntimeError("val() unsupported kwarg on this ultralytics version")

        grid = train._frange(0.1, 0.9, 0.05)
        conf, sweep = train.calibrate_confidence(ExplodingModel(), "fake.yaml", 416, "val", grid, fallback=0.55)
        self.assertEqual(conf, 0.55)
        self.assertEqual(sweep, [])


if __name__ == "__main__":
    unittest.main()
