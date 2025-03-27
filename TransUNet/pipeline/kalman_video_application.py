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
            print(f"Advertencia: No hay imagen correspondiente para el frame {i}.")
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

    print("Proceso completado. Imágenes con nuevas coordenadas guardadas en:", OUTPUT_FOLDER)


CSV_PATH_DISTAL = '../outputs/kalman_coords_distal.csv'  
CSV_PATH_PROXIMAL = '../outputs/kalman_coords_proximal.csv'
NPY_PATH = '../../data/Synapse/original_images.npy'  
OUTPUT_FOLDER = '../outputs/kalman_predictions'  

#process_video_with_predictions(CSV_PATH_DISTAL='../outputs/kalman_coords_distal.csv', CSV_PATH_PROXIMAL='../outputs/kalman_coords_proximal.csv', NPY_PATH='../../data/Synapse/original_images.npy', OUTPUT_FOLDER='../outputs/kalman_predictions')






