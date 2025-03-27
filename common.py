import os
import shutil
from typing import LiteralString
from cleantext import clean

def create_folder(folder_path: str) -> None:
    """
    Create a folder at the specified path if it does not already exist. Parent folders will be created if necessary.

    Args:
        folder_path (str): The path of the folder to create.

    Returns:
        None

    Prints:
        A message indicating whether the folder was created or already exists.

    Raises:
        Exception: If an error occurs during folder creation.
    """
    try:
        os.makedirs(folder_path, exist_ok=True)
        print(f"Folder '{folder_path}' has been created (or already exists).")
    except Exception as e:
        print(f"An error occurred while creating the folder: {e}")

def clear_folder(folder_path: str) -> None:
    """
    Clear all contents of the specified folder. Deletes files, symbolic links, 
    and subdirectories within the specified folder. Files in parent directories
    are not affected.

    Args:
        folder_path (str): The path of the folder to clear.

    Returns:
        None

    Prints:
        A message indicating whether the folder's contents were cleared or if 
        the folder does not exist.

    Raises:
        FileNotFoundError: If the folder does not exist.
        Exception: If an error occurs while clearing the folder.
    """
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


def clean_text(t: str) -> str:
    cleaned_text = clean(t, extra_spaces=True)
    cleaned_text: LiteralString = "\n".join([line for line in cleaned_text.splitlines() if line.strip()])
    return cleaned_text