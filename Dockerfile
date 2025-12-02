# Base image of Ubuntu 20.04 with CUDA 12.1
FROM nvidia/cuda:12.1.0-runtime-ubuntu20.04

# Avoid interactive questions during installation
ENV DEBIAN_FRONTEND=noninteractive

# Update and install necessary dependencies
RUN apt-get update && apt-get install -y \
    python3.8 \
    python3-pip \
    python3.8-dev \
    wget \
    curl \
    build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Directly install dependencies
RUN pip3 install --no-cache-dir \
    torch==2.0.0 \
    torchvision==0.15.0 \
    numpy==1.24.4 \
    tqdm==4.67.1 \
    tensorboard==2.14.0 \
    tensorboardX==2.6.2.2 \
    ml-collections==0.1.1 \
    medpy==0.5.2 \
    SimpleITK==2.4.1 \
    scipy==1.10.1 \
    h5py==3.11.0 \
    matplotlib==3.7.5 \
    wandb==0.19.6 \
    pandas==2.0.3 \
    opencv-python-headless==4.10.0.84 \
    filterpy==1.4.5 \
    flask==3.0.3 \
    openpyxl==3.1.2

# CUDA Environment variables configuration 
ENV PATH=/usr/local/cuda-12.1/bin${PATH:+:${PATH}}
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.1/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}

# Workspace configuration
WORKDIR /workspace

# Open interactive shell
CMD ["bash"]



















