import cv2
import numpy as np

# Required dimensions
FINAL_WIDTH = 508
FINAL_HEIGHT = 632

def process_video(input_video_path, output_video_path='../outputs/preprocessed_video.mp4'):    
    cap = cv2.VideoCapture(input_video_path)

    if not cap.isOpened():
        raise ValueError(f"Error when opening the video: {input_video_path}")

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"Original video dimensions: {frame_width}x{frame_height}, FPS: {fps}")

    # Define pixel row to scan for black pixels
    fixed_row = int(frame_height * 0.75)
    crop_bottom = 20

    def detect_cut_positions(frame, row, threshold=10):
        pixel_values = frame[row, :]
        cut_left = next((i for i in range(len(pixel_values)) if pixel_values[i] < threshold), None)
        cut_right = next((i for i in range(len(pixel_values) - 1, -1, -1) if pixel_values[i] < threshold), None)
        return cut_left, cut_right

    def detect_top_cut_position(frame, threshold=10):
        return next((row for row in range(frame.shape[0]) if np.any(frame[row, :] < threshold)), 0)

    processed_frames = []
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        cut_left, cut_right = detect_cut_positions(gray_frame, fixed_row)
        cut_top = detect_top_cut_position(gray_frame)

        if None in (cut_left, cut_right):
            print("No cuts detected")
            continue

        cropped_frame = frame[cut_top:-crop_bottom, cut_left:cut_right]
        cropped_height, cropped_width = cropped_frame.shape[:2]

        scale = min(FINAL_WIDTH / cropped_width, FINAL_HEIGHT / cropped_height)
        new_w = int(cropped_width * scale)
        new_h = int(cropped_height * scale)
        resized_frame = cv2.resize(cropped_frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

        pad_top = (FINAL_HEIGHT - new_h) // 2
        pad_bottom = FINAL_HEIGHT - new_h - pad_top
        pad_left = (FINAL_WIDTH - new_w) // 2
        pad_right = FINAL_WIDTH - new_w - pad_left

        final_frame = cv2.copyMakeBorder(resized_frame, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=0)
        processed_frames.append(final_frame)

    cap.release()

    if output_video_path:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (FINAL_WIDTH, FINAL_HEIGHT))
        for frame in processed_frames:
            out.write(frame)
        out.release()
        print(f"Video saved in: {output_video_path}")

    return processed_frames  








