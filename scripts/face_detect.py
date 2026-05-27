#!/usr/bin/env python3
import json
import math
import os
import sys

import cv2


def error(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def parse_args():
    if len(sys.argv) != 5:
        error(
            "Usage: face_detect.py <video_path> <sample_interval_seconds> <max_samples> <output_json>"
        )

    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        error(f"Video file not found: {video_path}")

    try:
        sample_interval_seconds = float(sys.argv[2])
        max_samples = int(sys.argv[3])
    except ValueError:
        error("sample_interval_seconds must be a number and max_samples must be an integer")

    output_json = sys.argv[4]
    return video_path, sample_interval_seconds, max_samples, output_json


def main():
    video_path, sample_interval_seconds, max_samples, output_json = parse_args()

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        error(f"Could not open video: {video_path}")

    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    duration = None
    if fps > 0 and frame_count > 0:
        duration = frame_count / fps

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_detector = cv2.CascadeClassifier(cascade_path)
    if face_detector.empty():
        error("OpenCV face cascade not found. Make sure opencv-python is installed.")

    sample_times = []
    if duration is not None and duration > 0:
        timestamp = 0.0
        while len(sample_times) < max_samples and timestamp <= duration:
            sample_times.append(min(timestamp, duration))
            timestamp += sample_interval_seconds
        if len(sample_times) == 0:
            sample_times.append(0.0)
        if sample_times[-1] < duration:
            sample_times.append(duration)
    else:
        timestamp = 0.0
        while len(sample_times) < max_samples:
            sample_times.append(timestamp)
            timestamp += sample_interval_seconds

    def detect_face(frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(48, 48),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        return faces

    samples = []
    has_any_face = False

    for time_seconds in sample_times:
        capture.set(cv2.CAP_PROP_POS_MSEC, time_seconds * 1000)
        success, frame = capture.read()
        if not success or frame is None:
            continue

        faces = detect_face(frame)
        sample = {
            "time": round(time_seconds, 3),
            "x": None,
            "y": None,
            "w": None,
            "h": None,
        }

        if len(faces) > 0:
            best_face = max(faces, key=lambda rect: rect[2] * rect[3])
            x, y, w, h = best_face
            sample["x"] = int(x)
            sample["y"] = int(y)
            sample["w"] = int(w)
            sample["h"] = int(h)
            has_any_face = True

        samples.append(sample)

    if len(samples) == 0:
        error("Face detection did not produce any sample frames.")

    output = {
        "video_width": width,
        "video_height": height,
        "has_any_face": has_any_face,
        "samples": samples,
    }

    with open(output_json, "w", encoding="utf-8") as output_file:
        json.dump(output, output_file, indent=2)


if __name__ == "__main__":
    main()
