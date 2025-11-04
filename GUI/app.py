import os
import subprocess
import time
import shutil
from scipy import signal
from scipy import interpolate
import numpy as np
import pandas as pd
from scipy.interpolate import interp1d
from flask import Flask, render_template, request, jsonify, send_from_directory, Response, send_file
from threading import Thread, Event

app = Flask(__name__)
progress = {
    "status": "idle",
    "percent": 0,
    "last_line": "",
    "message": "",
    "start_time": None,
    "elapsed_time": 0,
}

inference_process = None
stop_event = Event()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/baseline_calculation')
def baseline_calculation():
    return render_template('baseline_calculation.html')

@app.route('/stiffness_calculation')
def stiffness_calculation():
    return render_template('stiffness_calculation.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'video' not in request.files:
        return 'no file part'
    
    file = request.files['video']
    if file.filename == '':
        return 'no selected file'
    
    if file and allowed_file(file.filename):
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        upload_folder = os.path.join(project_root, 'TransUNet', 'datasets', 'videos')
        print(f"Intentando guardar en: {upload_folder}")

        if not os.path.exists(upload_folder):
            print(f"Creando carpeta en: {upload_folder}")
            os.makedirs(upload_folder)

        filename = 'original_video.mp4'
        filepath = os.path.join(upload_folder, filename)
        print(f"Ruta completa de carga: {filepath}")

        file.save(filepath)

        return render_template('index.html', message=f'Video uploaded successfully! Everything is set to run the inference!')
    else:
        return render_template('index.html', message='File type not allowed')
    
@app.route('/run_inference', methods=['POST'])
def run_inference():
    stop_event.clear()
    thread = Thread(target=run_inference_thread)
    thread.start()
    return render_template('index.html', message=None, inference_message='Inference started...')

def run_inference_thread():
    global progress, inference_process
    stop_requested = False
    try:
        stop_requested = False
        progress["status"] = "running"
        progress["percent"] = 0
        progress["message"] = ""
        progress["start_time"] = time.time()

        import re

        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        transunet_path = os.path.join(project_root, 'TransUNet')
        script_path = os.path.join(transunet_path, 'test.py')
        command = ['python3.8', '-u', script_path, '--dataset', 'Synapse', '--vit_name', 'R50-ViT-B_16']

        inference_process = subprocess.Popen(command, cwd=transunet_path, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        for line in inference_process.stdout:
            if stop_event.is_set():
                inference_process.terminate()
                progress['status'] = 'Stopped'
                progress['message'] = '🛑 Inference stopped by user'
                return
            
            clean_line = line.strip()
            match = re.search(r'\[PROGRESS (\d+(?:\.\d+)?)\](.*)', clean_line)
            if match:
                progress["percent"] = float(match.group(1))
                progress["message"] = match.group(2).strip()
                progress["elapsed_time"] = int(time.time() - progress["start_time"])
                print(f"[PROGRESS] {progress['percent']}% - {progress['message']}")

        inference_process.wait()

        if not stop_event.is_set():
            if inference_process.returncode == 0:
                progress["percent"] = 100
                progress["message"] = "✅ Inference completed successfully!"
                progress["status"] = "done"
            else:
                progress["message"] = "❌ Error during inference"
                progress["status"] = "error"

    except Exception as e:
        progress["last_line"] = f"❌ Exception: {str(e)}"
        progress["status"] = "error"

@app.route('/stop_inference', methods=['POST'])
def stop_inference():
    global inference_process, progress
    stop_event.set()
    if inference_process and inference_process.poll() is None:
        inference_process.terminate()
        inference_process = None
        progress['status'] = 'stopped'
        progress['message'] = '🛑 Inference manually stopped'
    return '', 204

@app.route('/progress')
def get_progress():
    elapsed_time = 0
    if progress["status"] == "running" and "start_time" in progress:
        elapsed_time = int(time.time() - progress["start_time"])
    return jsonify({
        "status": progress["status"],
        "percent": progress["percent"],
        "message": progress["message"],
        "elapsed_time": elapsed_time
    })   

def allowed_file(filename):
    allowed_extensions = {'mp4', 'avi'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

@app.route('/check_frames')
def check_frames():
    frames_dir = os.path.join('static', 'frames')
    # Verificar si el archivo frames_ready.flag está presente en el directorio
    flag_file_path = os.path.join(frames_dir, 'frames_ready.flag')
    
    if os.path.exists(flag_file_path):
        frames = [f for f in os.listdir(frames_dir) if f.endswith('.jpg') or f.endswith('.png')]
        frames_available = len(frames) > 0  # Comprobar si hay frames disponibles
        return jsonify({'frames_available': frames_available})
    else:
        return jsonify({'frames_available': False})

@app.route('/get_frames')
def get_frames():
    frames_dir = os.path.join('static', 'frames')
    try:
        frames = sorted([
            f for f in os.listdir(frames_dir)
            if f.endswith('.jpg') or f.endswith('.png')
        ])
        return jsonify({'frames': frames})
    except Exception as e:
        print(f"Error loading frames: {e}")
        return jsonify({'frames': []})
    
@app.route('/frames/<filename>')
def get_frame(filename):
    return send_from_directory(os.path.join('static', 'frames'), filename)

@app.route('/upload_force', methods=['POST'])
def upload_force():
    if 'file' not in request.files:
        return jsonify({'message': 'No file part in request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    if not file.filename.lower().endswith('.xlsx'):
        return jsonify({'message': 'Invalid file type. Please upload an .xlsx file.'}), 400

    # Guardar en GUI/static/data/force_ramp.xlsx
    save_path = os.path.join(app.static_folder, 'data', 'force_ramp.xlsx')
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    print(f"✅ Force ramp file saved at: {save_path}")
    return jsonify({'message': 'Force ramp file uploaded successfully!'})


@app.route("/cleanup", methods=["DELETE"])
def cleanup():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # a) Folders with .gitkeep
    keep_with_gitkeep = [
        os.path.join(project_root, "data", "Synapse", "test_vol_h5"),
    ]

    # b) Folders to recreate without .gitkeep
    keep_folders = []

    # c) Disposable folders
    disposable_folders = [
        os.path.join(project_root, "TransUNet", "center_of_mass_over_pred_images"),
        os.path.join(project_root, "TransUNet", "test_log"),
        os.path.join(project_root, "GUI", "static", "data"),
        os.path.join(project_root, "GUI", "static", "frames"),
        os.path.join(project_root, "TransUNet", "outputs")
    ]

    # d) Disposable files
    disposable_files = [
        os.path.join(project_root, "data", "Synapse", "original_images.npy"),
        os.path.join(project_root, "GUI", "static", "img","frame_first.png"),
        os.path.join(project_root, "TransUNet","datasets", "videos", "original_video.mp4"),
        os.path.join(project_root, "TransUNet","lists","lists_Synapse","test_vol.txt"),
        os.path.join(project_root, "TransUNet", "process_times.csv")
    ]

    try:
        # a) Folders with gitkeep
        for folder in keep_with_gitkeep:
            if os.path.isdir(folder):
                shutil.rmtree(folder)
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, ".gitkeep"), "w") as f:
                pass

        # b) Folders to recreate without gitkeep
        for folder in keep_folders:
            if os.path.isdir(folder):
                shutil.rmtree(folder)
            os.makedirs(folder, exist_ok=True)

        # c) Disposable folders
        for folder in disposable_folders:
            if os.path.isdir(folder):
                shutil.rmtree(folder)

        # d) Disposabe files
        for file in disposable_files:
            if os.path.isfile(file):
                os.remove(file)

        return jsonify({"message": "Reset worked perfectly"}), 200

    except Exception as e:
        return jsonify({"message": f"Error in reseting: {str(e)}"}), 500

@app.route('/process_force', methods=['POST'])
def process_force():
    try:
        # Routes
        data_dir = os.path.join(os.path.dirname(__file__), "static", "data")
        ramp_path = os.path.join(data_dir, "force_ramp.xlsx")
        coords_path = os.path.join(data_dir, "insertion_coords.csv")
        coords_kalman_distal_path = os.path.join(data_dir, "kalman_coords_distal.csv")
        coords_kalman_proximal_path = os.path.join(data_dir, "kalman_coords_proximal.csv")
        output_path = os.path.join(data_dir, "force_ramp_processed.csv")

        # --- Switch to use directly predicted coords, or use the kalman corrected coords ---
        use_kalman = True   # ⬅️ True = Use Kalman | False = Uses insertion_coords.csv (blunt output)

        # --- Read force ramp file (Excel) ---
        df_force = pd.read_excel(ramp_path)

        # --- Filter by sync value ---
        # df_force = df_force[df_force["Sync"] > 3.9]

        # --- Read coordinates ---
        if use_kalman:
            kalman_distal = pd.read_csv(coords_kalman_distal_path)
            kalman_proximal = pd.read_csv(coords_kalman_proximal_path)

            kalman_distal = kalman_distal[['Predicted_Distal_X', 'Predicted_Distal_Y']]
            kalman_proximal = kalman_proximal[['Predicted_Proximal_X', 'Predicted_Proximal_Y']]

            df_coords = pd.concat([kalman_distal, kalman_proximal], axis=1)
            df_coords.columns = ['distal_X', 'distal_y', 'proximal_x', 'proximal_y']
            print("📂 Usando coordenadas de archivos Kalman.")
        else:
            df_coords = pd.read_csv(coords_path)
            print("📂 Usando coordenadas de insertion_coords.csv.")

        num_frames = len(df_coords)

        # --- Parámetros ---
        fs_force = 1000.0        # frecuencia del CSV de fuerza (Hz)
        fps_video = 51.491       # frames por segundo del video

        # --- Downsampling con SciPy ---
        force_resampled = signal.resample(df_force["Force_right"], num_frames)
        #sync_resampled = signal.resample(df_force["Sync"], num_frames)
        #trigger_resampled = signal.resample(df_force["Digital trigger"], num_frames)

        df_resampled = pd.DataFrame({
            "Frame": range(1, num_frames + 1),
            "Force_right": force_resampled,
            #"Sync": sync_resampled,
            #"Digital_trigger": trigger_resampled
        })

        '''# --- Spline downsampling

        n_force = len(df_force)
        t_force = np.arange(n_force) / fs_force
        t_video = np.arange(num_frames) / fps_video

        interp_force = interp1d(
            t_force,
            df_force["Force_right"].values,
            kind="cubic",  # también podés probar 'linear' o 'quadratic'
            fill_value="extrapolate"
        )

        force_resampled = interp_force(t_video)

        df_resampled = pd.DataFrame({
            "Frame": np.arange(1, num_frames + 1),
            "Force_right": force_resampled
        })'''

        df_resampled.to_csv(output_path, index=False)

        # --- Calcular elongación en el backend ---
        if {"distal_X", "distal_y", "proximal_x", "proximal_y"}.issubset(df_coords.columns):
            distal_x = df_coords["distal_y"].values  # corrección por orden cambiado
            distal_y_fixed = df_coords["distal_X"].values
            proximal_x_fixed = df_coords["proximal_y"].values
            proximal_y_fixed = df_coords["proximal_x"].values

            elong_px = np.sqrt(
                (distal_x - proximal_x_fixed) ** 2 +
                (distal_y_fixed - proximal_y_fixed) ** 2
            )

            # Conversión px → mm
            # Recuperar factor guardado localmente en JS (o dejar fijo)
            factor_path = os.path.join(data_dir, "conversion_factor.txt")
            if os.path.exists(factor_path):
                with open(factor_path, "r") as f:
                    factor = float(f.read().strip())
            else:
                factor = 6.48  # fallback

            elong_mm = elong_px / factor
        else:
            print("⚠️ No se pudieron encontrar columnas de coordenadas para calcular elongación.")
            elong_mm = None
        
        if elong_mm is not None:
            fuerza = force_resampled

            elong_norm = elong_mm - np.mean(elong_mm)
            fuerza_norm = fuerza - np.mean(fuerza)

            corr = signal.correlate(fuerza_norm, elong_norm, mode='full')
            lags = signal.correlation_lags(len(fuerza_norm), len(elong_norm), mode='full')
            lag_opt = lags[np.argmax(corr)]
            delay_seconds = lag_opt / fps_video
            delay_frames = lag_opt

            corr_norm = corr / (len(fuerza_norm) * np.std(fuerza_norm) * np.std(elong_norm))
            max_corr_value = np.max(corr_norm)

            print(f"📊 Cross-correlation result:")
            print(f"📈 Cross-correlation peak value: {max_corr_value:.3f}")
            print(f"   → Best lag: {lag_opt} frames ({delay_seconds:.4f} s)")
            print(f"   → Positive = Force ramp is ahead of elongation")
            print(f"   → Negative = Elongation is ahead of force ramp")
        else:
            print("⚠️ No se pudo calcular elongación para correlación cruzada.")

        # --- Respuesta JSON al front-end ---
        return jsonify({
            "message": f"✅ Force ramp processed successfully using {'Kalman' if use_kalman else 'insertion'} coordinates",
            "output_file": "static/data/force_ramp_processed.csv",
            "frames": int(num_frames),
            "cross_correlation": {
                "lag_frames": int(delay_frames),
                "lag_seconds": int(delay_seconds)
            }
        }), 200

    except Exception as e:
        print(f"❌ Error processing force ramp: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
