import math
import tempfile
import unittest
from pathlib import Path

from parse_ulog import (
    ParseError,
    Topic,
    adapt_topics,
    decode_nav_state,
    extract_topic_series,
    parse_file,
)


class ParserTests(unittest.TestCase):
    def base_topics(self):
        return {
            "vehicle_local_position": Topic("vehicle_local_position", {
                "timestamp": [1_000_000, 1_100_000], "x": [0.0, 1.0], "y": [0.0, 2.0],
                "z": [-10.0, -11.0], "vx": [1.0, 1.0], "vy": [2.0, 2.0], "vz": [-1.0, -1.0],
                "xy_valid": [True, True], "z_valid": [True, True],
            }),
            "vehicle_attitude": Topic("vehicle_attitude", {
                "timestamp": [1_000_000, 1_100_000], "q[0]": [1.0, -1.0],
                "q[1]": [0.0, 0.0], "q[2]": [0.0, 0.0], "q[3]": [0.0, 0.0],
            }),
            "vehicle_status": Topic("vehicle_status", {
                "timestamp": [1_000_000], "arming_state": [2], "nav_state": [3],
            }),
            "vehicle_gps_position": Topic("vehicle_gps_position", {
                "timestamp": [1_000_000], "satellites_used": [18], "fix_type": [3],
            }),
        }

    def test_adapts_topics_and_normalizes_time(self):
        result = adapt_topics(self.base_topics(), "flight.ulg", 123)
        self.assertEqual(result["durationUs"], 100_000)
        self.assertEqual(result["metadata"]["logStartTimestampUs"], 1_000_000)
        self.assertEqual(result["metadata"]["logEndTimestampUs"], 1_100_000)
        self.assertEqual(result["frames"][0]["timestampUs"], 0)
        self.assertEqual(result["frames"][0]["localPosition"], {"north": 0.0, "east": 0.0, "down": 0.0})
        self.assertEqual(result["frames"][1]["localPosition"], {"north": 1.0, "east": 2.0, "down": -1.0})
        self.assertEqual(result["frames"][1]["vehicle"]["flightMode"], "MISSION")
        self.assertAlmostEqual(result["frames"][1]["groundSpeed"], math.sqrt(5))
        self.assertEqual(result["metadata"]["fileSizeBytes"], 123)

    def test_uses_home_horizontally_and_arming_point_as_ground_vertically(self):
        topics = self.base_topics()
        topics["vehicle_local_position"] = Topic("vehicle_local_position", {
            **topics["vehicle_local_position"].data,
            "x": [11.0, 13.0], "y": [18.0, 21.0], "z": [29.0, 33.0],
        })
        topics["home_position"] = Topic("home_position", {
            "timestamp": [900_000], "x": [10.0], "y": [20.0], "z": [30.0],
            "valid_lpos": [True],
        })
        result = adapt_topics(topics, "home.ulg")
        self.assertEqual(result["metadata"]["localOriginNed"], {
            "north": 10.0, "east": 20.0, "down": 29.0,
        })
        self.assertEqual(result["frames"][0]["localPosition"], {
            "north": 1.0, "east": -2.0, "down": 0.0,
        })
        self.assertEqual(result["frames"][1]["localPosition"], {
            "north": 3.0, "east": 1.0, "down": 4.0,
        })
        self.assertEqual(result["homePosition"], {
            "north": 0.0, "east": 0.0, "down": 1.0,
        })
        self.assertEqual(
            result["metadata"]["verticalReference"]["method"], "armed-ground"
        )

    def test_preserves_ekf_z_for_landed_and_in_flight_samples(self):
        topics = self.base_topics()
        topics["vehicle_local_position"] = Topic("vehicle_local_position", {
            **topics["vehicle_local_position"].data,
            "z": [5.2, 4.0],
        })
        topics["vehicle_land_detected"] = Topic("vehicle_land_detected", {
            "timestamp": [1_000_000, 1_050_000], "landed": [True, False],
        })
        result = adapt_topics(topics, "landed.ulg")
        self.assertEqual(result["frames"][0]["localPosition"]["down"], 0.0)
        self.assertAlmostEqual(result["frames"][1]["localPosition"]["down"], -1.2)
        self.assertTrue(result["metadata"]["verticalReference"]["landedLockApplied"])

    def test_exposes_real_topic_fields_and_extracts_selected_topic_series(self):
        topics = self.base_topics()
        result = adapt_topics(topics, "fields.ulg")
        self.assertIn("vx", result["metadata"]["topicFields"]["vehicle_local_position"])
        self.assertNotIn("timestamp", result["metadata"]["topicFields"]["vehicle_local_position"])
        series = extract_topic_series(topics, "vehicle_local_position", ["x"])
        self.assertEqual(series["timestampsUs"], [1_000_000, 1_100_000])
        self.assertEqual(series["fields"]["x"], [0.0, 1.0])
        self.assertNotIn("y", series["fields"])

    def test_decodes_px4_navigation_states(self):
        self.assertEqual(decode_nav_state(0), "MANUAL")
        self.assertEqual(decode_nav_state(3), "MISSION")
        self.assertEqual(decode_nav_state(5), "RETURN")
        self.assertEqual(decode_nav_state(14), "OFFBOARD")
        self.assertEqual(decode_nav_state(999), "NAV 999")
        self.assertEqual(decode_nav_state(math.nan), "UNKNOWN")

    def test_filters_nan_and_invalid_samples(self):
        topics = self.base_topics()
        topics["vehicle_local_position"].data["x"][0] = math.nan
        result = adapt_topics(topics, "flight.ulg")
        self.assertEqual(len(result["frames"]), 1)

    def test_reports_missing_required_topics(self):
        with self.assertRaisesRegex(ParseError, "vehicle_attitude"):
            adapt_topics({"vehicle_local_position": self.base_topics()["vehicle_local_position"]}, "bad.ulg")

    def test_reports_missing_and_wrong_file_types(self):
        with self.assertRaises(ParseError) as missing:
            parse_file(Path("does-not-exist.ulg"))
        self.assertEqual(missing.exception.code, "FILE_NOT_FOUND")

        with tempfile.NamedTemporaryFile(suffix=".txt") as stream:
            with self.assertRaises(ParseError) as wrong_type:
                parse_file(Path(stream.name))
        self.assertEqual(wrong_type.exception.code, "NOT_ULOG")

    def test_rejects_invalid_ulog_header(self):
        with tempfile.NamedTemporaryFile(suffix=".ulg") as stream:
            stream.write(b"not a ulog")
            stream.flush()
            with self.assertRaises(ParseError) as invalid:
                parse_file(Path(stream.name))
        self.assertEqual(invalid.exception.code, "NOT_ULOG")


if __name__ == "__main__":
    unittest.main()
