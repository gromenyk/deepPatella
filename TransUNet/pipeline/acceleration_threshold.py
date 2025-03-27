import pandas as pd
import numpy as np

def euclidean_distance(x1, y1, x2, y2):
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2)

def calculate_distances_and_speeds(input_csv_path, output_csv_path):
    df = pd.read_csv(input_csv_path)
    
    delta_t = 1 / df.loc[0, 'FPS']

    distances_distal_x = [0]
    distances_distal_y = [0]
    distances_distal = [0]
    speed_distal_x = [0]
    speed_distal_y = [0]
    speed_distal = [0]
    acceleration_distal = [0]
    distances_proximal_x = [0]
    distances_proximal_y = [0]
    distances_proximal = [0]
    speed_proximal_x = [0]
    speed_proximal_y = [0]
    speed_proximal = [0]
    acceleration_proximal = [0]

    for i in range(1, len(df)):
        dist_distal = euclidean_distance(
            df.loc[i-1, 'distal_X'], df.loc[i-1, 'distal_y'],
            df.loc[i, 'distal_X'], df.loc[i, 'distal_y']
        )

        distances_distal.append(dist_distal)

        dist_proximal = euclidean_distance(
            df.loc[i-1, 'proximal_x'], df.loc[i-1, 'proximal_y'],
            df.loc[i, 'proximal_x'], df.loc[i, 'proximal_y']
        )

        distances_proximal.append(dist_proximal)

        speed_d = dist_distal / delta_t
        accel_d = abs(speed_d - speed_distal[i-1]) / delta_t

        speed_p = dist_proximal / delta_t
        accel_p = abs(speed_p - speed_proximal[i-1]) / delta_t

        speed_distal.append(speed_d)
        acceleration_distal.append(accel_d)

        speed_proximal.append(speed_p)
        acceleration_proximal.append(accel_p)

        dist_distal_x = df.loc[i, 'distal_X'] - df.loc[i-1, 'distal_X']
        dist_distal_y = df.loc[i, 'distal_y'] - df.loc[i-1, 'distal_y']

        distances_distal_x.append(dist_distal_x)
        distances_distal_y.append(dist_distal_y)

        dist_proximal_x = df.loc[i, 'proximal_x'] - df.loc[i-1, 'proximal_x']
        dist_proximal_y = df.loc[i, 'proximal_y'] - df.loc[i-1, 'proximal_y']

        distances_proximal_x.append(dist_proximal_x)
        distances_proximal_y.append(dist_proximal_y)

        speed_d_x = dist_distal_x / delta_t
        speed_d_y = dist_distal_y / delta_t

        speed_distal_x.append(speed_d_x)
        speed_distal_y.append(speed_d_y)

        speed_p_x = dist_proximal_x / delta_t
        speed_p_y = dist_proximal_y / delta_t

        speed_proximal_x.append(speed_p_x)
        speed_proximal_y.append(speed_p_y)

    df['distances_distal_x'] = distances_distal_x
    df['distances_distal_y'] = distances_distal_y
    df['distal_distance'] = distances_distal
    df['speed_distal_x'] = speed_distal_x
    df['speed_distal_y'] = speed_distal_y
    df['distal_acceleration'] = acceleration_distal
    df['distances_proximal_x'] = distances_proximal_x
    df['distances_proximal_y'] = distances_proximal_y
    df['proximal_distance'] = distances_proximal
    df['speed_proximal_x'] = speed_proximal_x
    df['speed_proximal_y'] = speed_proximal_y
    df['proximal_acceleration'] = acceleration_proximal

    df.to_csv(output_csv_path, index=False)

    print(f'df saved to {output_csv_path}.')
    return df

#calculate_distances_and_speeds(input_csv_path='../outputs/insertion_coords.csv', output_csv_path='../outputs/accelerations.csv')