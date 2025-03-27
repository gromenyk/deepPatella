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

