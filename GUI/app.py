"""
server.py — DeepPatella Backend API
-----------------------------------

This module implements the complete backend logic for the DeepPatella GUI.
It provides video upload, model inference, frame serving, Kalman-corrected
coordinate editing, baseline processing, force-ramp synchronization, stiffness
calculation, cleanup utilities and progress tracking.

The backend is built with Flask and interacts with:
    - The TransUNet inference pipeline (via subprocess)
    - Cached clean frames stored in NPZ format
    - Kalman-filtered coordinate CSVs
    - Client-side JavaScript modules (upload.js, frames.js,
      inference.js, correction_frames.js, baseline.js, stiffness.js)

MAIN RESPONSIBILITIES
---------------------
1. Serve the three UI pages:
       • "/"                      → Video Processing
       • "/baseline_calculation"  → Rest-length computation
       • "/stiffness_calculation" → Force/elongation processing

2. Handle video upload:
       • Saves uploaded ultrasound video into TransUNet/datasets/videos
       • Persists original filename for GUI display

3. Run deep-learning inference (asynchronous thread):
       • Launches test.py via subprocess
       • Streams stdout to update a global progress dictionary
       • Supports manual stopping using a stop event

4. Expose inference progress:
       • "/progress" returns percent, status, message, elapsed time

5. Serve extracted frames:
       • "/check_frames"     → verify if frames exist
       • "/get_frames"       → list available frames
       • "/frames/<name>"    → serve single frame file

6. Serve *clean* TransUNet output frames (from NPZ cache):
       • "/clean_frame/<i>"        → image bytes from memory
       • "/clean_frame_count"      → total number of cached frames

7. Baseline calculation support (coordinates):
       • Provides Kalman coordinates to the GUI
       • Allows editing them interactively
       • "/update_coords" overwrites corrected values in CSVs
       • "/reset_coords" restores backups

8. Force-ramp processing:
       • Reads uploaded Excel file (“force_ramp.xlsx”)
       • Downsamples force to match video frames
       • Loads distal/proximal tendon coordinates
       • Computes tendon elongation in px → mm
       • Performs cross-correlation to align force / elongation
       • Saves processed CSV for stiffness module

9. Cleanup/reset utility:
       • Removes temporary folders and files
       • Regenerates .gitkeep when required
       • Resets internal progress state

NOTE
----
This file contains all backend routes and state management. 
Front-end logic is handled exclusively by JavaScript modules 
in /static/js/.

"""

import os
import subprocess
import time
import shutil
import numpy as np
import io
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

# Helpers and others
## Check file extension
def allowed_file(filename):
    allowed_extensions = {'mp4', 'avi'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

# Serve clean frames directly from memory cache
CLEAN_FRAMES_CACHE = None

# Render homepage 
@app.route('/')
def home():
    return render_template('index.html')

# Render baseline calculation page
@app.route('/baseline_calculation')
def baseline_calculation():
    return render_template('baseline_calculation.html')

# Render stiffness calculation page
@app.route('/stiffness_calculation')
def stiffness_calculation():
    return render_template('stiffness_calculation.html')

# Upload raw video
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
        os.makedirs(upload_folder, exist_ok=True)

        saved_filename = 'original_video.mp4'
        filepath = os.path.join(upload_folder, saved_filename)
        file.save(filepath)

        return render_template(
            'index.html',
            message='Video uploaded successfully! Everything is set to run the inference!',
            filename_original=file.filename
        )
    else:
        return render_template('index.html', message='File type not allowed')

# Run inference    
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

# Stop inference if required
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

# Obtains the inference progress
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

# Check if TransUNet already produced frames and the UI can start loading them
@app.route('/check_frames')
def check_frames():
    frames_dir = os.path.join('static', 'frames')
    # Check if file frames_ready.flag is present on the folder
    flag_file_path = os.path.join(frames_dir, 'frames_ready.flag')
    
    if os.path.exists(flag_file_path):
        frames = [f for f in os.listdir(frames_dir) if f.endswith('.jpg') or f.endswith('.png')]
        frames_available = len(frames) > 0  # Check if there are available frames
        return jsonify({'frames_available': frames_available})
    else:
        return jsonify({'frames_available': False})

# Return the list of generated frame filenames to the UI
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
    
#Serve a single frame image file by filename
@app.route('/frames/<filename>')
def get_frame(filename):
    return send_from_directory(os.path.join('static', 'frames'), filename)

# Upload the force ramp Excel file and save it to static/data
@app.route('/upload_force', methods=['POST'])
def upload_force():
    if 'file' not in request.files:
        return jsonify({'message': 'No file part in request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    if not file.filename.lower().endswith('.xlsx'):
        return jsonify({'message': 'Invalid file type. Please upload an .xlsx file.'}), 400

    # Save in GUI/static/data/force_ramp.xlsx
    save_path = os.path.join(app.static_folder, 'data', 'force_ramp.xlsx')
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    print(f"✅ Force ramp file saved at: {save_path}")
    return jsonify({'message': 'Force ramp file uploaded successfully!'})

# Reset UI
@app.route("/cleanup", methods=["DELETE"])
def cleanup():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # a) Folders with .gitkeep
    keep_with_gitkeep = [
        os.path.join(project_root, "data", "Synapse", "test_vol_h5"),
    ]

    keep_folders = []

    disposable_folders = [
        os.path.join(project_root, "TransUNet", "center_of_mass_over_pred_images"),
        os.path.join(project_root, "TransUNet", "test_log"),
        os.path.join(project_root, "GUI", "static", "data"),
        os.path.join(project_root, "GUI", "static", "frames"),
        os.path.join(project_root, "TransUNet", "outputs")
    ]

    disposable_files = [
        os.path.join(project_root, "data", "Synapse", "original_images.npy"),
        os.path.join(project_root, "GUI", "static", "img","frame_first.png"),
        os.path.join(project_root, "TransUNet","datasets", "videos", "original_video.mp4"),
        os.path.join(project_root, "TransUNet","lists","lists_Synapse","test_vol.txt"),
        os.path.join(project_root, "TransUNet", "process_times.csv")
    ]

    try:
        # Cleanup of folders and files
        for folder in keep_with_gitkeep:
            if os.path.isdir(folder):
                shutil.rmtree(folder)
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, ".gitkeep"), "w") as f:
                pass

        for folder in keep_folders:
            if os.path.isdir(folder):
                shutil.rmtree(folder)
            os.makedirs(folder, exist_ok=True)

        for folder in disposable_folders:
            if os.path.isdir(folder):
                shutil.rmtree(folder)

        for file in disposable_files:
            if os.path.isfile(file):
                os.remove(file)

        global CLEAN_FRAMES_CACHE
        CLEAN_FRAMES_CACHE = None

        # Reset internal progress status
        global progress
        progress = {
            "status": "idle",
            "percent": 0,
            "last_line": "",
            "message": "",
            "start_time": None,
            "elapsed_time": 0,
        }

        print("🔄 Progress state reset to idle.")

        return jsonify({"message": "Reset worked perfectly"}), 200

    except Exception as e:
        return jsonify({"message": f"Error in reseting: {str(e)}"}), 500

# Process the force ramp Excel file: resample force, align with video frames, compute elongation and cross-correlation.
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

        # Switch to use directly predicted coords, or use the kalman corrected coords 
        use_kalman = True   # True = Use Kalman | False = Uses insertion_coords.csv (blunt output)

        # Read force ramp file (Excel) 
        df_force = pd.read_excel(ramp_path)

        # Filter by sync value 
        #df_force = df_force[df_force["Sync"] > 3.9]

        # Read coordinates
        if use_kalman:
            kalman_distal = pd.read_csv(coords_kalman_distal_path)
            kalman_proximal = pd.read_csv(coords_kalman_proximal_path)

            kalman_distal = kalman_distal[['Predicted_Distal_X', 'Predicted_Distal_Y']]
            kalman_proximal = kalman_proximal[['Predicted_Proximal_X', 'Predicted_Proximal_Y']]

            df_coords = pd.concat([kalman_distal, kalman_proximal], axis=1)
            df_coords.columns = ['distal_X', 'distal_y', 'proximal_x', 'proximal_y']
            print("Using coords from Kalman files")
        else:
            df_coords = pd.read_csv(coords_path)
            print("Using coords from insertion_coords.csv.")

        num_frames = len(df_coords)

        # Parameters
        fs_force = 1000.0        # Force csv frequency (Hz)
        fps_video = 51.491       # Video FPS

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

        # Elongation calculation in backend
        if {"distal_X", "distal_y", "proximal_x", "proximal_y"}.issubset(df_coords.columns):
            distal_x = df_coords["distal_y"].values 
            distal_y_fixed = df_coords["distal_X"].values
            proximal_x_fixed = df_coords["proximal_y"].values
            proximal_y_fixed = df_coords["proximal_x"].values

            elong_px = np.sqrt(
                (distal_x - proximal_x_fixed) ** 2 +
                (distal_y_fixed - proximal_y_fixed) ** 2
            )

            # Conversion px → mm
            # Retrieve locally saved in factor (or set it fixed)
            factor_path = os.path.join(data_dir, "conversion_factor.txt")
            if os.path.exists(factor_path):
                with open(factor_path, "r") as f:
                    factor = float(f.read().strip())
            else:
                factor = 6.48  # fallback

            elong_mm = elong_px / factor
        else:
            print("Could not find coords columns to calculate elongation")
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
            print("Could not calculate elongation for cross correlation")

        # JSON output to the frontend
        return jsonify({
            "message": f"Force ramp processed successfully using {'Kalman' if use_kalman else 'insertion'} coordinates",
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

# Update Kalman-corrected distal and proximal coordinates after manual UI adjustments.
@app.route('/update_coords', methods=['POST'])
def update_coords():
    try:
        coords = request.get_json()
        if not coords:
            return jsonify({"message": "No data received"}), 400

        data_dir = os.path.join(app.static_folder, "data")
        distal_path = os.path.join(data_dir, "kalman_coords_distal.csv")
        proximal_path = os.path.join(data_dir, "kalman_coords_proximal.csv")

        backup_distal = os.path.join(data_dir, "kalman_coords_distal_backup.csv")
        backup_proximal = os.path.join(data_dir, "kalman_coords_proximal_backup.csv")

        # Create backup if it does not exists
        if not os.path.exists(backup_distal):
            shutil.copy2(distal_path, backup_distal)
            print("📦 Backup distal creado.")

        if not os.path.exists(backup_proximal):
            shutil.copy2(proximal_path, backup_proximal)
            print("📦 Backup proximal creado.")

        # Load original files
        df_distal = pd.read_csv(distal_path)
        df_proximal = pd.read_csv(proximal_path)

        # Update columns (last 2)
        distal_x_col = df_distal.columns[-2]
        distal_y_col = df_distal.columns[-1]
        proximal_x_col = df_proximal.columns[-2]
        proximal_y_col = df_proximal.columns[-1]

        # Update ONLY Kalman columns
        for i, c in enumerate(coords):

            # UI → CSV 
            distal_csv_x = float(c["distal"]["y"])  
            distal_csv_y = float(c["distal"]["x"])  

            proximal_csv_x = float(c["proximal"]["y"])
            proximal_csv_y = float(c["proximal"]["x"])

            df_distal.loc[i, distal_x_col] = distal_csv_x
            df_distal.loc[i, distal_y_col] = distal_csv_y

            df_proximal.loc[i, proximal_x_col] = proximal_csv_x
            df_proximal.loc[i, proximal_y_col] = proximal_csv_y

        # Save
        df_distal.to_csv(distal_path, index=False)
        df_proximal.to_csv(proximal_path, index=False)

        print("✅ Kalman coordinates updated successfully.")
        return jsonify({"message": "Kalman coordinates updated successfully!"}), 200

    except Exception as e:
        print("❌ Error updating coords:", e)
        return jsonify({"message": str(e)}), 500


# Serve a clean preprocessed frame directly from the cached NPZ file (fast retrieval).
@app.route('/clean_frame/<int:index>')
def serve_clean_frame(index):
    global CLEAN_FRAMES_CACHE

    try:
        # Load cache if not in memory
        if CLEAN_FRAMES_CACHE is None:
            cache_path = os.path.join(
                os.path.dirname(__file__),
                '..',
                'TransUNet',
                'outputs',
                '_clean_frames_cache.npz'
            )
            if not os.path.exists(cache_path):
                print("⚠️ Cache file not found.")
                return Response("Cache not found", status=404)

            data = np.load(cache_path, allow_pickle=True)

            if 'frames' in data:
                CLEAN_FRAMES_CACHE = data['frames']
            elif 'arr_0' in data:
                CLEAN_FRAMES_CACHE = data['arr_0']
            else:
                return Response("No 'frames' key in cache", status=500)

            print(f"[UI] Loaded {len(CLEAN_FRAMES_CACHE)} clean frames into memory cache")

        # Index validation
        if index < 0 or index >= len(CLEAN_FRAMES_CACHE):
            return Response("Invalid frame index", status=400)

        # Safely obtention of bytes
        frame_data = CLEAN_FRAMES_CACHE[index]
        if isinstance(frame_data, np.ndarray):
            try:
                frame_bytes = frame_data.item()
            except Exception:
                frame_bytes = frame_data.tobytes()
        else:
            frame_bytes = frame_data

        # Return image
        return send_file(io.BytesIO(frame_bytes), mimetype='image/png')

    except Exception as e:
        print(f"❌ Error serving clean frame {index}: {e}")
        return Response(f"Internal error: {e}", status=500)

# Restore Kalman coordinate CSVs back to their original backup versions.
@app.route('/reset_coords', methods=['POST'])
def reset_coords():
    try:
        data_dir = os.path.join(app.static_folder, 'data')
        backup_distal = os.path.join(data_dir, 'kalman_coords_distal_backup.csv')
        backup_proximal = os.path.join(data_dir, 'kalman_coords_proximal_backup.csv')
        distal_path = os.path.join(data_dir, 'kalman_coords_distal.csv')
        proximal_path = os.path.join(data_dir, 'kalman_coords_proximal.csv')

        if not os.path.exists(backup_distal) or not os.path.exists(backup_proximal):
            return jsonify({'message': 'Backup files not found.'}), 404

        shutil.copy2(backup_distal, distal_path)
        shutil.copy2(backup_proximal, proximal_path)

        print("✅ Kalman coordinates restored from backup.")
        return jsonify({'message': 'Coordinates restored to original Kalman values!'})
    except Exception as e:
        print(f"❌ Error resetting coords: {e}")
        return jsonify({'message': f'Error: {str(e)}'}), 500
    
# Return how many clean frames are available in the cache.
@app.route('/clean_frame_count')
def clean_frame_count():
    global CLEAN_FRAMES_CACHE

    try:
        #Load cache if it's not loaded yet
        if CLEAN_FRAMES_CACHE is None:
            cache_path = os.path.join(
                os.path.dirname(__file__),
                '..',
                'TransUNet',
                'outputs',
                '_clean_frames_cache.npz'
            )
            if not os.path.exists(cache_path):
                return jsonify({"count": 0})  

            data = np.load(cache_path, allow_pickle=True)
            if 'frames' in data:
                CLEAN_FRAMES_CACHE = data['frames']
            elif 'arr_0' in data:
                CLEAN_FRAMES_CACHE = data['arr_0']
            else:
                return jsonify({"count": 0})

        return jsonify({"count": len(CLEAN_FRAMES_CACHE)})

    except Exception as e:
        print("❌ Error in /clean_frame_count:", e)
        return jsonify({"count": 0})


# Upload external tendon elongation (CSV or XLSX)
@app.route('/upload_external_elongation', methods=['POST'])
def upload_external_elongation():
    if 'file' not in request.files:
        return jsonify({'message': 'No file part in request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    # Valid extensions
    allowed_ext = ('.csv', '.xlsx')
    if not file.filename.lower().endswith(allowed_ext):
        return jsonify({'message': 'Invalid file type. Please upload .csv or .xlsx'}), 400

    # Save inside GUI/static/data
    save_dir = os.path.join(app.static_folder, 'data')
    os.makedirs(save_dir, exist_ok=True)

    # Standardized filename
    save_path = os.path.join(save_dir, 'external_elongation' + os.path.splitext(file.filename)[1])
    file.save(save_path)

    print(f"✅ External elongation file saved at: {save_path}")
    return jsonify({'message': 'External elongation uploaded successfully!', 'filename': save_path}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)