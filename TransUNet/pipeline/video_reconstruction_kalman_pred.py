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

#reconstruct_kalman_video(frames_folder, output_video_file)