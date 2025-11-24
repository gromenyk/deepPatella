// upload.js
//
// Video upload handler module for DeepPatella.
//
// This script manages the UI logic for uploading ultrasound videos in the
// “Upload Video” page. It handles file selection, updates the interface
// dynamically, and stores the last selected filename for continuity after reload.
//
// Responsibilities:
//
//   1. Detect video file selection and display the chosen filename
//   2. Enable the upload button only when a file is selected
//   3. Persist the selected filename in localStorage so it can be shown
//      again after page reloads
//   4. Display the filename next to Flask-rendered success messages
//      after the upload completes
//
// Notes:
//
//   - This module handles UI state only; the actual upload is handled server-side
//     by Flask in the /upload_video route.
//   - Stored key: "deepPatella_last_video"
//   - The file input must have id="video" to be detected here.
//


document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('video');
    const fileNameSpan = document.getElementById('file-name');
    const uploadButton = document.getElementById('upload-button');

    if (!fileInput) return;

    fileInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            const fileName = this.files[0].name;

            // Show file name under loading button
            fileNameSpan.textContent = `Selected file: ${fileName}`;
            uploadButton.style.display = 'inline-block';

            // Save file name for showing after browser refreshing
            localStorage.setItem('deepPatella_last_video', fileName);
        } else {
            fileNameSpan.textContent = '';
            uploadButton.style.display = 'none';
            localStorage.removeItem('deepPatella_last_video');
        }
    });

    // If there is a success message rendered from Flask
    const uploadMessage = document.getElementById('upload-message');
    const uploadFilename = document.getElementById('upload-filename');

    if (uploadMessage && uploadFilename) {
        const lastFile = localStorage.getItem('deepPatella_last_video');
        if (lastFile) {
            uploadFilename.textContent = `Working with: ${lastFile}`;
            uploadFilename.style.display = 'block';
        }
    }
});