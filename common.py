import os
import shutil

def create_folder(folder_path: str) -> None:
    try:
        os.makedirs(folder_path, exist_ok=True)
        print(f"Folder '{folder_path}' has been created (or already exists).")
    except Exception as e:
        print(f"An error occurred while creating the folder: {e}")

def clear_folder(folder_path: str) -> None:
    try:
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)  # Remove file or symbolic link
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)  # Remove directory and its contents
        print(f"Contents of the folder '{folder_path}' have been deleted.")
    except FileNotFoundError:
        print(f"Folder '{folder_path}' does not exist.")
    except Exception as e:
        print(f"An error occurred while clearing the folder: {e}")