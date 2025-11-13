// static/js/upload.js
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('video');
    const fileNameSpan = document.getElementById('file-name');
    const uploadButton = document.getElementById('upload-button');

    if (!fileInput) return;

    fileInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            const fileName = this.files[0].name;

            // Mostrar nombre debajo del botón de carga
            fileNameSpan.textContent = `Selected file: ${fileName}`;
            uploadButton.style.display = 'inline-block';

            // Guardar nombre para mostrarlo tras recargar
            localStorage.setItem('deepPatella_last_video', fileName);
        } else {
            fileNameSpan.textContent = '';
            uploadButton.style.display = 'none';
            localStorage.removeItem('deepPatella_last_video');
        }
    });

    // Si hay mensaje de éxito renderizado desde Flask
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
