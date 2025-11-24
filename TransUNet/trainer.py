"""
trainer.py

Training loop for the DeepPatella TransUNet model.

This module implements the full supervised training procedure used during
model development. 

Main responsibilities:
    - Load batches from Synapse_dataset (image, mask, centroid labels)
    - Forward pass through TransUNet (ViT-Seg)
    - Compute losses (BCE + Dice)
    - Extract insertion centroids from heatmaps via hottest-pixel
    - Compute centroid Euclidean error (DeepPatella key metric)
    - Run optimizer + polynomial LR scheduler
    - Evaluate on validation set and log metrics
    - Save intermediate and final checkpoints
    - Write TensorBoard summaries (images, predictions, GT masks)

Pipeline:
    NPZ dataset → trainer_synapse() → model checkpoints in /model/TU_Synapse*/

"""

import argparse
import logging
import os
import random
import sys
import time
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from tensorboardX import SummaryWriter
from torch.nn.modules.loss import CrossEntropyLoss
from torch.utils.data import DataLoader
from tqdm import tqdm
from utils import DiceLoss
from torchvision import transforms
from scipy.ndimage import center_of_mass

# Calculate euclidean distance between the manually labeled coordinates and the predicted ones
def euclidean_distance(real, pred):
    return torch.sqrt(torch.sum((real - pred) ** 2, dim=1)).mean()

#Finds the center of mass of the predicted heatmap
def find_centers_of_mass_for_hottest_pixels(prediction):
    if isinstance(prediction, torch.Tensor):
        prediction = prediction.squeeze().cpu().detach().numpy()
    else:
        prediction = prediction.squeeze()  

    h, w = prediction.shape
    mid = w // 2

    left_half = prediction[:, :mid]
    right_half = prediction[:, mid:]

    left_max_value = np.max(left_half)
    right_max_value = np.max(right_half)

    left_mask = (left_half == left_max_value).astype(np.float32)
    right_mask = (right_half == right_max_value).astype(np.float32)

    left_com = center_of_mass(left_mask)
    right_com = center_of_mass(right_mask)

    left_center = (left_com[0], left_com[1])
    right_center = (right_com[0], right_com[1] + mid)

    return left_center, right_center


def trainer_synapse(args, model, snapshot_path):
    # Logging setup to file and console
    from datasets.dataset_synapse import Synapse_dataset
    logging.basicConfig(filename=snapshot_path + "/log.txt", level=logging.INFO,
                        format='[%(asctime)s.%(msecs)03d] %(message)s', datefmt='%H:%M:%S')
    logging.getLogger().addHandler(logging.StreamHandler(sys.stdout))
    logging.info(str(args))

    # Base Hyperparameters
    base_lr = args.base_lr
    num_classes = 1
    batch_size = args.batch_size * args.n_gpu

    # Load datasets. Each item is composed by image, mask and manually labeled coordinates
    db_train = Synapse_dataset(base_dir=args.root_path, list_dir=args.list_dir, split="train", transform=None)
    db_val = Synapse_dataset(base_dir=args.root_path, list_dir=args.list_dir, split="val", transform=None)

    def worker_init_fn(worker_id):
        random.seed(args.seed + worker_id) # Allows for dataloader reproducibility.

    # Dataloaders
    trainloader = DataLoader(db_train, batch_size=batch_size, shuffle=True, drop_last=True, num_workers=8, pin_memory=True,
                             worker_init_fn=worker_init_fn)
    val_loader = DataLoader(db_val, batch_size=batch_size, shuffle=False, num_workers=2, pin_memory=True)

    # Optional Multi-GPU
    if args.n_gpu > 1:
        model = nn.DataParallel(model)
    model.train()

    # Rescaling
    scale_x = 512 / 224
    scale_y = 512 / 224

    # Loss functions
    ce_loss = nn.BCELoss()
    dice_loss = DiceLoss(num_classes)

    # Optimizer
    optimizer = optim.SGD(model.parameters(), lr=base_lr, momentum=0.9, weight_decay=0.0001)

    # Tensorboard
    writer = SummaryWriter(snapshot_path + '/log')
    iter_num = 0
    max_epoch = args.max_epochs
    max_iterations = args.max_epochs * len(trainloader)  
    logging.info("{} iterations per epoch. {} max iterations ".format(len(trainloader), max_iterations))
    best_performance = 0.0

    # Epoch loop
    iterator = tqdm(range(max_epoch), ncols=70)
    for epoch_num in iterator:
        model.train()
        total_train_loss = 0
        total_euclidean_error = 0

        # Training batch loop
        for i_batch, sampled_batch in enumerate(trainloader):

            # Load batch
            image_batch, label_batch, coords_batch = sampled_batch['image'], sampled_batch['label'], sampled_batch['coords']
            image_batch, label_batch, coords_batch = image_batch.cuda().float(), label_batch.cuda(), coords_batch.cuda()

            # Forward
            outputs = model(image_batch)

            # Loss calculation
            loss_bce = ce_loss(torch.sigmoid(outputs), label_batch.float().unsqueeze(1))
            loss_dice = dice_loss(torch.sigmoid(outputs), label_batch)
            loss = 0.8 * loss_bce + 0.2 * loss_dice

            # Back propagation
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_train_loss += loss.item()	

            # Extract centroids from the predicted heatmaps
            predicted_coords = []
            for output in outputs:
                pred_distal, pred_proximal = find_centers_of_mass_for_hottest_pixels(output.squeeze().cpu().detach().numpy())

                # Rescale predicted coords to original size (512 x 512)
                pred_coords = torch.tensor([[pred_distal[1] * scale_x, pred_distal[0] * scale_y], 
                                            [pred_proximal[1] * scale_x, pred_proximal[0] * scale_y]])
                predicted_coords.append(pred_coords)

            predicted_coords = torch.stack(predicted_coords).cuda()
            coords_batch = coords_batch.cuda().float()

            # Euclidean error between predicted centroids and manually labeled coords
            train_euclidean_error = euclidean_distance(coords_batch, predicted_coords)
            total_euclidean_error += train_euclidean_error.item()

            # Scheduler as polynomial decay
            lr_ = base_lr * (1.0 - iter_num / max_iterations) ** 0.9
            for param_group in optimizer.param_groups:
                param_group['lr'] = lr_

            iter_num += 1
            total_train_loss += loss.item()

            print(f"Epoch {epoch_num} | Iteration {iter_num} | Train Loss: {loss.item():.4f} | BCE Loss: {loss_bce.item():.4f} | Euclidean Error: {train_euclidean_error.item():.4f}")

        # Epoch averages
        avg_train_loss = total_train_loss / len(trainloader)
        avg_train_euclidean_error = total_euclidean_error / len(trainloader)    
    
        # Validation
        model.eval()
        total_val_loss = 0
        total_val_euclidean_error = 0
        with torch.no_grad():
            for val_batch in val_loader:  
                val_images, val_labels, val_coords = val_batch['image'].cuda().float(), val_batch['label'].cuda().float(), val_batch['coords'].cuda().float()
                val_outputs = model(val_images)

                val_loss_bce = ce_loss(torch.sigmoid(val_outputs), val_labels.float().unsqueeze(1))
                val_loss_dice = dice_loss(torch.sigmoid(val_outputs), val_labels)
                val_loss = 0.8 * val_loss_bce + 0.2 * val_loss_dice

                total_val_loss += val_loss.item()

                predicted_coords = []
                for output in val_outputs:
                    pred_distal, pred_proximal = find_centers_of_mass_for_hottest_pixels(output.squeeze().cpu().detach().numpy())
                    pred_coords = torch.tensor([[pred_distal[1] * scale_x, pred_distal[0] * scale_y], 
                                                [pred_proximal[1] * scale_x, pred_proximal[0] * scale_y]])
                    predicted_coords.append(pred_coords)

                predicted_coords = torch.stack(predicted_coords).cuda()
                val_euclidean_error = euclidean_distance(val_coords, predicted_coords)

                total_val_euclidean_error += val_euclidean_error.item()

        logging.info('iteration %d : loss : %f, loss_bce: %f, loss_dice: %f' % (iter_num, loss.item(), loss_bce.item(), loss_dice.item()))
        
        # Log in Tensorboard every 20 iterations
        if iter_num % 20 == 0:
            image = image_batch[1, 0:1, :, :]
            image = (image - image.min()) / (image.max() - image.min())
            writer.add_image('train/Image', image, iter_num)
            outputs = torch.sigmoid(outputs).detach()
            writer.add_image('train/Prediction', outputs[1, 0, :, :].unsqueeze(0), iter_num)
            labs = label_batch[1, ...].unsqueeze(0) * 50
            writer.add_image('train/GroundTruth', labs, iter_num)
        
        # Periodical save
        save_interval = 50  
        if epoch_num > int(max_epoch / 2) and (epoch_num + 1) % save_interval == 0:
            save_mode_path = os.path.join(snapshot_path, 'epoch_' + str(epoch_num) + '.pth')
            torch.save(model.state_dict(), save_mode_path)
            logging.info("save model to {}".format(save_mode_path))

        # Last model saving
        if epoch_num >= max_epoch - 1:
            save_mode_path = os.path.join(snapshot_path, 'epoch_' + str(epoch_num) + '.pth')
            torch.save(model.state_dict(), save_mode_path)
            logging.info("save model to {}".format(save_mode_path))
            iterator.close()
            break

    writer.close()

    return "Training Finished!"