import unittest
from unittest.mock import patch
from types import SimpleNamespace
import photo_worker


class PhotoWorkerTests(unittest.TestCase):
    def test_only_pothole_class_is_selected(self):
        self.assertEqual(photo_worker.pothole_classes(SimpleNamespace(names={0: 'crack', 1: 'D40', 2: 'alligator_crack'})), [1])
        with self.assertRaises(ValueError):
            photo_worker.pothole_classes(SimpleNamespace(names={0: 'car', 1: 'person'}))

    def test_download_rejects_private_network_and_other_hosts(self):
        api = SimpleNamespace(url='https://project.supabase.co')
        for url in ['http://project.supabase.co/storage/v1/object/sign/evidence/x', 'https://192.168.1.1/x', 'https://other.example/x', 'https://project.supabase.co/not-evidence']:
            with self.assertRaises(ValueError):
                photo_worker.download_photo({'imageUrl': url}, api)

    def test_completion_retry_keeps_job_attempt_and_result(self):
        calls = []
        result = {'modelRevision': 'pinned', 'detections': [], 'inferenceMs': 1}
        def call(action, payload):
            calls.append((action, payload.copy()))
            if action == 'uploadEvidence': return {'path': 'owner/result.jpg'}
            if len([c for c in calls if c[0]=='finishInference'])==1: raise RuntimeError('temporary outage')
            return {'status': 'completed'}
        with patch.object(photo_worker, 'infer_photo', return_value=(result,b'jpeg')), patch.object(photo_worker, 'download_photo',return_value=b'jpeg'), patch.object(photo_worker.time,'sleep'):
            photo_worker.process_job(SimpleNamespace(call=call), object(), {'id':'job','attempts':2})
        finished = [p for a,p in calls if a=='finishInference']
        self.assertEqual(len(finished),2)
        self.assertEqual(finished[0],finished[1])
        self.assertEqual(finished[0]['attempt'],2)


if __name__ == '__main__':
    unittest.main()
