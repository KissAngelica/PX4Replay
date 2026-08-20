#!/usr/bin/env python3
"""Convert a PX4 ULog into the normalized FlightData JSON used by the app."""

from __future__ import annotations

import argparse
import bisect
import json
import math
import os
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


class ParseError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Topic:
    name: str
    data: Mapping[str, Sequence[Any]]


NAV_STATES = {
    0: "MANUAL", 1: "ALTITUDE", 2: "POSITION", 3: "MISSION", 4: "LOITER",
    5: "RETURN", 10: "ACRO", 14: "OFFBOARD", 17: "TAKEOFF", 18: "LAND",
}


def decode_nav_state(value: Any) -> str:
    parsed = finite(value)
    if parsed is None:
        return "UNKNOWN"
    return NAV_STATES.get(int(parsed), f"NAV {int(parsed)}")


def finite(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def field(topic: Topic | None, names: Sequence[str]) -> Sequence[Any] | None:
    if topic is None:
        return None
    for name in names:
        if name in topic.data:
            return topic.data[name]
    return None


def timestamps(topic: Topic | None) -> list[int]:
    values = field(topic, ("timestamp",))
    return [int(value) for value in values] if values is not None else []


def previous_index(times: Sequence[int], timestamp: int) -> int | None:
    index = bisect.bisect_right(times, timestamp) - 1
    return index if index >= 0 else None


def previous_value(topic: Topic | None, names: Sequence[str], timestamp: int) -> Any | None:
    times = timestamps(topic)
    values = field(topic, names)
    index = previous_index(times, timestamp)
    if values is None or index is None or index >= len(values):
        return None
    return values[index]


def interpolate_value(topic: Topic | None, names: Sequence[str], timestamp: int) -> float | None:
    times = timestamps(topic)
    values = field(topic, names)
    if not times or values is None:
        return None
    right = bisect.bisect_left(times, timestamp)
    if right <= 0:
        return finite(values[0])
    if right >= len(times):
        return finite(values[-1])
    left = right - 1
    start = finite(values[left])
    end = finite(values[right])
    if start is None or end is None or times[right] == times[left]:
        return start
    amount = (timestamp - times[left]) / (times[right] - times[left])
    return start + (end - start) * amount


def quaternion_at(topic: Topic, timestamp: int) -> tuple[float, float, float, float] | None:
    times = timestamps(topic)
    arrays = [field(topic, (f"q[{index}]", f"q_{index}")) for index in range(4)]
    if not times or any(values is None for values in arrays):
        return None
    right = bisect.bisect_left(times, timestamp)
    left = max(0, min(right - 1, len(times) - 1))
    right = max(0, min(right, len(times) - 1))
    first = [finite(values[left]) for values in arrays if values is not None]
    second = [finite(values[right]) for values in arrays if values is not None]
    if any(value is None for value in first + second):
        return None
    q1 = [float(value) for value in first]
    q2 = [float(value) for value in second]
    amount = 0.0 if times[right] == times[left] else (timestamp - times[left]) / (times[right] - times[left])
    dot = sum(a * b for a, b in zip(q1, q2))
    if dot < 0:
        q2 = [-value for value in q2]
    mixed = [a + (b - a) * amount for a, b in zip(q1, q2)]
    length = math.sqrt(sum(value * value for value in mixed))
    if length < 1e-8:
        return None
    return tuple(value / length for value in mixed)  # type: ignore[return-value]


def euler_from_quaternion(q: tuple[float, float, float, float]) -> tuple[float, float, float]:
    w, x, y, z = q
    roll = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    pitch = math.asin(max(-1.0, min(1.0, 2 * (w * y - z * x))))
    yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return roll, pitch, yaw


def optional_float(topic: Topic | None, names: Sequence[str], timestamp: int) -> float | None:
    return interpolate_value(topic, names, timestamp)


def home_position_at_start(home: Topic | None, start_timestamp: int) -> dict[str, float] | None:
    if home is None:
        return None
    times = timestamps(home)
    coordinates = [field(home, (name,)) for name in ("x", "y", "z")]
    if not times or any(values is None for values in coordinates):
        return None
    valid_local = field(home, ("valid_lpos",))
    candidates: list[tuple[int, dict[str, float]]] = []
    for index, timestamp in enumerate(times):
        if valid_local is not None and index < len(valid_local) and not bool(valid_local[index]):
            continue
        parsed = [finite(values[index]) for values in coordinates if values is not None]
        if len(parsed) != 3 or any(value is None for value in parsed):
            continue
        candidates.append(
            (timestamp, dict(zip(("north", "east", "down"), (float(value) for value in parsed))))
        )
    if not candidates:
        return None
    before_start = [candidate for candidate in candidates if candidate[0] <= start_timestamp]
    return (before_start[-1] if before_start else candidates[0])[1]


def normalize_local_positions(
    frames: list[dict[str, Any]], home_position: dict[str, float] | None
) -> tuple[dict[str, float], dict[str, float] | None, dict[str, Any]]:
    first = frames[0]["localPosition"]
    horizontal_origin = home_position or first
    first_armed = next((frame for frame in frames if frame["vehicle"]["armed"]), None)
    reference_time = first_armed["timestampUs"] if first_armed else frames[0]["timestampUs"]
    candidates = [
        frame["localPosition"]["down"]
        for frame in frames
        if reference_time - 2_000_000 <= frame["timestampUs"] <= reference_time
        and frame["vehicle"].get("landed", True)
    ]
    if not candidates:
        candidates = [(first_armed or frames[0])["localPosition"]["down"]]
    ground_down = float(statistics.median(candidates))
    origin = {
        "north": horizontal_origin["north"],
        "east": horizontal_origin["east"],
        "down": ground_down,
    }
    for frame in frames:
        position = frame["localPosition"]
        frame["localPosition"] = {
            axis: position[axis] - origin[axis] for axis in ("north", "east", "down")
        }
    normalized_home = None
    if home_position:
        normalized_home = {
            axis: home_position[axis] - origin[axis] for axis in ("north", "east", "down")
        }
    vertical_reference = {
        "method": "armed-ground",
        "groundDown": ground_down,
        "referenceTimestampUs": reference_time,
        "landedLockApplied": any(frame["vehicle"].get("landed") for frame in frames),
    }
    return origin, normalized_home, vertical_reference


def adapt_topics(
    topic_map: Mapping[str, Topic], source_name: str, file_size: int = 0
) -> dict[str, Any]:
    local = topic_map.get("vehicle_local_position")
    attitude = topic_map.get("vehicle_attitude")
    if local is None:
        raise ParseError("MISSING_LOCAL_POSITION", "日志缺少 vehicle_local_position")
    if attitude is None:
        raise ParseError("MISSING_ATTITUDE", "日志缺少 vehicle_attitude")

    local_times = timestamps(local)
    norths = field(local, ("x",))
    easts = field(local, ("y",))
    downs = field(local, ("z",))
    if not local_times or norths is None or easts is None or downs is None:
        raise ParseError("NO_VALID_POSITION", "vehicle_local_position 中没有位置样本")

    xy_valid = field(local, ("xy_valid",))
    z_valid = field(local, ("z_valid",))
    global_topic = topic_map.get("vehicle_global_position")
    status = topic_map.get("vehicle_status")
    battery = topic_map.get("battery_status")
    gps = topic_map.get("vehicle_gps_position")
    land_detected = topic_map.get("vehicle_land_detected")
    frames: list[dict[str, Any]] = []
    raw_start: int | None = None
    last_timestamp = -1

    for index, timestamp in enumerate(local_times):
        if timestamp <= last_timestamp:
            continue
        last_timestamp = timestamp
        if xy_valid is not None and index < len(xy_valid) and not bool(xy_valid[index]):
            continue
        if z_valid is not None and index < len(z_valid) and not bool(z_valid[index]):
            continue
        north, east, down = finite(norths[index]), finite(easts[index]), finite(downs[index])
        if north is None or east is None or down is None:
            continue
        quaternion = quaternion_at(attitude, timestamp)
        if quaternion is None:
            continue
        if raw_start is None:
            raw_start = timestamp

        velocity_north = optional_float(local, ("vx",), timestamp) or 0.0
        velocity_east = optional_float(local, ("vy",), timestamp) or 0.0
        velocity_down = optional_float(local, ("vz",), timestamp) or 0.0
        roll, pitch, yaw = euler_from_quaternion(quaternion)
        landed = previous_value(land_detected, ("landed",), timestamp)
        frame: dict[str, Any] = {
            "timestampUs": timestamp - raw_start,
            "localPosition": {"north": north, "east": east, "down": down},
            "velocity": {
                "north": velocity_north, "east": velocity_east, "down": velocity_down,
            },
            "groundSpeed": math.hypot(velocity_north, velocity_east),
            "attitude": {
                "quaternion": dict(zip(("w", "x", "y", "z"), quaternion)),
                "roll": roll, "pitch": pitch, "yaw": yaw,
            },
            "vehicle": {
                "armed": int(previous_value(status, ("arming_state",), timestamp) or 0) == 2,
                "flightMode": decode_nav_state(previous_value(status, ("nav_state",), timestamp)),
            },
        }
        if landed is not None:
            frame["vehicle"]["landed"] = bool(landed)

        latitude = optional_float(global_topic, ("lat",), timestamp)
        longitude = optional_float(global_topic, ("lon",), timestamp)
        altitude = optional_float(global_topic, ("alt", "altitude_msl_m"), timestamp)
        if latitude is not None and longitude is not None and altitude is not None:
            if abs(latitude) > 180:
                latitude /= 1e7
            if abs(longitude) > 180:
                longitude /= 1e7
            frame["globalPosition"] = {
                "latitude": latitude, "longitude": longitude, "altitudeMsl": altitude,
            }

        voltage = optional_float(battery, ("voltage_v",), timestamp)
        current = optional_float(battery, ("current_a",), timestamp)
        remaining = optional_float(battery, ("remaining",), timestamp)
        if voltage is not None or current is not None or remaining is not None:
            frame["battery"] = {
                "voltage": voltage or 0.0, "current": current or 0.0, "remaining": remaining or 0.0,
            }

        satellites = previous_value(gps, ("satellites_used",), timestamp)
        fix_type = previous_value(gps, ("fix_type",), timestamp)
        gps_latitude = optional_float(gps, ("latitude_deg", "lat"), timestamp)
        gps_longitude = optional_float(gps, ("longitude_deg", "lon"), timestamp)
        gps_altitude = optional_float(gps, ("altitude_msl_m", "alt"), timestamp)
        gps_altitude_ellipsoid = optional_float(
            gps, ("altitude_ellipsoid_m", "alt_ellipsoid"), timestamp
        )
        if (
            satellites is not None
            or fix_type is not None
            or gps_altitude is not None
            or gps_altitude_ellipsoid is not None
            or gps_latitude is not None
            or gps_longitude is not None
        ):
            frame["gps"] = {
                "satellites": int(satellites or 0),
                "fixType": int(fix_type or 0),
            }
            if gps_altitude is not None:
                frame["gps"]["altitudeMsl"] = gps_altitude
            if gps_altitude_ellipsoid is not None:
                frame["gps"]["altitudeEllipsoid"] = gps_altitude_ellipsoid
            if gps_latitude is not None:
                frame["gps"]["latitude"] = gps_latitude
            if gps_longitude is not None:
                frame["gps"]["longitude"] = gps_longitude
        frames.append(frame)

    if not frames or raw_start is None:
        raise ParseError("NO_VALID_POSITION", "日志中没有同时具备有效位置和姿态的样本")

    raw_end = raw_start + frames[-1]["timestampUs"]
    raw_home_position = home_position_at_start(topic_map.get("home_position"), raw_start)
    local_origin, home_position, vertical_reference = normalize_local_positions(
        frames, raw_home_position
    )

    result: dict[str, Any] = {
        "name": source_name,
        "durationUs": frames[-1]["timestampUs"],
        "sampleRateHz": (len(frames) - 1) * 1_000_000 / max(frames[-1]["timestampUs"], 1),
        "frames": frames,
        "metadata": {
            "source": "px4-ulog", "fileName": source_name, "fileSizeBytes": file_size,
            "logStartTimestampUs": raw_start, "logEndTimestampUs": raw_end,
            "topics": sorted(topic_map.keys()),
            "topicFields": {
                name: sorted(field_name for field_name in topic.data if field_name != "timestamp")
                for name, topic in sorted(topic_map.items())
            },
            "localOriginNed": local_origin,
            "verticalReference": vertical_reference,
        },
    }
    if home_position:
        result["homePosition"] = home_position
    return result


def load_topics(path: Path) -> Mapping[str, Topic]:
    try:
        from pyulog import ULog
    except ImportError as error:
        raise ParseError("PYULOG_MISSING", "未安装 pyulog，请运行 pip install -r requirements.txt") from error
    try:
        ulog = ULog(str(path))
    except Exception as error:
        raise ParseError("CORRUPT_ULOG", f"ULog 解析失败：{error}") from error
    result: dict[str, Topic] = {}
    for dataset in ulog.data_list:
        multi_id = int(getattr(dataset, "multi_id", 0))
        key = dataset.name if multi_id == 0 else f"{dataset.name}.{multi_id:02d}"
        if key not in result:
            result[key] = Topic(key, dataset.data)
    return result


def json_compatible(value: Any) -> Any:
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (list, tuple)) or hasattr(value, "tolist"):
        values = value.tolist() if hasattr(value, "tolist") else value
        return [json_compatible(item) for item in values]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def extract_topic_series(
    topic_map: Mapping[str, Topic], topic_name: str, field_names: Sequence[str] | None = None
) -> dict[str, Any]:
    topic = topic_map.get(topic_name)
    if topic is None:
        raise ParseError("TOPIC_NOT_FOUND", f"日志中不存在 Topic：{topic_name}")
    selected_fields = set(field_names or topic.data.keys())
    missing = selected_fields.difference(topic.data.keys())
    if missing:
        raise ParseError(
            "FIELD_NOT_FOUND", f"Topic {topic_name} 中不存在字段：{', '.join(sorted(missing))}"
        )
    return {
        "name": topic_name,
        "timestampsUs": timestamps(topic),
        "fields": {
            name: [json_compatible(value) for value in values]
            for name, values in topic.data.items()
            if name != "timestamp" and name in selected_fields
        },
    }


def parse_file(
    path: Path, topic_name: str | None = None, field_names: Sequence[str] | None = None
) -> dict[str, Any]:
    if not path.exists():
        raise ParseError("FILE_NOT_FOUND", f"文件不存在：{path}")
    if not path.is_file():
        raise ParseError("FILE_UNREADABLE", f"不是可读取文件：{path}")
    if path.suffix.lower() != ".ulg":
        raise ParseError("NOT_ULOG", "请选择 .ulg 文件")
    try:
        with path.open("rb") as stream:
            if stream.read(7) != b"ULog\x01\x12\x35":
                raise ParseError("NOT_ULOG", "文件头不是有效的 PX4 ULog")
    except OSError as error:
        raise ParseError("FILE_UNREADABLE", f"文件无法读取：{error}") from error
    topics = load_topics(path)
    if topic_name:
        return extract_topic_series(topics, topic_name, field_names)
    return adapt_topics(topics, path.name, os.path.getsize(path))


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--topic")
    parser.add_argument("--field", action="append")
    parser.add_argument("--pretty", action="store_true")
    arguments = parser.parse_args()
    try:
        result = parse_file(arguments.path, arguments.topic, arguments.field)
        json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False, indent=2 if arguments.pretty else None)
        return 0
    except ParseError as error:
        json.dump({"error": {"code": error.code, "message": str(error)}}, sys.stderr, ensure_ascii=False)
        return 2
    except Exception as error:
        json.dump({"error": {"code": "UNEXPECTED", "message": str(error)}}, sys.stderr, ensure_ascii=False)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
