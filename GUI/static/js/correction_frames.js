// correction_frames.js
//
// Frame-by-frame manual correction module for DeepPatella.
//
// This script powers the "Coordinates Correction" page, allowing the user to
// inspect and adjust Kalman-predicted tendon insertion coordinates.
//
// Responsibilities:
//
//   1. Load clean grayscale ultrasound frames from the backend
//   2. Load distal/proximal insertion coordinates from Kalman-filtered CSV files
//   3. Display each frame with its predicted points overlaid on a canvas
//   4. Allow drag-and-drop correction of both distal and proximal landmarks
//   5. Navigate across frames using slider and previous/next buttons
//   6. Send corrected coordinates back to the backend for storage
//   7. Allow restoring the original Kalman predictions (Reset)
//
// Notes:
//   - Coordinates in CSV are row-major (Swapped X/Y) and require re-mapping to UI space
//   - Corrections are stored only when the user explicitly clicks “Save Corrections”
//   - All interaction is performed on the overlay canvas; the frame image remains static
//


let correctionFrames = [];
let correctionCoords = []; // [{distal: {x, y}, proximal: {x, y}} by frame]
let correctionFrameIndex = 0;
let draggingPoint = null;

// 1. Load frames
async function loadCorrectionFrames() {
    try {
        // Obtain real number of frames for the slider
        const countRes = await fetch('/clean_frame_count');
        const { count } = await countRes.json();

        if (!count || count === 0) {
            document.getElementById('kalman-waiting-message').style.display = 'block';
            return;
        }

        correctionFrames = Array.from({ length: count }, (_, i) => i);
        document.getElementById('kalmanFrameSlider').max = count - 1;

        document.getElementById('kalman-waiting-message').style.display = 'none';
        await loadCoords();
        showCorrectionFrame();

    } catch (err) {
        console.error('Error loading correction frames:', err);
    }
}

// Load coords from Kalman csvs
async function loadCoords() {

    // Load distal coords
    const distalRaw = await fetch('/static/data/kalman_coords_distal.csv').then(r => r.text());
    const distalRows = distalRaw.trim().split('\n').slice(1); // skip header

    // Load proximal coords
    const proximalRaw = await fetch('/static/data/kalman_coords_proximal.csv').then(r => r.text());
    const proximalRows = proximalRaw.trim().split('\n').slice(1); // skip header

    // Only the last 2 columns of the csv are used
    correctionCoords = distalRows.map((distLine, i) => {
        const d = distLine.split(',');
        const p = proximalRows[i].split(',');

        const d_csv_x = parseFloat(d[d.length - 2]);
        const d_csv_y = parseFloat(d[d.length - 1]);

        const d_x = d_csv_y;  
        const d_y = d_csv_x;  

        const p_csv_x = parseFloat(p[p.length - 2]);
        const p_csv_y = parseFloat(p[p.length - 1]);

        const p_x = p_csv_y;
        const p_y = p_csv_x;

        return {
            distal: { x: d_x, y: d_y },
            proximal: { x: p_x, y: p_y }
        };
    });
}


// 3. Show frame and coords
function showCorrectionFrame() {
    const img = document.getElementById('kalman-frame');
    const canvas = document.getElementById('kalman-canvas');
    const ctx = canvas.getContext('2d');

    if (!correctionFrames.length) return;
    const frameName = correctionFrames[correctionFrameIndex];
    img.src = `/clean_frame/${correctionFrameIndex}?t=${Date.now()}`;
    img.onload = () => {
        img.style.display = 'block';
        canvas.style.display = 'block';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw points
        const coords = correctionCoords[correctionFrameIndex];
        if (!coords) return;

        ctx.fillStyle = '#D20537'; // distal
        ctx.beginPath();
        ctx.arc(coords.distal.x, coords.distal.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#D20537'; // proximal
        ctx.beginPath();
        ctx.arc(coords.proximal.x, coords.proximal.y, 5, 0, 2 * Math.PI);
        ctx.fill();
    };
}

// 4. Drag & drop
function setupDragging() {
    const canvas = document.getElementById('kalman-canvas');
    const ctx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', e => {
        const { offsetX, offsetY } = e;
        const coords = correctionCoords[correctionFrameIndex];
        if (!coords) return;
        const points = [
            { name: 'distal', ...coords.distal },
            { name: 'proximal', ...coords.proximal }
        ];
        for (const p of points) {
            const dx = offsetX - p.x;
            const dy = offsetY - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < 10) {
                draggingPoint = p.name;
                break;
            }
        }
    });

    canvas.addEventListener('mousemove', e => {
        if (!draggingPoint) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        correctionCoords[correctionFrameIndex][draggingPoint] = { x, y };
        showCorrectionFrame();
    });

    canvas.addEventListener('mouseup', () => draggingPoint = null);
    canvas.addEventListener('mouseleave', () => draggingPoint = null);
}

// 5. Save changes on backend ===
async function saveCorrections() {
    const res = await fetch('/update_coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionCoords)
    });
    const data = await res.json();
    alert(data.message);
}

// === 6. Slider and navigation ===
function updateKalmanFrame() {
    correctionFrameIndex = parseInt(document.getElementById('kalmanFrameSlider').value);
    showCorrectionFrame();
}

document.getElementById('prevKalman').addEventListener('click', () => {
    if (correctionFrameIndex > 0) correctionFrameIndex--;
    showCorrectionFrame();
});

document.getElementById('nextKalman').addEventListener('click', () => {
    if (correctionFrameIndex < correctionFrames.length - 1) correctionFrameIndex++;
    showCorrectionFrame();
});

document.getElementById('saveCorrections').addEventListener('click', saveCorrections);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCorrectionFrames();
    setupDragging();
});

// Reset coords modifications
document.getElementById('resetCorrections').addEventListener('click', async () => {
    if (!confirm("⚠️ This will restore the original Kalman coordinates and overwrite your corrections. Continue?")) return;

    try {
        const res = await fetch('/reset_coords', { method: 'POST' });
        const data = await res.json();
        alert(data.message);

        if (res.ok) {
            console.log("✅ Coordinates successfully restored.");
            await loadCoords(); // Reload original coords
            showCorrectionFrame(); // Refresh
        }
    } catch (err) {
        console.error("❌ Error resetting coordinates:", err);
        alert("Error resetting coordinates. Check console for details.");
    }
});
