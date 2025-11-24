"""
video_reconstruction_kalman_pred.py

This module reconstructs the final output video of the DeepPatella pipeline,
using the frames that contain the *Kalman-filtered* insertion coordinates.
Each frame in `kalman_predictions/` contains the original ultrasound image plus
the corrected distal and proximal markers. This script stitches those frames
back into a synchronized MP4 sequence.

What this step does:
    1. Reads all PNG frames from the Kalman-corrected folder
       (`kalman_predictions/`).
    2. Retrieves the original FPS from the input ultrasound video.
    3. Creates a new MP4 video using the frames in sorted order.
    4. Ensures resolution consistency: frame size is taken from the first image.

Pipeline step:
    kalman_predictions/*.png → kalman_reconstructed_video.mp4

Notes:
    - The FPS is inherited from the original ultrasound video to keep timing
      accurate for downstream biomechanical analyses.
    - Frames must already contain the drawn distal/proximal corrected
      coordinates (produced by `process_video_with_predictions.py`).
    - The script expects filenames formatted consistently (e.g., frame_0000.png).
"""

import cv2
import os

frames_folder = '../outputs/kalman_predictions'
output_video_file = '../outputs/kalman_reconstructed_video.mp4'
original_video_path = '../datasets/videos/original_video.mp4'

def obtain_fps(original_video_path):
    cap = cv2.VideoCapture(original_video_path)
    if not cap.isOpened():
        raise ValueError(f"Error when opening the video: {original_video_path}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)  
    cap.release()

    return fps

def reconstruct_kalman_video(frames_folder, output_video_file, original_video_path):
    fps = obtain_fps(original_video_path)
    frame_files = sorted([f for f in os.listdir(frames_folder) if f.endswith('.png')])

    if not frame_files:
        print(f'There were no frames in the folder {frames_folder}')
        exit()

    os.makedirs(os.path.dirname(output_video_file), exist_ok=True)

    first_frame = cv2.imread(os.path.join(frames_folder, frame_files[0]))
    height, width, layers = first_frame.shape

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = cv2.VideoWriter(output_video_file, fourcc, fps, (width, height))

    for frame_file in frame_files:
        frame_path = os.path.join(frames_folder, frame_file)
        frame = cv2.imread(frame_path)
        video_writer.write(frame)

    video_writer.release()

    print(f'Reconstructed video saved in {output_video_file}')