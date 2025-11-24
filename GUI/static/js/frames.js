// frames.js
//
// Ultrasound frames viewer module for DeepPatella.
//
// This script powers the "Frames Inspection" section of the UI,
// which displays the raw ultrasound frames extracted from the uploaded video.
//
// Responsibilities:
//
//   - Poll the backend until frames are available after preprocessing
//   - Load the list of extracted frames from /get_frames
//   - Display individual frames and allow navigation using a slider
//   - Provide frame playback at the native video framerate (~51 fps)
//   - Support pausing, manual navigation, and automatic looping
//   - Optionally trigger Kalman prediction analysis when frames become available
//
// Notes:
//   - Frames are served from /frames/<filename>
//   - Playback uses setInterval at (1000 / 51) ms steps
//   - Polling stops automatically once frames are detected
//


let pollingInterval = null;
let currentFrameIndex = 0;
let frames = [];
let frameInterval = null;

// Check if the frames are already available to be rendered on the UI
function checkFrames() {
    fetch('/check_frames')
        .then(response => response.json())
        .then(data => {
            if (data.frames_available) {
                clearInterval(pollingInterval);
                document.getElementById('waiting-message').style.display = 'none';
                loadFrames();
                if (typeof analyzeKalmanPredictions === "function") {
                    analyzeKalmanPredictions();
                }
            } else {
                document.getElementById('waiting-message').style.display = 'block';
            }
        })
        .catch(error => console.error('Error checking frames:', error));
}

// Load the complete list of extracted frames from the backend
function loadFrames() {
    fetch('/get_frames')
        .then(response => response.json())
        .then(data => {
            frames = data.frames;
            document.getElementById('frameSlider').max = frames.length - 1;
            showFrame();
        })
        .catch(error => console.error('Error loading frames:', error));
}

// Displays the currently selected frame on the UI
function showFrame() {
    if (!frames.length) return;
    const frameName = frames[currentFrameIndex];
    const imgElement = document.getElementById('frame');
    imgElement.src = `/frames/${frameName}`;
    imgElement.style.display = 'block';
    document.getElementById('frameSlider').value = currentFrameIndex;
}

// Plays the frames sequencially to reconstruct the video, using FPS = 51
function playFrames() {
    if (!frameInterval) {
        frameInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            showFrame();
        }, 1000 / 51);
    }
}

// Pause the frame playback
function pauseFrames() {
    clearInterval(frameInterval);
    frameInterval = null;
}

// Update the displayed frame when the slider is moved manually
function sliderChanged() {
    pauseFrames();
    currentFrameIndex = parseInt(document.getElementById('frameSlider').value);
    showFrame();
}

// Initialize polling for frames and attach playback controls
document.addEventListener('DOMContentLoaded', () => {
    pollingInterval = setInterval(checkFrames, 1000);
});

document.addEventListener('DOMContentLoaded', () => {
    pollingInterval = setInterval(checkFrames, 1000);
    document.getElementById('play-btn').addEventListener('click', playFrames);
    document.getElementById('pause-btn').addEventListener('click', pauseFrames);
});