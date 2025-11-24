"""
list_generator.py

This module scans a folder containing .npz volumes (one per frame) and
produces a plain-text file listing the base names of all NPZ files.
This text file is required by the TransUNet inference loader to iterate
through the test dataset in the correct order.

The module performs:
    - Directory scan for *.npz files
    - Extraction of file base names (no extension)
    - Saving them into test_vol.txt (one filename per line)

Pipeline step:
    npz_folder/*.npz → test_vol.txt

Typical use:
    Called automatically by the main DeepPatella pipeline after frame
    extraction and NPZ generation.
"""

import os
import argparse

npz_folder = './'  
output_txt_path = '../../../TransUNet/lists/lists_Synapse/test_vol.txt'  

def npz_files_list(npz_folder, output_txt_path):
    file_names = []

    
    for file_name in os.listdir(npz_folder):
        if file_name.endswith('.npz'):  
            base_name = os.path.splitext(file_name)[0]
            file_names.append(base_name)

    with open(output_txt_path, 'w') as txt_file:
        txt_file.write('\n'.join(file_names))

    print(f"List generated in {output_txt_path}")

def main():
    parser = argparse.ArgumentParser(description='Generate NPZ file list')
    parser.add_argument('--npz_folder', type=str, default='../../data/Synapse/test_vol_h5', help='Folder with the NPZ files')
    parser.add_argument('--output_txt_file', type=str, default='../lists/lists_Synapse/test_vol.txt', help='Output folder for the txt file')

    args = parser.parse_args()
    npz_files_list(args.npz_folder, args.output_txt_file)

if __name__ == '__main__':
    main()

