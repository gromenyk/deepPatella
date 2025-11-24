"""
center_of_mass.py

This module takes the predicted heatmaps produced by TransUNet (one per frame),
finds the insertion coordinates (distal/proximal) using a simple center-of-mass
approach on the hottest pixels, rescales them to the original 512×512 frame
space, overlays them on the original ultrasound images, and generates:

    - A CSV file with frame-by-frame insertion coordinates
    - PNG images with overlayed centroids for visual inspection

Pipeline step:
    predicted_images + original_images → insertion_coords.csv + placed_centroids/
"""

import os
import numpy as np
import matplotlib.pyplot as plt
from scipy.ndimage import center_of_mass
from PIL import Image
import pandas as pd
import cv2
import json

NPZ_FOLDER = './data/Synapse/test_vol_h5'
PREDICTED_IMAGES_FOLDER = './predicted_images'
PLACED_CENTROIDS = './outputs/placed_center_of_mass'
CENTROID_OVER_PRED_IMAGE = './center_of_mass_over_pred_images'
ORIGINAL_IMAGES_FILE = '../data/Synapse/original_images.npy'
CSV_OUTPUT_PATH = './outputs/insertion_coords.csv'
ORIGINAL_VIDEO_PATH = './datasets/videos/original_video.mp4'
CSV_KALMAN_PATH = './outputs/kalman_coordinates.csv'


os.makedirs(PLACED_CENTROIDS, exist_ok=True)
os.makedirs(CENTROID_OVER_PRED_IMAGE, exist_ok=True)

def find_centers_of_mass_for_hottest_pixels(prediction):
    h, w = prediction.shape
    mid = w // 2

    left_half = prediction[:, :mid]
    right_half = prediction[:, mid:]

    left_max_value = np.max(left_half)
    right_max_value = np.max(right_half)

    left_mask = (left_half == left_max_value).astype(np.float32)
    right_mask = (right_half == right_max_value).astype(np.float32)

    left_com = center_of_mass(left_mask)
    right_com = center_of_mass(right_mask)

    left_center = (left_com[0], left_com[1])
    right_center = (right_com[0], right_com[1] + mid)

    return left_center, right_center

def place_centroids(npz_files, predictions_dir, original_images_file, placed_centroids_folder, csv_output_path):

    cap = cv2.VideoCapture(ORIGINAL_VIDEO_PATH)
    if not cap.isOpened():
        raise ValueError(f"Error when opening the video: {ORIGINAL_VIDEO_PATH}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)  # Obtener FPS
    cap.release()
    
    ORIGINAL_SIZE = (512, 512)
    PREDICTION_SIZE = (224, 224)
    SCALE_X = ORIGINAL_SIZE[1] / PREDICTION_SIZE[1]
    SCALE_Y = ORIGINAL_SIZE[0] / PREDICTION_SIZE[0]

    original_images = np.load(original_images_file)

    os.makedirs(placed_centroids_folder, exist_ok=True)

    left_center_list = []
    right_center_list = []

    csv_data = []

    for npz_file in os.listdir(npz_files):
        if not npz_file.endswith('.npz'):
            continue

        data = np.load(os.path.join(npz_files, npz_file))
        image = data['image']

        prediction_path = os.path.join(predictions_dir, npz_file.replace('.npz', '_prediction.png'))
        if not os.path.exists(prediction_path):
            print(f'No prediction found for {npz_file}')
            continue

        prediction_image = Image.open(prediction_path).convert('L')
        prediction = np.array(prediction_image, dtype=np.float32) / 255.0

        left_center, right_center = find_centers_of_mass_for_hottest_pixels(prediction)

        scaled_left = ((left_center[0] * SCALE_Y), (left_center[1] * SCALE_X))
        scaled_right = ((right_center[0] * SCALE_Y), (right_center[1] * SCALE_X))

        left_center_list.append(scaled_left)
        right_center_list.append(scaled_right)

        csv_data.append([scaled_left[0], scaled_left[1], scaled_right[0], scaled_right[1], fps])


        frame_index = int(npz_file.split('_')[1].split('.')[0])
        original_image = original_images[frame_index]

        save_centroid_image(original_image, scaled_left, scaled_right, npz_file, placed_centroids_folder)

    df = pd.DataFrame(csv_data, columns=['distal_X', 'distal_y', 'proximal_x', 'proximal_y', 'FPS'])
    df = df.astype({'distal_X': 'float64', 'distal_y': 'float64', 'proximal_x': 'float64', 'proximal_y': 'float64', 'FPS': 'float64'})
    df.to_csv(csv_output_path, index=False, float_format='%.10f')
    print(f'Coordinates CSV saved in {csv_output_path}')


def save_centroid_image(original_image, scaled_left, scaled_right, npz_file, placed_centroids):
    fig, ax = plt.subplots()
    ax.imshow(original_image, cmap='gray')
    ax.scatter(scaled_left[1], scaled_left[0], c='green', label='Left Center', s=20)
    ax.scatter(scaled_right[1], scaled_right[0], c='blue', label='Right Center', s=20)
    ax.set_title('Insertion Predictions')

    output_path = os.path.join(placed_centroids, npz_file.replace('.npz', '_with_centroids.png'))
    plt.savefig(output_path)
    plt.close()


if __name__ == "__main__":
    place_centroids(NPZ_FOLDER, PREDICTED_IMAGES_FOLDER, ORIGINAL_IMAGES_FILE, PLACED_CENTROIDS, CSV_OUTPUT_PATH)



