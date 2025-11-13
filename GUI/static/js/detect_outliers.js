async function loadKalmanData() {
    const distalCSV = await fetch("/static/data/kalman_coords_distal.csv").then(r => r.text());
    const proximalCSV = await fetch("/static/data/kalman_coords_proximal.csv").then(r => r.text());

    function parseCSV(csvText) {
        const rows = csvText.trim().split("\n").slice(1);
        return rows.map(r => {
            const [x, y] = r.split(",").map(Number);
            return { x, y };
        });
    }

    return {
        distal: parseCSV(distalCSV),
        proximal: parseCSV(proximalCSV)
    };
}

function detectOutliers(coords, k = 3) {
    const N = coords.length;

    // --------- Helpers ---------
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = arr => {
        const m = mean(arr);
        return Math.sqrt(arr.map(v => (v - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
    };

    const quantile = (arr, q) => {
        const sorted = [...arr].sort((a,b)=>a-b);
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
            return sorted[base];
        }
    };

    // --------- 1) Velocidad ---------
    const vel = [];
    for (let i = 1; i < N; i++) {
        const dx = coords[i].x - coords[i-1].x;
        const dy = coords[i].y - coords[i-1].y;
        vel.push(Math.sqrt(dx*dx + dy*dy));
    }

    // --------- 2) Aceleración ---------
    const acc = [];
    for (let i = 1; i < vel.length; i++) {
        acc.push(Math.abs(vel[i] - vel[i-1]));
    }

    // --------- 3) Jitter local (varianza en ventana pequeña) ---------
    function localVariance(arr, i, w = 5) {
        const start = Math.max(0, i - w);
        const end = Math.min(arr.length, i + w);
        const slice = arr.slice(start, end);
        return std(slice); // std como medida de jitter
    }

    // --------- 4) Tendencia suavizada ---------
    // Usamos media móvil simple (SMA)
    const smoothX = [];
    const smoothY = [];
    const smoothW = 10; // ventana más grande que el jitter local, pero pequeña comparado con el ring-down

    for (let i = 0; i < N; i++) {
        const start = Math.max(0, i - smoothW);
        const end = Math.min(N, i + smoothW);
        const sliceX = coords.slice(start, end).map(p => p.x);
        const sliceY = coords.slice(start, end).map(p => p.y);
        smoothX.push(mean(sliceX));
        smoothY.push(mean(sliceY));
    }

    // Desviación respecto de la curva suavizada
    const distSmooth = [];
    for (let i = 0; i < N; i++) {
        const dx = coords[i].x - smoothX[i];
        const dy = coords[i].y - smoothY[i];
        distSmooth.push(Math.sqrt(dx*dx + dy*dy));
    }

    // --------- 5) IQR global robusto ---------
    const Q1 = quantile(distSmooth, 0.25);
    const Q3 = quantile(distSmooth, 0.75);
    const IQR = Q3 - Q1;
    const iqrThreshold = Q3 + 1.5 * IQR;

    // --------- Umbrales adaptativos para vel y acc ---------
    const meanV = mean(vel), stdV = std(vel);
    const velThr = meanV + k * stdV;

    const meanA = mean(acc), stdA = std(acc);
    const accThr = meanA + k * stdA;

    // --------- Inicio detección ---------
    const outliers = new Set();

    for (let i = 1; i < N; i++) {

        // Criterio A: velocidad inusual
        if (vel[i-1] > velThr) {
            outliers.add(i);
            continue;
        }

        // Criterio B: aceleración inusual
        if (i > 1 && acc[i-2] > accThr) {
            outliers.add(i);
            continue;
        }

        // Criterio C: jitter local alto
        const jitter = localVariance(vel, i-1, 5);
        if (jitter > stdV * 1.5) {
            outliers.add(i);
            continue;
        }

        // Criterio D: desviación respecto de tendencia suavizada (IQR)
        if (distSmooth[i] > iqrThreshold) {
            outliers.add(i);
            continue;
        }
    }

    return Array.from(outliers).sort((a, b) => a - b);
}



async function analyzeKalmanPredictions() {
    const { distal, proximal } = await loadKalmanData();

    const outliersDistal = detectOutliers(distal);
    const outliersProximal = detectOutliers(proximal);

    console.log("⚠️ Distal outliers:", outliersDistal);
    console.log("⚠️ Proximal outliers:", outliersProximal);

    const combined = Array.from(new Set([...outliersDistal, ...outliersProximal])).sort((a, b) => a - b);
    window.outliers = combined;

    showOutlierWarning(combined);
}

function showOutlierWarning(outliers) {
    const warningBox = document.getElementById("outlier-warning");
    if (!warningBox) return;

    if (outliers.length > 0) {
        const clickableFrames = outliers.map(f =>
            `<span class="outlier-link" data-frame="${f}" title="Go to frame ${f}">${f}</span>`
        ).join(", ");

        warningBox.style.display = "block";
        warningBox.innerHTML = `
            ⚠️ <strong>Warning:</strong> Detected anomalies in frames: ${clickableFrames}
        `;

        // Agregar listeners a cada número clicable
        warningBox.querySelectorAll(".outlier-link").forEach(el => {
            el.addEventListener("click", () => {
                const frame = parseInt(el.getAttribute("data-frame"), 10);
                jumpToFrame(frame);
            });
        });
    } else {
        warningBox.style.display = "none";
    }
}

function jumpToFrame(frameIndex) {
    const slider = document.getElementById("kalmanFrameSlider");
    if (!slider) return;

    // Asegurarse de que el frame esté dentro del rango
    const maxFrame = parseInt(slider.max);
    const target = Math.min(frameIndex, maxFrame);

    slider.value = target;
    updateKalmanFrame(); // 🔁 esta función ya actualiza la imagen y los puntos
}


document.addEventListener("DOMContentLoaded", () => {
    analyzeKalmanPredictions();
});
