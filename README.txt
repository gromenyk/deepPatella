This is the dataset, preprocessed by TransUNet, originated from Synapse multi-organ Dataset.

This preprocessing is implemented and introduced in the work:
@article{chen2021transunet,
  title={TransUNet: Transformers Make Strong Encoders for Medical Image Segmentation},
  author={Chen, Jieneng and Lu, Yongyi and Yu, Qihang and Luo, Xiangde and Adeli, Ehsan and Wang, Yan and Lu, Le and Yuille, Alan L., and Zhou, Yuyin},
  journal={arXiv preprint arXiv:2102.04306},
  year={2021}
}

The original data can be accessed through "https://www.synapse.org/#!Synapse:syn3193805/wiki/". 
Please refer to the included license in official Synapse websit for information regarding the allowed use of the dataset.

Please note that the preprocessed dataset provided by TransUNet is for research purpose only and please do not redistribute this preprocessed dataset

## Pipeline Explanation

The steps for the inference of the DeepPatella project are as follow:

- You should make sure that you put your original video with the name of 'original_video.mp4' in the TransUNet/datasets/videos folder.
- When running test.py (with the following command: python3.8 test.py --dataset Synapse --vit_name R50-ViT-B_16), the following steps will be performed:
  - Take out the top and lateral grey areas (if they exist), and cropp and add padding to the video to match the expected dimensions from the model.
  - split the video into frames.
  - Create empty masks (expected by the model) for each frame.
  - Build NPZ files containing the original frame plus the respective empty mask.
  - Create a list of the files (expected by the model)
  - Run the inference. That means:
    - Obtain the predictions for each frame. This is in the form of a probability map with values between 0 and 1.
    - Obtain the center of mass, which will return the coordinates for the predictions both the distal and the proximal insertions.
  - Reconstruct a video with the plotted predicted coordinates.
  - But it will also reconstruct another video with an application of the Kalman filter. For that:
    - It passes the coordinates for the insertions through the Kalman filter.
    - Obtains new predictions based on the Kalman filter.
    - Reconstructs the video.
    - Note: there is the possibility to set a threshold based on acceleration, but results get worse when setting it. By default is 0.

The whole process should take around 5 minutes.