import cv2
import os


def convert_to_mp4(input_path, output_path):
    cap = cv2.VideoCapture(input_path)

    if not cap.isOpened():
        raise Exception(f"[VIDEO] could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0 or fps is None:
        print("[VIDEO] invalid FPS → using fallback 30")
        fps = 30

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"[VIDEO] Input → FPS={fps}, SIZE={width}x{height}")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        out.write(frame)
        frame_count += 1

        if frame_count % 200 == 0:
            print(f"[VIDEO] {frame_count} processed frames")

    cap.release()
    out.release()

    print(f"[VIDEO] Conversion completed → {output_path} ({frame_count} frames)")
    return output_path


def ensure_mp4(input_path):
    ext = os.path.splitext(input_path)[1].lower()

    if ext == ".mp4":
        print("[VIDEO] File is already .mp4 → no conversion needed")
        return input_path

    output_path = input_path.replace(ext, "_converted.mp4")

    print(f"[VIDEO] Converting {input_path} → {output_path}")
    return convert_to_mp4(input_path, output_path)