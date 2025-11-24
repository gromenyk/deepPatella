// inference.js
//
// Inference orchestration and progress tracking module for DeepPatella.
//
// This script manages the full inference workflow triggered from the UI,
// including process launching, stopping, live progress updates, and UI state
// synchronization after reloads.
//
// Responsibilities:
//
//   1. Send a request to the backend to start the TransUNet inference pipeline
//   2. Enable/disable UI buttons depending on inference state (start/stop)
//   3. Poll the backend every second to get real-time progress (% and status)
//   4. Update the progress bar, elapsed time, and dropdown details on the UI
//   5. Restore progress state after page refresh (resumes polling if running)
//   6. Allow manual stopping of the inference process from the UI
//   7. Trigger loading of extracted frames and Kalman correction frames once
//      inference finishes successfully
//
// Notes:
//   - The backend exposes /run_inference, /stop_inference and /progress endpoints
//   - Progress polling automatically stops when the process reaches a final state
//   - Progress state persists server-side, so the UI can recover after reload
//   - When inference completes, this module triggers:
//         → checkFrames()  (raw frames viewer)
//         → loadCorrectionFrames()  (Kalman correction UI), if available
//

let inferenceRunning = false;
let pollingHandle = null;

// Enables or disables the start and stop buttons depending on current state
function toggleButton() {
    const runButton = document.getElementById('start-inference-button');
    const stopButton = document.getElementById('stop-inference-button');

    if (runButton && stopButton) {
        runButton.disabled = inferenceRunning;
        stopButton.disabled = !inferenceRunning;
    }
}

// Restores progress bar
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
                pollProgress(); 
            } else if (status === "done") {
                inferenceRunning = false;
                toggleButton();
                progressBar.style.width = "100%";
                progressBar.textContent = "100%";
            }
        })
        .catch(err => console.error("Error restoring progress state:", err));
}

// Polling to update progress bar
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
                    checkFrames(); 

                    // Load kalman corrected frames on right column
                    if (typeof loadCorrectionFrames === 'function') {
                        console.log("✅ Inference completed — loading Kalman correction frames...");
                        loadCorrectionFrames();
                    }
                }
            }
        })
        .catch(err => console.error('Error polling progress:', err));
}

// Starts the inference
function startInference() {
    fetch('/run_inference', { method: 'POST' })
        .then(() => {
            inferenceRunning = true;
            toggleButton();
            pollProgress();
        })
        .catch(err => console.error('Error starting inference:', err));
}

// Stops the inference
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

// Initialize UI and attach event listeners
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