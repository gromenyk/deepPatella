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


// === 2. Cargar coordenadas desde CSV (ya combinadas distal + proximal en backend) ===
async function loadCoords() {
    const res = await fetch('/static/data/insertion_coords.csv');
    const text = await res.text();
    const rows = text.trim().split('\n').slice(1); // saltar header

    correctionCoords = rows.map(line => {
        const vals = line.split(',').map(Number);

        // Transformación equivalente a la del backend
        const distal_x = vals[1]; // df_coords["distal_y"]
        const distal_y = vals[0]; // df_coords["distal_X"]
        const proximal_x = vals[3]; // df_coords["proximal_y"]
        const proximal_y = vals[2]; // df_coords["proximal_x"]

        return {
            distal: { x: distal_x, y: distal_y },
            proximal: { x: proximal_x, y: proximal_y },
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
        const { offsetX, offsetY } = e;
        correctionCoords[correctionFrameIndex][draggingPoint] = { x: offsetX, y: offsetY };
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

