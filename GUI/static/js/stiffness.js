let chartElongation = null;
let chartHysteresis = null;
let chartTF80 = null;

// === Al cargar la página: mostrar baseline guardado ===
window.addEventListener("load", () => {
    const baselineValue = localStorage.getItem("deepPatella_baseline_mm");
    const baselineInput = document.getElementById("baseline-mm");

    if (baselineValue) {
        baselineInput.value = `${baselineValue} mm`;
    } else {
        baselineInput.value = "Not available";
        console.warn("⚠️ No baseline value found. Please calculate it first in the Baseline module.");
    }

    // Botón: procesar elongación
    const processElongationBtn = document.getElementById("tendon-elongation-processing");
    processElongationBtn.addEventListener("click", async () => {
        try {
            const data = await loadAndProcessCSV();
            plotElongation(data);
        } catch (error) {
            console.error("❌ Error processing tendon elongation:", error);
            alert("Error processing tendon elongation. Please check the CSV file.");
        }
    });

    // Botón: procesar rampa de fuerza
    const processForceBtn = document.getElementById("process-force-btn");
    if (processForceBtn) {
        processForceBtn.addEventListener("click", async () => {
            try {
                const response = await fetch("/process_force", { method: "POST" });
                const result = await response.json();
                console.log("✅ Force ramp processed:", result);

                await plotForceRamp(); // dibuja curva azul
            } catch (error) {
                console.error("❌ Error processing force ramp:", error);
                alert("Error processing force ramp. Check console for details.");
            }
        });
    }

    // === Botón: subir archivo de rampa de fuerza (.xlsx) ===
    const uploadForceBtn = document.getElementById("upload-force-btn");
    const uploadForceInput = document.getElementById("upload-force-ramp");

    if (uploadForceBtn && uploadForceInput) {
        uploadForceBtn.addEventListener("click", async () => {
            const file = uploadForceInput.files[0];
            if (!file) {
                alert("Please select a .xlsx file first.");
                return;
            }

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch("/upload_force", {
                    method: "POST",
                    body: formData
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Upload failed");

                console.log("✅ Upload response:", result);
                alert("Force ramp uploaded successfully. You can now process it.");
            } catch (error) {
                console.error("❌ Error uploading force ramp:", error);
                alert("Error uploading force ramp. Check console for details.");
            }
        });
    }
});

// === Leer CSV, corregir columnas y calcular elongación ===
async function loadAndProcessCSV() {
    const response = await fetch("/static/data/insertion_coords.csv");
    const text = await response.text();

    const rows = text.trim().split("\n");
    rows.shift(); // eliminar encabezado

    const data = rows.map((row, index) => {
        const [distal_X, distal_y, proximal_x, proximal_y, FPS] = row.split(",").map(Number);

        // Reordenar columnas (fix)
        const distal_x = distal_y;
        const distal_y_fixed = distal_X;
        const proximal_x_fixed = proximal_y;
        const proximal_y_fixed = proximal_x;

        // Calcular distancia euclideana
        const elongation = Math.sqrt(
            Math.pow(distal_x - proximal_x_fixed, 2) +
            Math.pow(distal_y_fixed - proximal_y_fixed, 2)
        );

        // Conversión px → mm
        const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor")) || 1;
        const elongation_mm = elongation / factor;

        return { frame: index + 1, elongation_mm };
    });

    console.log("✅ Ejemplo de fila procesada:", data[0]);
    return data;
}

// === Calcular longitud del tendón y elongación relativa ===
async function computeTendonElongation() {
    const response = await fetch("/static/data/insertion_coords.csv");
    const text = await response.text();

    const rows = text.trim().split("\n");
    rows.shift(); // eliminar encabezado

    const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor")) || 1;
    const baseline = parseFloat(localStorage.getItem("deepPatella_baseline_mm")) || 0;

    const elongationData = rows.map((row, index) => {
        const [distal_X, distal_y, proximal_x, proximal_y, FPS] = row.split(",").map(Number);

        // Reordenar columnas si es necesario
        const distal_x = distal_y;
        const distal_y_fixed = distal_X;
        const proximal_x_fixed = proximal_y;
        const proximal_y_fixed = proximal_x;

        // Longitud actual (px)
        const length_px = Math.sqrt(
            Math.pow(distal_x - proximal_x_fixed, 2) +
            Math.pow(distal_y_fixed - proximal_y_fixed, 2)
        );

        // Conversión px → mm
        const length_mm = length_px / factor;

        // Elongación respecto al baseline
        const deltaL = length_mm - baseline;

        return { frame: index + 1, length_mm, deltaL };
    });

    console.log("✅ Ejemplo elongationData:", elongationData[0]);
    return elongationData;
}

// === Graficar SOLO la elongación ===
function plotElongation(data) {
    const placeholder = document.querySelector("#plot-force-elongation .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const ctx = document.getElementById("chart-elongation").getContext("2d");
    const frames = data.map(d => d.frame);
    const elongations = data.map(d => d.elongation_mm);

    if (!chartElongation) chartElongation = createGlobalChart(ctx, frames);

    chartElongation.data.datasets = chartElongation.data.datasets.filter(ds => ds.label !== "Tendon elongation (mm)");

    chartElongation.data.datasets.push({
        label: "Tendon elongation (mm)",
        data: [],
        borderColor: "#ff6b00",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        yAxisID: "yElong"
    });

    animateDataset(chartElongation, 0, elongations);
    console.log("✅ Elongation curve plotted");
}

// === Graficar SOLO la rampa de fuerza ===
async function plotForceRamp() {
    const placeholder = document.querySelector("#plot-force-elongation .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const response = await fetch("/static/data/force_ramp_processed.csv");
    const text = await response.text();
    const rows = text.trim().split("\n");
    rows.shift();

    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) {
        momentArm = 0.04;
        console.log("⚙️ Using default moment arm = 0.04 m");
    }

    const data = rows.map(row => {
        const [frame, forceRight] = row.split(",").map(Number);
        const tendonForce = forceRight / momentArm;
        return { frame, tendonForce };
    });

    const frames = data.map(d => d.frame);
    const forces = data.map(d => d.tendonForce);
    const ctx = document.getElementById("chart-elongation").getContext("2d");

    if (!chartElongation) chartElongation = createGlobalChart(ctx, frames);

    chartElongation.data.datasets = chartElongation.data.datasets.filter(ds => ds.label !== "Tendon force (N)");

    chartElongation.data.datasets.push({
        label: "Tendon force (N)",
        data: [],
        borderColor: "#00aaff",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        yAxisID: "yForce"
    });

    animateDataset(chartElongation, 1, forces);
    console.log("✅ Tendon force curve plotted (moment arm =", momentArm, ")");
}

// === Crear gráfico compartido ===
function createGlobalChart(ctx, frames) {
    return new Chart(ctx, {
        type: "line",
        data: { labels: frames, datasets: [] },
        options: {
            responsive: true,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: "Frame", color: "#fff" },
                    ticks: { color: "#fff" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                },
                yElong: {
                    type: "linear",
                    position: "left",
                    title: { display: true, text: "Elongation (mm)", color: "#fff" },
                    ticks: { color: "#ff6b00" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                },
                yForce: {
                    type: "linear",
                    position: "right",
                    title: { display: true, text: "Force (N)", color: "#fff" },
                    ticks: { color: "#00aaff" },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: { legend: { labels: { color: "#fff" } } }
        }
    });
}

// === Animar dataset en ~3 segundos ===
function animateDataset(chart, datasetIndex, values) {
    chart.data.datasets[datasetIndex].data = values;
    chart.update();
}

// === TAB MANAGEMENT ===
const tabButtons = document.querySelectorAll(".tab-btn");
const plotSections = document.querySelectorAll(".plot-section");
let activeTab = "plot-force-elongation";

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.dataset.target;

        tabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        plotSections.forEach(section => {
            section.classList.remove("active");
            if (section.id === target) section.classList.add("active");
        });

        activeTab = target;
    });
});

// === Botón: generar curva Force–Strain (desde cualquier pestaña) ===
const generateForceStrainBtn = document.getElementById("generate-force-strain-raw");
if (generateForceStrainBtn) {
    generateForceStrainBtn.addEventListener("click", async () => {
        try {
            // Activar pestaña Force–Strain (raw)
            const rawTab = document.querySelector('[data-target="plot-hysteresis"]');
            if (rawTab) rawTab.click();

            await plotForceElongation();
        } catch (error) {
            console.error("❌ Error generating Force–Strain curve:", error);
            alert("Error generating Force–Strain curve. Check console for details.");
        }
    });
}

// === Plot only elongation (Debugging) (ΔL en mm) ===
async function plotElongationOnly() {
    const placeholder = document.querySelector("#plot-hysteresis .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const canvas = document.getElementById("chart-hysteresis");
    const ctx = canvas.getContext("2d");

    const elongationData = await computeTendonElongation();

    const frames = elongationData.map(d => d.frame);
    const deltaL = elongationData.map(d => d.deltaL);

    if (!chartHysteresis) {
        chartHysteresis = new Chart(ctx, {
            type: "line",
            data: {
                datasets: [{
                    label: "Force–Elongation (ΔL vs Force)",
                    data: paired,
                    borderColor: "#00ffaa",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25
                }]
            },
            options: {
                parsing: false,
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Elongation ΔL (mm)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" }
                    },
                    y: {
                        title: { display: true, text: "Tendon Force (N)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" }
                    }
                },
                plugins: { legend: { labels: { color: "#fff" } } }
            }
        });
    } else {
        chartHysteresis.data.datasets[0].data = paired;
        chartHysteresis.update();
    }


    console.log("✅ Elongation-only curve plotted");
}

// === Graficar curva Force–Elongation (ΔL vs Force) ===
async function plotForceElongation() {
    const placeholder = document.querySelector("#plot-hysteresis .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const ctx = document.getElementById("chart-hysteresis").getContext("2d");

    const [forceResp, elongationData] = await Promise.all([
        fetch("/static/data/force_ramp_processed.csv").then(r => r.text()),
        computeTendonElongation()
    ]);

    const lines = forceResp.trim().split("\n");
    lines.shift();

    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) momentArm = 0.04;

    const forceData = lines.map(row => {
        const [frame, torqueNm] = row.split(",").map(Number);
        const tendonForce = torqueNm / momentArm;
        return { frame, tendonForce };
    });

    const n = Math.min(forceData.length, elongationData.length);
    const paired = [];
    for (let i = 0; i < n; i++) {
        paired.push({
            x: elongationData[i].deltaL,
            y: forceData[i].tendonForce
        });
    }

    const minX = Math.min(...paired.map(p => p.x));
    const maxX = Math.max(...paired.map(p => p.x));
    const maxY = Math.max(...paired.map(p => p.y));

    if (!chartHysteresis) {
        chartHysteresis = new Chart(ctx, {
            type: "line",
            data: {
                datasets: [{
                    label: "Force–Elongation (ΔL vs Force)",
                    data: paired,
                    borderColor: "#00ffaa",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25
                }]
            },
            options: {
                parsing: false,
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Elongation ΔL (mm)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" },
                        min: minX - 0.5,
                        max: maxX + 0.5
                    },
                    y: {
                        title: { display: true, text: "Tendon Force (N)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" },
                        max: maxY * 1.05
                    }
                },
                plugins: { legend: { labels: { color: "#fff" } } }
            }
        });
    } else {
        chartHysteresis.data.datasets[0].data = paired;
        chartHysteresis.update();
    }

    console.log("✅ Force–Elongation hysteresis plotted");
}


// === GENERATE FORCE–STRAIN CURVE (TF50–TF80) ===
document.getElementById("generate-force-strain-tf0-tf80").addEventListener("click", function () {

    // --- Activar pestaña Force–Strain Normalized ---
    const targetTab = document.querySelector("[data-target='plot-force-elongation-tf0080']");
    const targetSection = document.getElementById("plot-force-elongation-tf0080");

    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".plot-section").forEach(sec => sec.classList.remove("active"));

    targetTab.classList.add("active");
    targetSection.classList.add("active");

    // Obtener valores del baseline (longitud en reposo del tendón)
    const baselineInput = document.getElementById("baseline-mm");
    const tendonRestLength = parseFloat(baselineInput.value);
    if (isNaN(tendonRestLength) || tendonRestLength <= 0) {
        alert("Baseline tendon length is missing or invalid.");
        return;
    }

    // Asegurar que fuerza y elongación tengan la misma longitud
    const n = Math.min(window.forceData.length, window.elongationData.length);
    const force = window.forceData.slice(0, n);
    const elongation = window.elongationData.slice(0, n);

    // Calcular TFmax y determinar rango 50–80 %
    const TFmax = Math.max(...force);
    const TF50 = 0.5 * TFmax;
    const TF80 = 0.8 * TFmax;

    // Filtrar puntos dentro del rango 50–80 % de TFmax
    const filteredPoints = force
        .map((f, i) => ({ force: f, elong: elongation[i] }))
        .filter(p => p.force >= TF50 && p.force <= TF80);

    if (filteredPoints.length < 3) {
        alert("Not enough data points between 50% and 80% TFmax.");
        return;
    }

    // Calcular strain normalizado (%)
    const forceFiltered = filteredPoints.map(p => p.force);
    const strainFiltered = filteredPoints.map(p => ((p.elong - elongation[0]) / tendonRestLength) * 100);

    // Limpiar gráfico anterior si existe
    if (window.chartForceStrainNorm) {
        window.chartForceStrainNorm.destroy();
    }

    // === Crear gráfico con Chart.js ===
    const ctx = document.getElementById("chart-force-strain-normalized").getContext("2d");
    window.chartForceStrainNorm = new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [{
                label: "Force–Strain (TF₅₀–TF₈₀)",
                data: forceFiltered.map((f, i) => ({ x: strainFiltered[i], y: f })),
                borderColor: "#ff7b00",
                backgroundColor: "rgba(255,123,0,0.4)",
                pointRadius: 3,
                showLine: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "Force–Strain Curve (Normalized, TF₅₀–TF₈₀)",
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `Force: ${ctx.parsed.y.toFixed(2)} N, Strain: ${ctx.parsed.x.toFixed(2)} %`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Strain (%)" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                },
                y: {
                    title: { display: true, text: "Force (N)" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                }
            }
        }
    });

    console.log("✅ Force–Strain (TF50–TF80) plot generated.");
});

// === Graficar curva Force–Elongation hasta 80 % TFmax ===
async function plotForceElongation_TF80() {
    const placeholder = document.querySelector("#plot-force-elongation-tf0080 .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const canvas = document.getElementById("chart-force-elongation-tf0080");
    const ctx = canvas.getContext("2d");

    // === Cargar fuerza y elongación ===
    const [forceResp, elongationData] = await Promise.all([
        fetch("/static/data/force_ramp_processed.csv").then(r => r.text()),
        computeTendonElongation()
    ]);

    const lines = forceResp.trim().split("\n");
    lines.shift(); // eliminar encabezado

    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) momentArm = 0.04;

    // --- Convertir torque → fuerza lineal
    const forceData = lines.map(row => {
        const [frame, torqueNm] = row.split(",").map(Number);
        const tendonForce = torqueNm / momentArm;
        return { frame, tendonForce };
    });

    // --- Calcular TFmax y límite 80 %
    const TFmax = Math.max(...forceData.map(f => f.tendonForce));
    const TF80 = 0.8 * TFmax;

    // --- Tomar solo hasta el 80 % del máximo
    const cutoffIndex = forceData.findIndex(f => f.tendonForce >= TF80);
    const n = Math.min(cutoffIndex + 1, elongationData.length);

    const paired = [];
    for (let i = 0; i < n; i++) {
        paired.push({
            x: elongationData[i].deltaL,
            y: forceData[i].tendonForce
        });
    }

    // === Ajuste polinómico usando la librería regression.js ===
    const result = regression.polynomial(
        paired.map(p => [p.x, p.y]),
        { order: 2 }
    );

    console.log("✅ Polynomial fit:", result.string);

    // Guardar resultados globalmente para cálculo de rigidez
    window.lastRegressionResult = result;
    window.lastPairedData = paired;

    // === Generar curva suavizada para el ajuste cuadrático ===
    const coeffs = result.equation; // [a, b, c] del polinomio a*x² + b*x + c
    const minX = Math.min(...paired.map(p => p.x));
    const maxX = Math.max(...paired.map(p => p.x));
    const fitData = [];

    // Generar 100 puntos entre el rango 0–80%
    for (let x = minX; x <= maxX; x += (maxX - minX) / 100) {
        const y = coeffs[0] * x * x + coeffs[1] * x + coeffs[2];
        fitData.push({ x, y });
    }


    console.log("✅ TFmax:", TFmax, "| TF80:", TF80, "| Frames usados:", n);

    // === Crear o actualizar gráfico ===
    if (!chartTF80) {
        chartTF80 = new Chart(ctx, {
            type: "line",
            data: {
                datasets: [{
                    label: "Force–Elongation (0–80 % TFₘₐₓ)",
                    data: paired,
                    borderColor: "#A5D7D2",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25
                },
                {
                    label: "Quadratic Fit",
                    data: fitData,
                    borderColor: "#D20537",
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [6, 3],
                    tension: 0.15
                }]
            },
            options: {
                parsing: false,
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Elongation ΔL (mm)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" },
                        min: Math.min(...paired.map(p => p.x)) - 1,
                        max: Math.max(...paired.map(p => p.x)) + 1, 
                        grace: 0
                    },
                    y: {
                        title: { display: true, text: "Tendon Force (N)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" }
                    }
                },
                plugins: { legend: { labels: { color: "#fff" } } }
            }
        });
    } else {
        chartTF80.data.datasets[0].data = paired;
        chartTF80.update();
    }


    console.log("✅ Force–Elongation (0–80 %) plotted");

    // === Visualizar la línea de rigidez (TF50–TF80) ===
    const TF50 = 0.5 * TFmax;

    // Encontrar elongaciones en el ajuste (fitData) que más se aproximen a TF50 y TF80
    function findXforForce(targetForce) {
        // Busca el punto en fitData cuyo y esté más cerca de targetForce
        return fitData.reduce((prev, curr) => 
            Math.abs(curr.y - targetForce) < Math.abs(prev.y - targetForce) ? curr : prev
        );
    }

    const point50 = findXforForce(TF50);
    const point80 = findXforForce(TF80);

    // Crear dataset para la línea de rigidez
    const stiffnessLine = [
        { x: point50.x, y: point50.y },
        { x: point80.x, y: point80.y }
    ];

    // Agregar la línea al gráfico
    chartTF80.data.datasets.push({
        label: "Stiffness (50–80 % TFₘₐₓ)",
        data: stiffnessLine,
        borderColor: "#FFD700",
        borderWidth: 3,
        borderDash: [2, 2],
        pointRadius: 5,
        pointBackgroundColor: "#FFD700",
        tension: 0
    });

    chartTF80.update();

    console.log("✅ Stiffness line (TF50–TF80) added visually");

}

// === GENERATE FORCE–ELONGATION CURVE (TF0–TF80) ===
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("generate-force-strain-tf0-tf80");
  if (!btn) {
    console.warn("⚠️ Button #generate-force-strain-tf0-tf80 not found in DOM.");
    return;
  }

  btn.addEventListener("click", async function () {
    try {
        // --- Activar pestaña Force–Elongation (TF0–TF80) ---
        const targetTab = document.querySelector("[data-target='plot-force-elongation-tf0080']");
        const targetSection = document.getElementById("plot-force-elongation-tf0080");

        document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
        document.querySelectorAll(".plot-section").forEach(sec => sec.classList.remove("active"));

        if (targetTab && targetSection) {
            targetTab.classList.add("active");
            targetSection.classList.add("active");
        }

        // --- Procesamiento y gráfico ---
        await plotForceElongation_TF80();
    } catch (error) {
        console.error("❌ Error generating Force–Elongation (TF₀–TF₈₀):", error);
        alert("Error generating Force–Elongation (TF₀–TF₈₀). Check console for details.");
    }
  });
});

// === CALCULAR TENDON STIFFNESS Y NORMALIZED STIFFNESS ===
document.getElementById("calculate-stiffness-btn").addEventListener("click", function () {
    try {
        // Asegurar que ya exista el ajuste polinómico
        if (!window.lastRegressionResult || !window.lastPairedData) {
            alert("Please generate the Force–Elongation (TF₀–TF₈₀) curve first.");
            return;
        }

        const result = window.lastRegressionResult;
        const coeffs = result.equation; // [a, b, c]

        // === Obtener fuerza máxima ===
        const TFmax = Math.max(...window.lastPairedData.map(p => p.y));
        const TF50 = 0.5 * TFmax;
        const TF80 = 0.8 * TFmax;

        // === Invertir polinomio (buscar elongación para una fuerza dada) ===
        function elongationForForce(F) {
            const [a, b, c] = coeffs;
            const discriminant = b * b - 4 * a * (c - F);
            if (discriminant < 0) return null;
            const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
            const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
            return Math.max(x1, x2); // usamos la rama ascendente
        }

        const L50 = elongationForForce(TF50);
        const L80 = elongationForForce(TF80);

        if (L50 == null || L80 == null) {
            alert("Could not determine elongations for TF50–TF80.");
            return;
        }

        // === 1️⃣ Calcular stiffness (N/mm) ===
        const stiffness = (TF80 - TF50) / (L80 - L50);

        // Mostrar en interfaz
        const stiffnessSpan = document.getElementById("stiffness-value");
        stiffnessSpan.textContent = stiffness.toFixed(2);

        // === 2️⃣ Calcular stiffness normalizada (N) ===
        const baselineValue = parseFloat(localStorage.getItem("deepPatella_baseline_mm"));
        if (!isNaN(baselineValue) && baselineValue > 0) {
            const normalizedStiffness = stiffness * baselineValue;
            const normalizedSpan = document.getElementById("normalized-stiffness-value");
            if (normalizedSpan) normalizedSpan.textContent = normalizedStiffness.toFixed(2);
            console.log(`✅ Normalized stiffness: ${normalizedStiffness.toFixed(2)} N`);
        } else {
            console.warn("⚠️ Baseline tendon length missing or invalid for normalized stiffness.");
        }

        console.log(`✅ Tendon stiffness: ${stiffness.toFixed(2)} N/mm`);
    } catch (error) {
        console.error("❌ Error calculating stiffness:", error);
        alert("Error calculating tendon stiffness. Check console for details.");
    }
});
