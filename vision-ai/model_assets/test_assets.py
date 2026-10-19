import hashlib
from pathlib import Path
import tempfile
import unittest
from download import fetch
from evaluate import iou, metrics


class DownloadTests(unittest.TestCase):
    def test_checksum_mismatch_never_installs_asset(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)/'source'
            source.write_bytes(b'wrong model')
            target = Path(folder)/'model.pt'
            with self.assertRaises(ValueError):
                fetch(source.as_uri(), target, '0'*64)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_suffix('.pt.part').exists())

    def test_corrupted_cached_asset_is_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)/'source'
            source.write_bytes(b'expected model')
            target = Path(folder)/'model.pt'
            target.write_bytes(b'corrupted')
            expected = hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertEqual(fetch(source.as_uri(),target,expected),expected)
            self.assertEqual(target.read_bytes(), source.read_bytes())


class MetricsTests(unittest.TestCase):
    def test_duplicate_predictions_are_false_positives(self):
        samples = [{'file_name':'p.jpg', 'objects':{'bbox':[[0,0,10,10]],'categories':[3]}}, {'file_name':'clean.jpg','objects':{'bbox':[],'categories':[]}}]
        predictions = {'p.jpg':[[0,0,10,10,.9],[0,0,10,10,.8]], 'clean.jpg':[[0,0,10,10,.7]]}
        result = metrics(samples,predictions,.5)
        self.assertEqual((result['tp'],result['fp'],result['fn']),(1,2,0))
        self.assertEqual(result['false_positive_frames'],1)
        self.assertEqual(result['negative_frames'],1)

    def test_low_confidence_and_crack_labels_do_not_count(self):
        sample = {'file_name':'x.jpg','objects':{'bbox':[[0,0,10,10],[20,20,10,10]],'categories':[0,3]}}
        result = metrics([sample],{'x.jpg':[[20,20,30,30,.1]]},.5)
        self.assertEqual((result['tp'],result['fp'],result['fn']),(0,0,1))
        self.assertEqual(iou([0,0,10,10],[0,0,10,10]),1)
        self.assertEqual(iou([0,0,10,10],[20,20,30,30]),0)


if __name__ == '__main__':
    unittest.main()
