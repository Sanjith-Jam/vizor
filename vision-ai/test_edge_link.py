import tempfile
import unittest
from edge_link import EdgeLink, gps_location, parse_imu

class EdgeLinkTests(unittest.TestCase):
    def test_imu_requires_measured_valid_event(self):
        self.assertEqual(parse_imu('IMU:1:2.40',100),{'type':1,'gForce':2.4,'received_at':100})
        for line in ['IMU:1:nan','IMU:3:2','IMU:1:999','random']:
            self.assertIsNone(parse_imu(line))
    def test_gps_stale_or_invalid_is_not_mapped(self):
        self.assertEqual(gps_location({'fix':True,'lat':91,'lon':77,'received_at':99},100),(None,None))
        self.assertEqual(gps_location({'fix':True,'lat':12,'lon':77,'received_at':90},100),(None,None))
        self.assertEqual(gps_location({'fix':True,'lat':12,'lon':77,'received_at':99},100),({'lat':12,'lon':77},None))
    def test_failed_upload_survives_restart_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path=directory+'/outbox.db'
            first=EdgeLink(path,False)
            first.add({'eventId':'same'});first.add({'eventId':'same'})
            def offline(_): raise ConnectionError('offline')
            with self.assertRaises(ConnectionError):first.flush(offline)
            first.close()
            second=EdgeLink(path,False);sent=[]
            self.assertEqual(second.flush(sent.append),1)
            self.assertEqual(len(sent),1);self.assertEqual(second.flush(sent.append),0)
            second.close()
