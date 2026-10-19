"""Small, dependency-free pothole avoidance direction estimator.

The detector supplies bounding boxes.  This module divides the rider's visible
road corridor into LEFT, CENTER and RIGHT candidate paths and returns the path
with the least pothole overlap.  It deliberately does not claim that a lane
change is traffic-safe; that would require side/rear sensing.
"""

from __future__ import annotations

from typing import Iterable, Sequence


Box = Sequence[float]


def choose_avoidance_direction(
    boxes: Iterable[Box],
    frame_width: int,
    frame_height: int,
    lane_margin: float = 0.25,
) -> str:
    """Return ``LEFT``, ``CENTER`` or ``RIGHT`` for the clearest image corridor.

    A small side-path penalty makes CENTER win when it is as clear as a side.
    Near-camera detections are weighted more heavily than distant detections.
    """
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame dimensions must be positive")
    if not 0.0 <= lane_margin < 0.5:
        raise ValueError("lane_margin must be between 0.0 and 0.5")

    lane_left = frame_width * lane_margin
    lane_right = frame_width * (1.0 - lane_margin)
    lane_width = lane_right - lane_left
    corridor_width = lane_width / 3.0

    # CENTER is evaluated first so an exact tie never suggests an unnecessary
    # lateral move.  LEFT is the deterministic fallback if both sides tie.
    candidates = (
        ("CENTER", lane_left + lane_width * 0.50, 0.0),
        ("LEFT", lane_left + lane_width / 6.0, 0.03),
        ("RIGHT", lane_left + lane_width * 5.0 / 6.0, 0.03),
    )

    scores: dict[str, float] = {}
    for name, center_x, movement_penalty in candidates:
        path_left = center_x - corridor_width / 2.0
        path_right = center_x + corridor_width / 2.0
        score = movement_penalty

        for box in boxes:
            if len(box) < 4:
                continue
            x1, y1, x2, y2 = map(float, box[:4])
            overlap_width = max(0.0, min(path_right, x2) - max(path_left, x1))
            overlap_height = max(0.0, min(float(frame_height), y2) - max(0.0, y1))
            if overlap_width == 0.0 or overlap_height == 0.0:
                continue

            # Boxes lower in the image are normally closer to the rider.
            proximity = 0.5 + 0.5 * min(1.0, max(0.0, y2 / frame_height))
            score += (overlap_width * overlap_height / (corridor_width * frame_height)) * proximity

        scores[name] = score

    return min(candidates, key=lambda candidate: scores[candidate[0]])[0]
