// static/js/inference.js
let inferenceRunning = false;
let pollingHandle = null;

function toggleButton() {
    const runButton = document.getElementById('start-inference-button');
    const stopButton = document.getElementById('stop-inference-button');

    if (runButton && stopButton) {
        runButton.disabled = inferenceRunning;
        stopButton.disabled = !inferenceRunning;
    }
}

function restoreProgressState() {
    fetch('/progress')
        .then(response => response.json())
        .then(data => {
            const progressBar = document.getElementById('progress-bar-fill');
            const progressTime = document.getElementById('progress-time');
            const progressDropdown = document.getElementById('progress-dropdown');

            if (!progressBar) return;

            const { status, percent, message, elapsed_time } = data;

            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${percent}%`;

            if (!isNaN(elapsed_time)) {
                const minutes = Math.floor(elapsed_time / 60);
                const seconds = elapsed_time % 60;
                progressTime.textContent = `⏱️ Elapsed Time: ${minutes}m ${seconds}s`;
            }

            progressDropdown.innerHTML = `
                <option value="" disabled selected hidden>Show Progress Details</option>
                <option value="${message}">${message}</option>
            `;

            if (status === "running") {
                inferenceRunning = true;
                toggleButton();
                pollProgress(); // seguir desde donde estaba
            } else if (status === "done") {
                inferenceRunning = false;
                toggleButton();
                progressBar.style.width = "100%";
                progressBar.textContent = "100%";
            }
        })
        .catch(err => console.error("Error restoring progress state:", err));
}


function pollProgress() {
    fetch('/progress')
        .then(response => response.json())
        .then(data => {
            const progressBar = document.getElementById('progress-bar-fill');
            const progressTime = document.getElementById('progress-time');
            const progressDropdown = document.getElementById('progress-dropdown');

            progressBar.style.width = `${data.percent}%`;
            progressBar.textContent = `${data.percent}%`;

            if (!isNaN(data.elapsed_time)) {
                const minutes = Math.floor(data.elapsed_time / 60);
                const seconds = data.elapsed_time % 60;
                progressTime.textContent = `⏱️ Elapsed Time: ${minutes}m ${seconds}s`;
            } else {
                progressTime.textContent = '';
            }

            progressDropdown.innerHTML = `
                <option value="" disabled selected hidden>Show Progress Details</option>
                <option value="${data.message}">${data.message}</option>
            `;

            if (data.status === 'running') {
                pollingHandle = setTimeout(pollProgress, 1000);
            } else {
                clearTimeout(pollingHandle);
                inferenceRunning = false;
                toggleButton();
                alert(data.message);
                if (data.status === 'done') {
                    checkFrames(); // carga los frames de la izquierda

                    // 🔥 Cargar automáticamente los frames Kalman en la columna derecha
                    if (typeof loadCorrectionFrames === 'function') {
                        console.log("✅ Inference completed — loading Kalman correction frames...");
                        loadCorrectionFrames();
                    }
                }
            }
        })
        .catch(err => console.error('Error polling progress:', err));
}

function startInference() {
    fetch('/run_inference', { method: 'POST' })
        .then(() => {
            inferenceRunning = true;
            toggleButton();
            pollProgress();
        })
        .catch(err => console.error('Error starting inference:', err));
}

function stopInference() {
    fetch('/stop_inference', { method: 'POST' })
        .then(() => {
            inferenceRunning = false;
            toggleButton();

            const progressTime = document.getElementById('progress-time');
            const progressBar = document.getElementById('progress-bar-fill');
            if (progressTime) progressTime.textContent = '';
            if (progressBar) {
                progressBar.style.transition = 'none';
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
                setTimeout(() => (progressBar.style.transition = ''), 100);
            }
        })
        .catch(err => console.error('Error stopping inference:', err));
}

document.addEventListener('DOMContentLoaded', () => {
    toggleButton();
    restoreProgressState();
    const runForm = document.getElementById('run-inference-form');
    const stopButton = document.getElementById('stop-inference-button');

    if (runForm)
        runForm.addEventListener('submit', e => {
            e.preventDefault();
            startInference();
        });

    if (stopButton)
        stopButton.addEventListener('click', e => {
            e.preventDefault();
            stopInference();
        });
});