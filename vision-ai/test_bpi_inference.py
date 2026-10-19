"""Unit tests for bpi_inference.py's pure/testable logic.

bpi_inference.py imports cv2 and ultralytics at module level for its actual
camera/inference work; neither is needed to exercise resolve_confidence() or
is_network_source(), so both are stubbed in sys.modules before the import.
This keeps the test dependency-light (no multi-GB torch/ultralytics install
required to run it) the same way test_gps_sim7600x.py avoids requiring
pyserial to be installed.
"""

import json
import os
import sys
import tempfile
import types
import unittest

if "cv2" not in sys.modules:
    sys.modules["cv2"] = types.ModuleType("cv2")
if "ultralytics" not in sys.modules:
    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = object
    sys.modules["ultralytics"] = fake_ultralytics

import bpi_inference  # noqa: E402


class ResolveConfidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)

    def _write_metadata(self, dir_path, data):
        os.makedirs(dir_path, exist_ok=True)
        with open(os.path.join(dir_path, "model_metadata.json"), "w") as f:
            json.dump(data, f)

    def test_explicit_conf_always_wins(self):
        model_dir = os.path.join(self.tmpdir.name, "model")
        self._write_metadata(model_dir, {"calibrated_conf_threshold": 0.63})
        conf, source = bpi_inference.resolve_confidence(0.9, model_dir)
        self.assertEqual(conf, 0.9)
        self.assertIsNone(source)

    def test_directory_model_path_finds_sibling_metadata(self):
        model_dir = os.path.join(self.tmpdir.name, "model2")
        self._write_metadata(model_dir, {"calibrated_conf_threshold": 0.63})
        conf, source = bpi_inference.resolve_confidence(None, model_dir)
        self.assertEqual(conf, 0.63)
        self.assertEqual(source, os.path.join(model_dir, "model_metadata.json"))

    def test_file_model_path_finds_parent_metadata(self):
        model_dir = os.path.join(self.tmpdir.name, "model3")
        self._write_metadata(model_dir, {"calibrated_conf_threshold": 0.71})
        onnx_path = os.path.join(model_dir, "best.onnx")
        with open(onnx_path, "wb") as f:
            f.write(b"fake-onnx")
        conf, _source = bpi_inference.resolve_confidence(None, onnx_path)
        self.assertEqual(conf, 0.71)

    def test_missing_metadata_falls_back_to_default(self):
        model_dir = os.path.join(self.tmpdir.name, "model4")
        os.makedirs(model_dir, exist_ok=True)
        conf, source = bpi_inference.resolve_confidence(None, model_dir)
        self.assertEqual(conf, bpi_inference.DEFAULT_CONF)
        self.assertIsNone(source)

    def test_malformed_metadata_degrades_gracefully(self):
        model_dir = os.path.join(self.tmpdir.name, "model5")
        os.makedirs(model_dir, exist_ok=True)
        with open(os.path.join(model_dir, "model_metadata.json"), "w") as f:
            f.write("{not valid json")
        conf, _source = bpi_inference.resolve_confidence(None, model_dir)
        self.assertEqual(conf, bpi_inference.DEFAULT_CONF)

    def test_metadata_missing_expected_key(self):
        model_dir = os.path.join(self.tmpdir.name, "model6")
        self._write_metadata(model_dir, {"base_model": "yolov8n.pt"})
        conf, source = bpi_inference.resolve_confidence(None, model_dir)
        self.assertEqual(conf, bpi_inference.DEFAULT_CONF)
        self.assertIsNone(source)


class NetworkSourceTests(unittest.TestCase):
    def test_http_stream_is_network_source(self):
        self.assertTrue(bpi_inference.is_network_source("http://192.168.4.1:81/stream"))

    def test_rtsp_is_network_source(self):
        self.assertTrue(bpi_inference.is_network_source("rtsp://cam/stream"))

    def test_local_device_is_not_network_source(self):
        self.assertFalse(bpi_inference.is_network_source("/dev/video0"))
        self.assertFalse(bpi_inference.is_network_source("0"))

    def test_non_string_is_not_network_source(self):
        self.assertFalse(bpi_inference.is_network_source(0))


if __name__ == "__main__":
    unittest.main()
