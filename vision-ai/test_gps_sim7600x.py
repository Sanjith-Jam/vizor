import unittest

from gps_sim7600x import (
    nmea_to_decimal,
    parse_cgpsinfo,
    parse_nmea_gga,
    parse_nmea_rmc,
)


class NmeaToDecimalTests(unittest.TestCase):
    def test_latitude_north(self):
        self.assertAlmostEqual(nmea_to_decimal("4807.038", "N"), 48.1173, places=4)

    def test_longitude_east(self):
        self.assertAlmostEqual(nmea_to_decimal("01131.000", "E"), 11.516667, places=5)

    def test_southern_hemisphere_is_negative(self):
        self.assertLess(nmea_to_decimal("3113.343286", "S"), 0)

    def test_blank_value_returns_none(self):
        self.assertIsNone(nmea_to_decimal("", "N"))

    def test_bad_hemisphere_returns_none(self):
        self.assertIsNone(nmea_to_decimal("4807.038", "X"))


class CgpsinfoTests(unittest.TestCase):
    def test_valid_fix(self):
        line = "+CGPSINFO: 3113.343286,N,12121.234567,E,250420,081806.0,44.1,0.0,0.0"
        reading = parse_cgpsinfo(line)
        self.assertTrue(reading["fix"])
        self.assertAlmostEqual(reading["lat"], 31.222388, places=5)
        self.assertAlmostEqual(reading["lon"], 121.353909, places=5)
        self.assertEqual(reading["utc"], "081806.0")

    def test_empty_fix(self):
        reading = parse_cgpsinfo("+CGPSINFO: ,,,,,,,,")
        self.assertFalse(reading["fix"])
        self.assertIsNone(reading["lat"])

    def test_non_cgpsinfo_line_returns_none(self):
        self.assertIsNone(parse_cgpsinfo("OK"))
        self.assertIsNone(parse_cgpsinfo("random text"))


class NmeaSentenceTests(unittest.TestCase):
    def test_gga_with_valid_checksum(self):
        line = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47"
        reading = parse_nmea_gga(line)
        self.assertTrue(reading["fix"])
        self.assertAlmostEqual(reading["lat"], 48.1173, places=4)
        self.assertEqual(reading["sats"], 8)
        self.assertAlmostEqual(reading["alt_m"], 545.4, places=1)

    def test_rmc_with_valid_checksum(self):
        line = "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A"
        reading = parse_nmea_rmc(line)
        self.assertTrue(reading["fix"])
        self.assertAlmostEqual(reading["speed_kn"], 22.4, places=1)
        self.assertAlmostEqual(reading["course_deg"], 84.4, places=1)
        self.assertEqual(reading["date"], "230394")

    def test_bad_checksum_rejected(self):
        line = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00"
        self.assertIsNone(parse_nmea_gga(line))

    def test_wrong_sentence_type_returns_none(self):
        line = "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A"
        self.assertIsNone(parse_nmea_gga(line))

    def test_gga_no_fix(self):
        line = "$GPGGA,123519,,,,,0,00,,,M,,M,,*6B"
        reading = parse_nmea_gga(line)
        self.assertIsNotNone(reading)
        self.assertFalse(reading["fix"])


if __name__ == "__main__":
    unittest.main()
