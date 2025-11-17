// static/js/correction_frames.js
let correctionFrames = [];
let correctionCoords = []; // [{distal: {x, y}, proximal: {x, y}} por frame]
let correctionFrameIndex = 0;
let draggingPoint = null;

// === 1. Cargar frames ===
async function loadCorrectionFrames() {
    const defaultCount = 250; // número estimado de frames
    try {
        // Verificamos si el backend puede entregar el primer frame limpio
        const testRes = await fetch('/clean_frame/0');
        if (!testRes.ok) {
            console.warn("⚠️ Clean frames not available yet.");
            document.getElementById('kalman-waiting-message').style.display = 'block';
            return;
        }

        // Si llega aquí, asumimos que el cache está cargado
        correctionFrames = Array.from({ length: defaultCount }, (_, i) => i);
        document.getElementById('kalmanFrameSlider').max = correctionFrames.length - 1;

        document.getElementById('kalman-waiting-message').style.display = 'none';
        await loadCoords();
        showCorrectionFrame();
    } catch (err) {
        console.error('Error loading correction frames:', err);
    }
}


// === 2. Cargar coordenadas desde los CSV del Kalman ===
async function loadCoords() {

    // Cargar DISTAL
    const distalRaw = await fetch('/static/data/kalman_coords_distal.csv').then(r => r.text());
    const distalRows = distalRaw.trim().split('\n').slice(1); // skip header

    // Cargar PROXIMAL
    const proximalRaw = await fetch('/static/data/kalman_coords_proximal.csv').then(r => r.text());
    const proximalRows = proximalRaw.trim().split('\n').slice(1); // skip header

    // Tomamos solo las 2 últimas columnas de cada CSV (Predicted_Distal_X/Y o Predicted_Proximal_X/Y)
    correctionCoords = distalRows.map((distLine, i) => {
        const d = distLine.split(',');
        const p = proximalRows[i].split(',');

        // últimas dos columnas = predicción Kalman
        const d_csv_x = parseFloat(d[d.length - 2]);
        const d_csv_y = parseFloat(d[d.length - 1]);

        // UI coords deben ser reales: x=horizontal, y=vertical
        const d_x = d_csv_y;  // REAL horizontal
        const d_y = d_csv_x;  // REAL vertical

        // Proximal igual
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


// === 3. Mostrar frame y coordenadas ===
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

        // Dibuja puntos
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

// === 4. Drag & drop ===
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

// === 5. Guardar cambios en backend ===
async function saveCorrections() {
    const res = await fetch('/update_coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionCoords)
    });
    const data = await res.json();
    alert(data.message);
}

// === 6. Slider y navegación ===
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

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    loadCorrectionFrames();
    setupDragging();
});

document.getElementById('resetCorrections').addEventListener('click', async () => {
    if (!confirm("⚠️ This will restore the original Kalman coordinates and overwrite your corrections. Continue?")) return;

    try {
        const res = await fetch('/reset_coords', { method: 'POST' });
        const data = await res.json();
        alert(data.message);

        if (res.ok) {
            console.log("✅ Coordinates successfully restored.");
            await loadCoords(); // recargar las coordenadas originales
            showCorrectionFrame(); // refrescar vista
        }
    } catch (err) {
        console.error("❌ Error resetting coordinates:", err);
        alert("Error resetting coordinates. Check console for details.");
    }
});
