import unittest

from avoidance import choose_avoidance_direction


class AvoidanceDirectionTests(unittest.TestCase):
    def test_clear_center_is_preferred(self):
        self.assertEqual(choose_avoidance_direction([], 600, 400), "CENTER")

    def test_left_side_pothole_keeps_clear_center(self):
        boxes = [(150, 220, 230, 390)]
        self.assertEqual(choose_avoidance_direction(boxes, 600, 400), "CENTER")

    def test_center_pothole_chooses_a_side(self):
        boxes = [(250, 220, 350, 390)]
        self.assertEqual(choose_avoidance_direction(boxes, 600, 400), "LEFT")

    def test_left_and_center_blocked_chooses_right(self):
        boxes = [(150, 180, 360, 400)]
        self.assertEqual(choose_avoidance_direction(boxes, 600, 400), "RIGHT")

    def test_invalid_dimensions_are_rejected(self):
        with self.assertRaises(ValueError):
            choose_avoidance_direction([], 0, 400)


if __name__ == "__main__":
    unittest.main()
