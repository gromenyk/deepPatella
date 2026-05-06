// correction_frames.js

let correctionFrames = [];
let correctionCoords = []; 
let correctionFrameIndex = 0;
let draggingPoint = null;
let segments = [];

// --- Segment correction state ---
let segmentState = {
    isSelecting: false,
    startFrame: null,
    endFrame: null,
    keyframes: []
};

let baseCoords = [];

// Helper functions

function addKeyframe(frameIndex) {

    if (!segmentState.isSelecting) return;

    // evitar duplicados
    if (!segmentState.keyframes.includes(frameIndex)) {
        segmentState.keyframes.push(frameIndex);
        console.log("Keyframe added:", frameIndex);
    }
}

function saveSegmentsToStorage() {
    localStorage.setItem("dp_segments", JSON.stringify(segments));
}

function loadSegmentsFromStorage() {
    const stored = localStorage.getItem("dp_segments");
    if (stored) {
        segments = JSON.parse(stored);
    }
}

function getCurrentFrame() {
    return correctionFrameIndex;
}

function activateSegmentUI() {
    const container = document.getElementById('kalman-correction-container');
    if (!container) return;
    container.classList.add('segment-active');
}

function deactivateSegmentUI() {
    const container = document.getElementById('kalman-correction-container');
    if (!container) return;
    container.classList.remove('segment-active');
}

// Load frames
async function loadCorrectionFrames() {
    try {
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

// Load coords
async function loadCoords() {

    const distalRaw = await fetch('/static/data/kalman_coords_distal.csv').then(r => r.text());
    const distalRows = distalRaw.trim().split('\n').slice(1);

    const proximalRaw = await fetch('/static/data/kalman_coords_proximal.csv').then(r => r.text());
    const proximalRows = proximalRaw.trim().split('\n').slice(1);

    correctionCoords = distalRows.map((distLine, i) => {
        const d = distLine.split(',');
        const p = proximalRows[i].split(',');

        const d_x = parseFloat(d[d.length - 1]);
        const d_y = parseFloat(d[d.length - 2]);

        const p_x = parseFloat(p[p.length - 1]);
        const p_y = parseFloat(p[p.length - 2]);

        return {
            distal: { x: d_x, y: d_y },
            proximal: { x: p_x, y: p_y }
        };
    });

    baseCoords = JSON.parse(JSON.stringify(correctionCoords));
}

// Show frame
function showCorrectionFrame() {
    const img = document.getElementById('kalman-frame');
    const canvas = document.getElementById('kalman-canvas');
    const ctx = canvas.getContext('2d');

    if (!correctionFrames.length) return;

    img.src = `/clean_frame/${correctionFrameIndex}?t=${Date.now()}`;

    img.onload = () => {
        img.style.display = 'block';
        canvas.style.display = 'block';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const coords = correctionCoords[correctionFrameIndex];
        if (!coords) return;

        ctx.fillStyle = '#D20537';
        ctx.beginPath();
        ctx.arc(coords.distal.x, coords.distal.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(coords.proximal.x, coords.proximal.y, 5, 0, 2 * Math.PI);
        ctx.fill();
    };
}

// Dragging
function setupDragging() {
    const canvas = document.getElementById('kalman-canvas');

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

    canvas.addEventListener('mouseup', () => {
        if (draggingPoint !== null) {
            addKeyframe(correctionFrameIndex);   // 🔥 clave
        }
        draggingPoint = null;
    });
    canvas.addEventListener('mouseleave', () => draggingPoint = null);
}

// Save
async function saveCorrections() {
    const res = await fetch('/update_coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionCoords)
    });

    const data = await res.json();
    alert(data.message);
}

// Navigation
function updateKalmanFrame() {
    correctionFrameIndex = parseInt(document.getElementById('kalmanFrameSlider').value);
    showCorrectionFrame();
}


// --- Start Segment ---
function handleStartSegment() {

    if (segmentState.isSelecting) return;

    const currentFrame = getCurrentFrame();

    segmentState.isSelecting = true;
    segmentState.startFrame = currentFrame;
    segmentState.endFrame = null;
    segmentState.keyframes = [];

    document.getElementById('startSegment').disabled = true;
    document.getElementById('markSegmentEnd').disabled = false;

    document.getElementById('startSegment').classList.add('segment-active');

    console.log("Segment started at frame:", currentFrame);
}

function renderSegmentsTable() {
    const container = document.getElementById('segmentsContainer');
    const tbody = document.querySelector('#segmentsTable tbody');

    if (!container || !tbody) return;

    tbody.innerHTML = '';

    if (segments.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    segments.forEach((seg, index) => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${seg.start}</td>
            <td>${seg.end}</td>
            <td><button class="delete-btn" onclick="deleteSegment(${seg.id})">Delete</button></td>
        `;

        tbody.appendChild(row);
    });
}

function deleteSegment(id) {

    // 1. Eliminar segmento
    segments = segments.filter(s => s.id !== id);
    saveSegmentsToStorage();

    // 2. Resetear a estado original
    correctionCoords = JSON.parse(JSON.stringify(baseCoords));

    // 3. Reaplicar TODOS los segmentos restantes
    segments.forEach(seg => {

        const start = seg.start;
        const end = seg.end;

        const startCoords = correctionCoords[start];
        const endCoords = correctionCoords[end];

        for (let i = start + 1; i < end; i++) {

            const t = (i - start) / (end - start);

            const dx = startCoords.distal.x + t * (endCoords.distal.x - startCoords.distal.x);
            const dy = startCoords.distal.y + t * (endCoords.distal.y - startCoords.distal.y);

            const px = startCoords.proximal.x + t * (endCoords.proximal.x - startCoords.proximal.x);
            const py = startCoords.proximal.y + t * (endCoords.proximal.y - startCoords.proximal.y);

            correctionCoords[i] = {
                distal: { x: dx, y: dy },
                proximal: { x: px, y: py }
            };
        }
    });

    // 4. UI
    loadSegmentsFromStorage();
    renderSegmentsTable();
    showCorrectionFrame();

    if (segments.length === 0) {
        document.getElementById('segmentsContainer').style.display = 'none';
    }

    console.log("Segment deleted and state rebuilt:", id);
}

// Init
document.addEventListener('DOMContentLoaded', () => {

    loadSegmentsFromStorage();  
    renderSegmentsTable();      

    loadCorrectionFrames();
    setupDragging();

    document.getElementById('prevKalman').addEventListener('click', () => {
        if (correctionFrameIndex > 0) correctionFrameIndex--;
        showCorrectionFrame();
    });

    document.getElementById('nextKalman').addEventListener('click', () => {
        if (correctionFrameIndex < correctionFrames.length - 1) correctionFrameIndex++;
        showCorrectionFrame();
    });

    document.getElementById('saveCorrections').addEventListener('click', saveCorrections);

    document.getElementById('startSegment').addEventListener('click', handleStartSegment);

    document.getElementById('markSegmentEnd').addEventListener('click', () => {

        if (!segmentState.isSelecting) return;

        const currentFrame = getCurrentFrame();

        if (currentFrame <= segmentState.startFrame) {
            alert("End frame must be after start frame");
            return;
        }

        segmentState.endFrame = currentFrame;

        document.getElementById('markSegmentEnd').classList.add('segment-end-active');
        document.getElementById('markSegmentEnd').disabled = true;
        document.getElementById('applySegment').disabled = false;
        document.getElementById('cancelSegment').disabled = false;

        console.log("Segment end at frame:", currentFrame);
    });

    document.getElementById('applySegment').addEventListener('click', () => {

        if (segmentState.startFrame === null || segmentState.endFrame === null) return;

        const newSegment = {
            id: Date.now(),
            start: segmentState.startFrame,
            end: segmentState.endFrame
        };

                const overlap = segments.some(seg =>
            !(newSegment.end <= seg.start || newSegment.start >= seg.end)
        );

        if (overlap) {
            alert("Segment overlaps with an existing one");
            return;
        }

        segments.push(newSegment);
        saveSegmentsToStorage();

        // --- MULTI-KEYFRAME INTERPOLATION ---

        let frames = [
            segmentState.startFrame,
            ...(segmentState.keyframes || []),
            segmentState.endFrame
        ];

        frames = [...new Set(frames)].sort((a, b) => a - b);

        for (let k = 0; k < frames.length - 1; k++) {

            const fStart = frames[k];
            const fEnd = frames[k + 1];

            const startCoords = correctionCoords[fStart];
            const endCoords = correctionCoords[fEnd];

            for (let i = fStart + 1; i < fEnd; i++) {

                const t = (i - fStart) / (fEnd - fStart);

                const dx = startCoords.distal.x + t * (endCoords.distal.x - startCoords.distal.x);
                const dy = startCoords.distal.y + t * (endCoords.distal.y - startCoords.distal.y);

                const px = startCoords.proximal.x + t * (endCoords.proximal.x - startCoords.proximal.x);
                const py = startCoords.proximal.y + t * (endCoords.proximal.y - startCoords.proximal.y);

                correctionCoords[i] = {
                    distal: { x: dx, y: dy },
                    proximal: { x: px, y: py }
                };
            }
        }

        console.log("Segment applied:", newSegment);

        renderSegmentsTable();

        showCorrectionFrame();

        segmentState = {
            isSelecting: false,
            startFrame: null,
            endFrame: null
        };

        document.getElementById('startSegment').disabled = false;
        document.getElementById('markSegmentEnd').disabled = true;
        document.getElementById('applySegment').disabled = true;
        document.getElementById('cancelSegment').disabled = true;

        document.getElementById('startSegment').classList.remove('segment-active');
        document.getElementById('markSegmentEnd').classList.remove('segment-end-active');

        deactivateSegmentUI();
    });

    document.getElementById('resetCorrections').addEventListener('click', async () => {

        if (!confirm("⚠️ This will restore the original Kalman coordinates and overwrite your corrections. Continue?")) return;

        localStorage.removeItem("dp_segments");
        segments = [];

        try {
            const res = await fetch('/reset_coords', { method: 'POST' });
            const data = await res.json();
            alert(data.message);

            if (res.ok) {

                segmentState = {
                    isSelecting: false,
                    startFrame: null,
                    endFrame: null
                };

                document.getElementById('startSegment').disabled = false;
                document.getElementById('markSegmentEnd').disabled = true;

                deactivateSegmentUI();

                await loadCoords();
                showCorrectionFrame();
            }

        } catch (err) {
            console.error("Error resetting:", err);
        }
    });

    document.getElementById('cancelSegment').addEventListener('click', () => {

        segmentState = {
            isSelecting: false,
            startFrame: null,
            endFrame: null
        };

        // Reset UI
        document.getElementById('startSegment').disabled = false;
        document.getElementById('markSegmentEnd').disabled = true;
        document.getElementById('applySegment').disabled = true;
        document.getElementById('cancelSegment').disabled = true;

        document.getElementById('startSegment').classList.remove('segment-active');
        document.getElementById('markSegmentEnd').classList.remove('segment-end-active');

        deactivateSegmentUI();

        console.log("Segment cancelled");
    });

    document.getElementById('toggleFrameByFrame').addEventListener('click', () => {

        const content = document.getElementById('frameByFrameContent');
        const arrow = document.getElementById('frameByFrameArrow');

        const isOpen = content.style.display === 'block';

        content.style.display = isOpen ? 'none' : 'block';
        arrow.textContent = isOpen ? '▶' : '▼';
    });

});


