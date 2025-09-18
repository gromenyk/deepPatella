import argparse
import logging
import os
import random
import sys
import numpy as np
import wandb
import io
import torch
import torch.backends.cudnn as cudnn
import torch.nn as nn
import matplotlib.pyplot as plt
import time
import csv
import functools
import shutil
from pipeline.video_preprocessing import process_video
from pipeline.video_input import frame_split
from pipeline.list_generator import npz_files_list
from pipeline.center_of_mass import place_centroids
from pipeline.video_reconstruction import reconstruct_video
from pipeline.acceleration_threshold import calculate_distances_and_speeds
from pipeline.kalman_distal import apply_kalman_filter_distal
from pipeline.kalman_proximal import apply_kalman_filter_proximal
from pipeline.kalman_video_application import process_video_with_predictions
from pipeline.video_reconstruction_kalman_pred import reconstruct_kalman_video
from torch.utils.data import DataLoader
from PIL import Image
from tqdm import tqdm
from datasets.dataset_synapse import Synapse_dataset
from utils import test_single_volume
from networks.vit_seg_modeling import VisionTransformer as ViT_seg
from networks.vit_seg_modeling import CONFIGS as CONFIGS_ViT_seg

#os.environ['WANDB_MODE'] = 'disabled'  # Disable wandb online mode
#wandb.init(project = 'deeppatella', group = 'testing', name = 'test_data_augmentation_13_02_2025', resume = 'allow', mode='offline')
print = functools.partial(print, flush=True)

def log_time_to_csv(step_name, start_time, end_time, filename='./process_times.csv'):
    elapsed_time = end_time - start_time
    with open(filename, mode='a', newline='') as file:
        writer = csv.writer(file)
        # Si el archivo está vacío, escribe las cabeceras
        if file.tell() == 0:
            writer.writerow(['Step', 'Start Time', 'End Time', 'Elapsed Time (seconds)'])
        writer.writerow([step_name, time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(start_time)),
                         time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(end_time)), elapsed_time])

def log_time(step_name, start_time=None, filename='process_times.csv'):
    """Función para registrar el tiempo de cada paso y mostrarlo"""
    current_time = time.time()  # Captura el tiempo actual en segundos desde la época
    formatted_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(current_time))  # Formatea el tiempo
    if start_time:
        elapsed_time = current_time - start_time
        print(f"{step_name} - Tiempo transcurrido: {elapsed_time:.2f} segundos")
        log_time_to_csv(step_name, start_time, current_time, filename)  # Guardar tiempo en CSV
    else:
        print(f"{step_name} - {formatted_time}")
    return current_time

# Function to copy output video to static folder
def copy_video_to_static():
    project_root_dir = os.path.abspath(os.path.join(os.getcwd(), '..')) 

    source_file = os.path.join(project_root_dir, 'TransUNet', 'outputs', 'kalman_reconstructed_video.mp4')
    target_dir = os.path.join(project_root_dir, 'GUI', 'static', 'output')
    target_file = os.path.join(target_dir, 'kalman_reconstructed_video.mp4')

    if not os.path.exists(source_file):
        print(f"El archivo de origen {source_file} no existe. Verifica que haya sido generado.")
        return

    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        print(f"Directorio {target_dir} creado.")

    try:
        shutil.copy(source_file, target_file)
        print(f"Copiado {source_file} -> {target_file}")
    except Exception as e:
        print(f"Error al copiar {source_file}: {e}")

# Function to copy frames to static
def copy_frames_to_static():
    project_root_dir = os.path.abspath(os.path.join(os.getcwd(), '..')) 

    source_dir = os.path.join(project_root_dir, 'TransUNet', 'outputs', 'kalman_predictions')
    target_dir = os.path.join(project_root_dir, 'GUI', 'static', 'frames')

    if not os.path.exists(source_dir):
        print(f"El directorio de origen {source_dir} no existe. Verifica que los archivos de salida hayan sido generados.")
        return

    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        print(f"Directorio {target_dir} creado.")

    for file in os.listdir(source_dir):
        if file.endswith('_with_coordinates.png'):  
            source_file = os.path.join(source_dir, file)
            target_file = os.path.join(target_dir, file)
            try:
                shutil.copy(source_file, target_file)
                print(f"Copiado {source_file} -> {target_file}")
            except Exception as e:
                print(f"Error al copiar {source_file}: {e}")

    flag_file_path = os.path.join(target_dir, 'frames_ready.flag')
    with open(flag_file_path, 'w') as f:
        f.write('ready')

    print('[frames_ready.flag creado]')

# Function to copy insertion_coords.csv to static
def copy_csv_to_static():
    project_root_dir = os.path.abspath(os.path.join(os.getcwd(), '..'))

    source_file = os.path.join(project_root_dir, 'TransUNet', 'outputs', 'insertion_coords.csv')
    target_dir = os.path.join(project_root_dir, 'GUI', 'static', 'data')
    target_file = os.path.join(target_dir, 'insertion_coords.csv')

    if not os.path.exists(source_file):
        print(f"[ERROR] El archivo {source_file} no existe. Verifica que la inferencia haya generado insertion_coords.csv")
        return

    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        print(f"[INFO] Carpeta creada: {target_dir}")

    try:
        shutil.copy(source_file, target_file)
        print(f"[UI] Copiado {source_file} → {target_file}")
    except Exception as e:
        print(f"[ERROR] No se pudo copiar {source_file}: {e}")

parser = argparse.ArgumentParser()
parser.add_argument('--volume_path', type=str,
                    default='../data/Synapse/test_vol_h5', help='root dir for validation volume data')  # for acdc volume_path=root_dir
parser.add_argument('--dataset', type=str,
                    default='Synapse', help='experiment_name')
parser.add_argument('--num_classes', type=int,
                    default=1, help='output channel of network')
parser.add_argument('--list_dir', type=str,
                    default='./lists/lists_Synapse', help='list dir')

parser.add_argument('--max_iterations', type=int,default=20000, help='maximum epoch number to train')
parser.add_argument('--max_epochs', type=int, default=5, help='maximum epoch number to train')
parser.add_argument('--batch_size', type=int, default=12,
                    help='batch_size per gpu')
parser.add_argument('--img_size', type=int, default=224, help='input patch size of network input')
parser.add_argument('--is_savenii', action="store_true", help='whether to save results during inference')

parser.add_argument('--n_skip', type=int, default=3, help='using number of skip-connect, default is num')
parser.add_argument('--vit_name', type=str, default='ViT-B_16', help='select one vit model')

parser.add_argument('--test_save_dir', type=str, default='./predictions', help='saving prediction as nii!')
parser.add_argument('--deterministic', type=int,  default=1, help='whether use deterministic training')
parser.add_argument('--base_lr', type=float,  default=0.005, help='segmentation network learning rate')
parser.add_argument('--seed', type=int, default=1234, help='random seed')
parser.add_argument('--vit_patches_size', type=int, default=16, help='vit_patches_size, default is 16')
parser.add_argument('--original_video_path', type=str, default='./datasets/videos/original_video.mp4', help='path to the input video')
parser.add_argument('--preprocessed_video_path', type=str, default='./outputs/preprocessed_video.mp4', help='cropped and scaled video')
parser.add_argument('--original_images', type=str, default='../data/Synapse/original_images.npy', help='path to saved original images')
parser.add_argument('--npz_files', type=str, default='../data/Synapse/test_vol_h5', help='Path to the NPZ files folder')
parser.add_argument('--output_txt_file', type=str, default='./lists/lists_Synapse/test_vol.txt', help='Output folder for the txt file')
parser.add_argument('--csv_with_coords_output_folder', type=str, default='./outputs/insertion_coords.csv')
parser.add_argument('--accelerations_threshold_csv', type=str, default='./outputs/accelerations.csv', help='CSV with accelerations threshold')
parser.add_argument('--accelerations_threshold', type=int, default=0, help='accelerations threshold')
parser.add_argument('--kalman_coordinates_distal', type=str, default='./outputs/kalman_coords_distal.csv', help='corrected distal coordinates by kalman filter')
parser.add_argument('--kalman_coordinates_proximal', type=str, default='./outputs/kalman_coords_proximal.csv', help='corrected proximal coordinates by kalman filter')
parser.add_argument('--kalman_coords_plot_distal', type=str, default='./outputs/kalman_plot_distal.png', help='plot of the corrected distal coordinates by the Kalman filter')
parser.add_argument('--kalman_coords_plot_proximal', type=str, default='./outputs/kalman_plot_proximal.png', help='plot of the corrected proximal coordinates by the Kalman filter')
parser.add_argument('--kalman_input_images', type=str, default='./outputs/kalman_predictions', help='folder for the input images for kalman video reconstruction')
parser.add_argument('--kalman_video_reconstruction', type=str, default='./outputs/kalman_reconstructed_video.mp4', help='folder for the reconstrcuted video with kalman predictions')
parser.add_argument('--predictions_dir', type=str, default='./outputs/predicted_images', help='Predicted images folder')
parser.add_argument('--original_images_file', type=str, default='../data/Synapse/original_images.npy', help='path to the original images numpy file')
parser.add_argument('--placed_centroids_folder', type=str, default='./outputs/placed_center_of_mass', help='placed centroids folder')
parser.add_argument('--output_video_file', type=str, default='./outputs/reconstructed_video.mp4', help='folder for the output video with insertions')
args = parser.parse_args()

# Video preprocessing block
print('[UI] Preprocessing video...')
start_time_video_processing = log_time('Preprocessing video...')

try:
    process_video(args.original_video_path, args.preprocessed_video_path)
except Exception as e:
    print(f'Error encountered when preprocessing the original video: {e}')
    exit(1)

end_time_video_processing = time.time()
log_time_to_csv('Video Processing', start_time_video_processing, end_time_video_processing)
print('[PROGRESS 9.1] Finished video preprocessing')

# Video splitting block
print('[UI] Splitting video into frames...')
start_time_video_splitting = log_time('Splitting video into frames')

try:
    frame_split(args.preprocessed_video_path, args.volume_path, args.original_images)
except Exception as e:
    print(f'Error encountered during video pre-processing: {e}')
    exit(1)

# Copy first frame in 512 x 512 to static folder for baseline calculation
try:
    frames = np.load(args.original_images)
    first_frame = frames[0]

    # Convertir a escala de grises si es RGB/BGR
    if first_frame.ndim == 3 and first_frame.shape[2] == 3:
        import cv2
        first_frame = cv2.cvtColor(first_frame, cv2.COLOR_BGR2GRAY)

    # Normalizar a [0, 255]
    first_frame = first_frame.astype(np.float32)
    first_frame = (first_frame - first_frame.min()) / (first_frame.max() - first_frame.min() + 1e-8)
    first_frame = (first_frame * 255).astype(np.uint8)

    img = Image.fromarray(first_frame, mode='L')

    project_root_dir = os.path.abspath(os.path.join(os.getcwd(), '..'))
    static_img_dir = os.path.join(project_root_dir, 'GUI', 'static', 'img')
    os.makedirs(static_img_dir, exist_ok=True)

    output_path = os.path.join(static_img_dir, 'frame_first.png')
    img.save(output_path)

    print(f"[UI] First frame saved in {output_path}")
except Exception as e:
    print(f"[ERROR] Could not extract the first frame {e}")



end_time_video_splitting = time.time()
log_time_to_csv('Video splitting', start_time_video_splitting, end_time_video_splitting)
print('[PROGRESS 18.2] Finished splitting video into frames')

# NPZ file list generation
print('[UI] Generating NPZ file list...')
start_time_npz_file_list_creation = log_time('Generating NPZ file list')

try:
    npz_files_list(args.npz_files, args.output_txt_file)
    print ('NPZ files list generated in {output_txt_file}')
except Exception as e:
    print(f'Could not generate the NPZ list: {e}')
    exit(1)

end_time_npz_file_list_creation = time.time()
log_time_to_csv('NPZ file list creation', start_time_npz_file_list_creation, end_time_npz_file_list_creation)
print('[PROGRESS 27.3] Finished creating the NPZ files list')


def inference(args, model, test_save_path=None):
    db_test = args.Dataset(base_dir=args.volume_path, split="test_vol", list_dir=args.list_dir)
    testloader = DataLoader(db_test, batch_size=1, shuffle=False, num_workers=1)
    logging.info("{} test iterations per epoch".format(len(testloader)))
    model.eval()
    metric_list = 0.0

    ### GR: save predictions to folder

    predictions_dir = './outputs/predicted_images'
    os.makedirs(predictions_dir, exist_ok=True)

    ### Resume original code

    for i_batch, sampled_batch in tqdm(enumerate(testloader)):
        h, w = sampled_batch["image"].size()[2:]
        image, label, case_name = sampled_batch["image"], sampled_batch["label"], sampled_batch['case_name'][0]
        with torch.no_grad():
            output = model(image.to(torch.float32).cuda())
            prediction = torch.sigmoid(output).squeeze(0).cpu().detach().numpy()

        if test_save_path:
            np.save(os.path.join(test_save_path, f"{case_name}_prediction.npy"), prediction)

        ### GR: save prediction as image

        prediction_image_path = os.path.join(predictions_dir, f'{case_name}_prediction.png')
        plt.imsave(prediction_image_path, prediction.squeeze(), cmap='hot')

        #raw_prediction_path = os.path.join(predictions_dir, f'{case_name}_prediction_raw.npy')
        #np.save(raw_prediction_path, prediction)  # Guarda la matriz original sin alteraciones

        fig, ax = plt.subplots()
        ax.imshow(prediction.squeeze(), cmap='hot')
        ax.set_title('Prediction')
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        plt.close(fig)

        prediction_image = Image.open(buf)

        #wandb.log({
        #    f'Image {case_name}': wandb.Image(image[0,0].cpu().numpy(), caption='Original Image'),
        #    f'Prediction {case_name}': wandb.Image(prediction_image, caption='Prediction')            
        #})

    return "Testing Finished!"

if __name__ == "__main__":

    if not args.deterministic:
        cudnn.benchmark = True
        cudnn.deterministic = False
    else:
        cudnn.benchmark = False
        cudnn.deterministic = True
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed(args.seed)

    dataset_config = {
        'Synapse': {
            'Dataset': Synapse_dataset,
            'volume_path': '../data/Synapse/test_vol_h5',
            'list_dir': './lists/lists_Synapse',
            'num_classes': 1,
            'z_spacing': 1,
        },
    }
    dataset_name = args.dataset
    args.num_classes = dataset_config[dataset_name]['num_classes']
    args.volume_path = dataset_config[dataset_name]['volume_path']
    args.Dataset = dataset_config[dataset_name]['Dataset']
    args.list_dir = dataset_config[dataset_name]['list_dir']
    args.z_spacing = dataset_config[dataset_name]['z_spacing']
    args.is_pretrain = True

    # name the same snapshot defined in train script!
    args.exp = 'TU_' + dataset_name + str(args.img_size)
    snapshot_path = "../model/{}/{}".format(args.exp, 'TU')
    snapshot_path = snapshot_path + '_pretrain' if args.is_pretrain else snapshot_path
    snapshot_path += '_' + args.vit_name
    snapshot_path = snapshot_path + '_skip' + str(args.n_skip)
    snapshot_path = snapshot_path + '_vitpatch' + str(args.vit_patches_size) if args.vit_patches_size!=16 else snapshot_path
    snapshot_path = snapshot_path + '_epo' + str(args.max_epochs) if args.max_epochs != 30 else snapshot_path
    if dataset_name == 'ACDC':  # using max_epoch instead of iteration to control training duration
        snapshot_path = snapshot_path + '_' + str(args.max_iterations)[0:2] + 'k' if args.max_iterations != 30000 else snapshot_path
    snapshot_path = snapshot_path+'_bs'+str(args.batch_size)
    snapshot_path = snapshot_path + '_lr' + str(args.base_lr) if args.base_lr != 0.01 else snapshot_path
    snapshot_path = snapshot_path + '_'+str(args.img_size)
    snapshot_path = snapshot_path + '_s'+str(args.seed) if args.seed!=1234 else snapshot_path

    config_vit = CONFIGS_ViT_seg[args.vit_name]
    config_vit.n_classes = args.num_classes
    config_vit.n_skip = args.n_skip
    config_vit.patches.size = (args.vit_patches_size, args.vit_patches_size)
    if args.vit_name.find('R50') !=-1:
        config_vit.patches.grid = (int(args.img_size/args.vit_patches_size), int(args.img_size/args.vit_patches_size))
    net = ViT_seg(config_vit, img_size=args.img_size, num_classes=config_vit.n_classes).cuda()

    snapshot = os.path.join(snapshot_path, 'best_model.pth')
    if not os.path.exists(snapshot): snapshot = snapshot.replace('best_model', 'epoch_'+str(args.max_epochs-1))
    #net.load_state_dict(torch.load(snapshot))

    
    checkpoint = torch.load(snapshot)

    # Aplicar los pesos al modelo permitiendo diferencias en las claves
    missing_keys, unexpected_keys = net.load_state_dict(checkpoint, strict=False)

    # Registrar las claves que no se pudieron cargar
    print("\n--- Claves no encontradas en el checkpoint (no se cargaron) ---")
    for key in missing_keys:
        print(key)

    print("\n--- Claves inesperadas en el checkpoint (no esperadas en el modelo) ---")
    for key in unexpected_keys:
        print(key)

    snapshot_name = snapshot_path.split('/')[-1]

    log_folder = './test_log/test_log_' + args.exp
    os.makedirs(log_folder, exist_ok=True)
    logging.basicConfig(filename=log_folder + '/'+snapshot_name+".txt", level=logging.INFO, format='[%(asctime)s.%(msecs)03d] %(message)s', datefmt='%H:%M:%S')
    logging.getLogger().addHandler(logging.StreamHandler(sys.stdout))
    logging.info(str(args))
    logging.info(snapshot_name)

    # Running the inference
    print('[UI] Running Inference...')
    start_time_inference = log_time('Starting inference...')

    if args.is_savenii:
        args.test_save_dir = './predictions'
        test_save_path = os.path.join(args.test_save_dir, args.exp, snapshot_name)
        os.makedirs(test_save_path, exist_ok=True)
    else:
        test_save_path = None
    inference(args, net, test_save_path)

    end_time_inference = time.time()
    log_time_to_csv('Inference', start_time_inference, end_time_inference)
    print('[PROGRESS 36.4] Finished running inference...')

    #wandb.finish()

print('[UI] Plotting insertion coordinates over original images...')
start_time_insertion_coords_plotting = log_time('Plotting insertion coordinates over original images...')
place_centroids(args.npz_files, args.predictions_dir, args.original_images_file, args.placed_centroids_folder, args.csv_with_coords_output_folder)
end_time_insertion_coords_plotting = time.time()
log_time_to_csv('Insertion Plotting', start_time_insertion_coords_plotting, end_time_insertion_coords_plotting)
print('[PROGRESS 45.5] Finished plotting insertion coordinates')

print('[UI] Building video with predictions')
start_time_build_video_with_preds = log_time('Building video with predictions')
reconstruct_video(args.placed_centroids_folder, args.output_video_file)
end_time_build_video_with_preds = time.time()
log_time_to_csv('Video reconstruction Transunet coords', start_time_build_video_with_preds, end_time_build_video_with_preds)
print('[PROGRESS 54.6] Finished building video with TransUNet predictions')

print('[UI] Obtaining acceleration threshold')
start_time_obtain_accel_threshold = log_time('Obtaining acceleration threshold')
calculate_distances_and_speeds(args.csv_with_coords_output_folder, args.accelerations_threshold_csv)
end_time_obtain_accel_threshold = time.time()
log_time_to_csv('Acceleration threshold obtention', start_time_obtain_accel_threshold, end_time_obtain_accel_threshold)
print('[PROGRESS 63.7] Finished obtaining acceleration threshold')

print('[UI] Applying Kalman filter for the fistak insertion')
start_time_apply_kalman_distal = log_time('Applying Kalman filter for the distal insertion')
apply_kalman_filter_distal(args.accelerations_threshold_csv, args.kalman_coordinates_distal, args.kalman_coords_plot_distal, args.accelerations_threshold)
end_time_apply_kalman_distal = time.time()
log_time_to_csv('Kalman filter for distal insertion applied', start_time_apply_kalman_distal, end_time_apply_kalman_distal)
print('[PROGRESS 72.8] Finished applyin Kalman filter to distal insertions')

print('[UI] Applying Kalman filter for the proximal insertion')
start_time_apply_kalman_proximal = log_time('Applying Kalman filter for the proximal insertion')
apply_kalman_filter_proximal(args.accelerations_threshold_csv, args.kalman_coordinates_proximal, args.kalman_coords_plot_proximal, args.accelerations_threshold)
end_time_apply_kalman_proximal = time.time()
log_time_to_csv('Kalman filter for proximal insertion applied', start_time_apply_kalman_proximal, end_time_apply_kalman_proximal)
print('[PROGRESS 81.9] Finished applying Kalman filter to proximal insertions')

print('[UI] Generating image inputs corrected by Kalman filter for video reconstruction')
start_time_corrected_kalman_coords = log_time('Generating image inputs corrected by Kalman filter for video reconstruction')
process_video_with_predictions(args.kalman_coordinates_distal, args.kalman_coordinates_proximal, args.original_images_file, args.kalman_input_images)
end_time_corrected_kalman_coords = time.time()
log_time_to_csv('Finished generating image inputs corrected by Kalman filter for video reconstruction', start_time_corrected_kalman_coords, end_time_corrected_kalman_coords)
print('[PROGRESS 91.0] Finished plotting insertion coordinates corrected by Kalman filter')

print('[UI] Reconstructing video corrected by Kalman filter')
start_time_kalman_video_build = log_time('Reconstructing video corrected by Kalman filter')
reconstruct_kalman_video(args.kalman_input_images, args.kalman_video_reconstruction, args.original_video_path)
end_time_kalman_video_build = time.time()
log_time_to_csv('Video corrected by Kalman filter reconstruction finished', start_time_kalman_video_build, end_time_kalman_video_build)
print('[PROGRESS 100.0] Finished reconstructing video with Kalman corrected coordinates')

copy_frames_to_static()
copy_csv_to_static()

print('[Process Completed]')


