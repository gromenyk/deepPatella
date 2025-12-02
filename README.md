# Welcome to deepPatella!

deepPatella is a tool for the automated estimation of patellar tendon stiffness. It uses an adapted TransUNet model that outputs probability heatmaps for the distal and proximal patellar tendon–bone insertions on each frame of an ultrasound video. The model has been trained and tested (so far) on ultrasound videos recorded with an ArtUS Telemed device.

From these probability maps, the predicted coordinates of the tendon insertions are extracted and tracked across frames. Because frame-to-frame predictions naturally contain variability, the coordinates are temporally smoothed using a Kalman filter. Tracking the movement of both insertions makes it possible to compute tendon elongation during tasks such as isometric ramp knee extensions performed on a dynamometer, where the force–time data are typically exported as an Excel file.

deepPatella includes a user interface that allows users to load a raw ultrasound video, run the inference model, compute the baseline tendon length (at rest), upload the force-ramp data, generate plots, and automatically obtain tendon stiffness (N/mm) and normalized tendon stiffness (N).

## How to use

In order to make it run, please follow the steps detailed next:

### Install Docker (in case you don't have it already installed)

You can download and install Docker Desktop from the official website:

https://www.docker.com/products/docker-desktop/

Once you have Docker installed, please open it.

### Download required files from OSF

Please go to:

https://osf.io/chf4m/files

There you will see three files:

- epoch_4.pth: this is the pre-trained model, that will allow you to run the inference.
- example_video: this is a demo video for in case you want to try the inference. 
- example_force_ramp: this is an Excel sheet that contains the force ramp related to the example video. You can upload it directly on the UI for the tendon stiffness calculation.

If you have your own data, then you don't need to download (of course) the example video and force ramp. 

### Clone the deepPatella repository

Open a Powershell terminal (type in your searchbar 'powershell' and you will find it)

Then copy the following command and hit enter. This will clone the deepPatella repository to your computer.
```
git clone https://github.com/gromenyk/deepPatella.git
```

Then, enter the deepPatella folder by copying and pasting the following command:
```
cd deepPatella
```

### Copy the epoch_4.pth to the required folder.

Fow Windows users:

Open File Explorer on Windows and navigate to:

This PC
 → Windows (C:)
   → Users
     → <your user name>
       → deepPatella
         → model
           → TU_Synapse224
             → TU_pretrain_R50-ViT-B_16_skip3_epo5_bs12_lr0.005_224

Once inside that folder, copy the file epoch_4.pth into it.

For macOS users:

Open Finder and go to:

Macintosh HD
 → Users
   → <your user name>
     → deepPatella
       → model
         → TU_Synapse224
           → TU_pretrain_R50-ViT-B_16_skip3_epo5_bs12_lr0.005_224

Then copy epoch_4.pth into that folder.

### Build the Docker image

Go back to the Command Prompt and from inside the deepPatella folder:

```
docker build -t deeppatella .
```

### Run deepPatella (mounting the model folder)

For Windows users (Windows Powershell):

```
docker run --gpus all --shm-size=8gb -p 5000:5000 -it -v "${PWD}:/workspace" deeppatella
```

for macOS/Linux users:

```
docker run --gpus all --shm-size=8gb -p 5000:5000 -it -v "$(pwd)":/workspace deeppatella
```

### Now it's time to launch the app:

Copy and paste the following commands:

```
cd GUI
python3.8 app.py
```

