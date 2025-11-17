// static/js/frames.js
let pollingInterval = null;
let currentFrameIndex = 0;
let frames = [];
let frameInterval = null;

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

function showFrame() {
    if (!frames.length) return;
    const frameName = frames[currentFrameIndex];
    const imgElement = document.getElementById('frame');
    imgElement.src = `/frames/${frameName}`;
    imgElement.style.display = 'block';
    document.getElementById('frameSlider').value = currentFrameIndex;
}

function playFrames() {
    if (!frameInterval) {
        frameInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            showFrame();
        }, 1000 / 51);
    }
}

function pauseFrames() {
    clearInterval(frameInterval);
    frameInterval = null;
}

function sliderChanged() {
    pauseFrames();
    currentFrameIndex = parseInt(document.getElementById('frameSlider').value);
    showFrame();
}

document.addEventListener('DOMContentLoaded', () => {
    pollingInterval = setInterval(checkFrames, 1000);
});

document.addEventListener('DOMContentLoaded', () => {
    pollingInterval = setInterval(checkFrames, 1000);
    document.getElementById('play-btn').addEventListener('click', playFrames);
    document.getElementById('pause-btn').addEventListener('click', pauseFrames);
});