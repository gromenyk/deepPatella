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
- example_video: this is a demo video for in case you want to try the inference. This specific video does not have a force ramp
- example_force_ramp: this is an Excel sheet that contains the force ramp related to the example video. You can upload it directly on the UI for the tendon stiffness calculation.

If you have your own data, then you don't need to download (of course) the example video and force ramp. 

### Clone the deepPatella repository

Open a terminal (CMD, PowerShell, or your IDE terminal):

```
git clone https://github.com/gromenyk/deepPatella.git
cd deepPatella
```

### Copy the epoch_4.pth to the required folder.

Copy the epoch_4.pth file to:

```
deepPatella/model/TU_Synapse224/TU_pretrain_R50-ViT-B_16_skip3_epo5_bs12_lr0.005_224/
```

### Build the Docker image

Go back to the cmd and from inside the deepPatella folder:

```
docker build -t deeppatella .
```

### Run deepPatella (mounting the model folder)

macOS/Linux:

```
docker run --gpus all -p 5000:5000 \
    -v "$(pwd)/model":"/workspace/model" \
    deeppatella
```

Windows Powershell

```
docker run --gpus all -p 5000:5000 `
    -v "${PWD}\model":"/workspace/model" `
    deeppatella
```