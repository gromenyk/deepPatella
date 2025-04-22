from filterpy.kalman import KalmanFilter
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def apply_kalman_filter_proximal(input_csv_path, output_csv_path, output_plot_path, umbral_acceleration):
    # Leer el archivo CSV con los datos
    df = pd.read_csv(input_csv_path)

    # Kalman filter initialization
    kf = KalmanFilter(dim_x=4, dim_z=2)

    # First values from the dataframe
    initial_x = df['proximal_x'].iloc[0]
    initial_y = df['proximal_y'].iloc[0]
    initial_speed_x = df['speed_proximal_x'].iloc[0]
    initial_speed_y = df['speed_proximal_y'].iloc[0]

    # Initial state
    kf.x = np.array([initial_x, initial_speed_x, initial_y, initial_speed_y])

    # Transition matrix
    fps = df['FPS'].iloc[0]
    delta_t = 1 / fps

    F = np.array([[1, delta_t, 0, 0],
                  [0, 1, 0, 0],
                  [0, 0, 1, delta_t],
                  [0, 0, 0, 1]])

    kf.F = F

    # Covariance matrix
    kf.P = np.eye(4) * 0.1  # We set a low uncertainty regarding the initial coordinates.

    kf.Q = np.eye(4) * 0.1  # System noise
    kf.R = np.array([[1, 0],
                     [0, 1]])  # Measurement noise
    kf.H = np.array([[1, 0, 0, 0],
                     [0, 0, 1, 0]])  # Just measure x and y 

    predictions = []
    real_x = []
    real_y = []

    # Application of the Kalman filter to each row of the dataframe
    for i, row in df.iterrows():
        accel = row['proximal_acceleration']

        real_x.append(row['proximal_x'])  
        real_y.append(row['proximal_y'])  

        # We predict ALWAYS
        kf.predict()

        # Only update coordinates if the acceleration exceeds the threshold
        if accel >= umbral_acceleration:
            z = np.array([row['proximal_x'], row['proximal_y']])
            kf.update(z)
        # Coordinates replacement
            predictions.append([kf.x[0], kf.x[2]])
        else:
        # If threshold is not exceeded, keep original coordinates.
            predictions.append([row['proximal_x'], row['proximal_y']])

    predictions_df = pd.DataFrame(predictions, columns=['predicted_proximal_x', 'predicted_proximal_y'])

    df['Predicted_Proximal_X'] = predictions_df['predicted_proximal_x']
    df['Predicted_Proximal_Y'] = predictions_df['predicted_proximal_y']

    df.to_csv(output_csv_path, index=False)

    plt.plot(df.index, real_x, label='X TransUNet Predicted Position', color='blue')  
    plt.plot(df.index, real_y, label='Y TransUNet Predicted Position', color='green')  

    plt.plot(df.index, predictions_df['predicted_proximal_x'], label='X Predicted Position', linestyle='-', color='red')  
    plt.plot(df.index, predictions_df['predicted_proximal_y'], label='Y Predicted Position', linestyle='-', color='orange') 

    plt.legend()
    plt.xlabel('Frame')
    plt.ylabel('Position')
    plt.title('Real Position vs. Predicted Position over Frames- Proximal')

    plt.savefig(output_plot_path)
    plt.close()  

    print(f'Gráfica guardada en {output_plot_path}.')
    print(f'Datos con predicciones guardados en {output_csv_path}.')

    return df

#apply_kalman_filter_proximal(input_csv_path='../outputs/accelerations.csv', output_csv_path='../outputs/kalman_coords_proximal.csv', output_plot_path='../outputs/kalman_plot_proximal.png', umbral_acceleration=1376)