"""
kalman_video_applicaton.py

This module takes the Kalman-corrected distal and proximal coordinates
(from the two CSV files) and overlays them onto the original ultrasound
frames stored in a .npy file. Each frame is reconstructed with both
insertions plotted as colored circles and stored as individual PNGs.

The module performs:
    - Loading of original 512×512 frames from a NumPy array
    - Overlay of distal and proximal Kalman-filtered coordinates
    - Export of frame-by-frame PNG images for later video reconstruction

Pipeline step:
    kalman_coords_distal.csv + kalman_coords_proximal.csv + original_images.npy
        → kalman_predictions/frame_XXXX_with_coordinates.png
"""

import os
import numpy as np
import pandas as pd
import cv2

def process_video_with_predictions(CSV_PATH_DISTAL, CSV_PATH_PROXIMAL, NPY_PATH, OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    df_distal = pd.read_csv(CSV_PATH_DISTAL)
    df_proximal = pd.read_csv(CSV_PATH_PROXIMAL)

    original_images = np.load(NPY_PATH)  

    for i, row in df_distal.iterrows():
        if i >= len(original_images):
            print(f"Warning: no image for corresponding frame {i}.")
            continue

        original_image = original_images[i]

        if original_image.dtype != np.uint8:
            original_image = (original_image * 255).astype(np.uint8)  
        
        if len(original_image.shape) == 2:  
            original_image = cv2.cvtColor(original_image, cv2.COLOR_GRAY2BGR)

        predicted_distal_x = int(row['Predicted_Distal_X'])  
        predicted_distal_y = int(row['Predicted_Distal_Y'])

        cv2.circle(original_image, (predicted_distal_y, predicted_distal_x), 4, (0, 255, 0), -1)

        output_path = os.path.join(OUTPUT_FOLDER, f'frame_{i:04d}_with_coordinates.png')
        cv2.imwrite(output_path, original_image)

    for i, row in df_proximal.iterrows():
        if i >= len(original_images):
            print(f"Warning: no corresponding image for frame {i}.")
            continue

        original_image = original_images[i]

        if original_image.dtype != np.uint8:
            original_image = (original_image * 255).astype(np.uint8) 
        
        if len(original_image.shape) == 2:  
            original_image = cv2.cvtColor(original_image, cv2.COLOR_GRAY2BGR)

        predicted_proximal_x = int(row['Predicted_Proximal_X'])  
        predicted_proximal_y = int(row['Predicted_Proximal_Y'])

        cv2.circle(original_image, (predicted_proximal_y, predicted_proximal_x), 4, (0, 255, 0), -1)

        output_path = os.path.join(OUTPUT_FOLDER, f'frame_{i:04d}_with_coordinates.png')
        cv2.imwrite(output_path, original_image)

    print("Process completed. Images with new coordinates saved in:", OUTPUT_FOLDER)


CSV_PATH_DISTAL = '../outputs/kalman_coords_distal.csv'  
CSV_PATH_PROXIMAL = '../outputs/kalman_coords_proximal.csv'
NPY_PATH = '../../data/Synapse/original_images.npy'  
OUTPUT_FOLDER = '../outputs/kalman_predictions'  






