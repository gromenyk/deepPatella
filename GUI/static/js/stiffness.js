// stiffness.js
//
// Tendon force, elongation and stiffness computation module for DeepPatella.
//
// This script powers all processing and visualization tasks inside the
// “Tendon Stiffness Calculation” page. It connects backend outputs 
// (Kalman-corrected coordinates and force ramp file) with interactive plots
// (elongation, force, hysteresis, and TF0–TF80 force–elongation curve).
//
// Responsibilities:
//
//   1. Load baseline tendon length from localStorage (computed in previous module)
//   2. Load Kalman-filtered insertion coordinates and compute tendon elongation (mm)
//   3. Load and process the force ramp (torque → tendon force using moment arm)
//   4. Plot:
//        • elongation across frames
//        • tendon force across frames
//        • hysteresis loop (force vs elongation)
//        • force–elongation curve up to TF80%
//   5. Fit a second-order polynomial (regression.js) to the TF0–TF80 curve
//   6. Compute tendon stiffness using the slope between TF50% and TF80%
//   7. Compute normalized stiffness (stiffness × baseline length)
//   8. Provide tab-based navigation between all plot views
//
// Notes:
//
//   - Elongation and force must have matching frame counts; alignment is handled
//     automatically when pairing datasets.
//   - Conversion factor (px → mm) is stored in localStorage from the baseline module.
//   - Baseline tendon length (rest length) is required for normalized stiffness.
//   - All plots use Chart.js and update incrementally when new data arrives.
//   - TF50 and TF80 are computed dynamically from the processed force ramp.
//   - The module stores intermediate regression results on window.* for reuse.
//

// === Chart.js Black Background Plugin for PDF Export ===
Chart.register({
    id: "custom_canvas_background_color",
    beforeDraw: (chart) => {
        const ctx = chart.canvas.getContext("2d");
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#000"; // Black background
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
});


let chartElongation = null;
let chartHysteresis = null;
let chartTF80 = null;

const USE_LOWER_LEG_MOMENT_ARM = false; // Change to false to not use the lower leg moment arm in stiffness calculation (debugging)

function getBaselineFromStorage() {
    const baseline = parseFloat(localStorage.getItem("deepPatella_baseline_mm"));
    if (isNaN(baseline) || baseline <= 0) {
        throw new Error("Baseline tendon length not found. Please calculate baseline first.");
    }
    return baseline;
}

// Show saved baseline when loading the page
window.addEventListener("load", () => {
    const baselineValue = localStorage.getItem("deepPatella_baseline_mm");
    const baselineInput = document.getElementById("baseline-mm");

    const elongationSourceRadios = document.querySelectorAll(
        "input[name='elongation-source']"
    );

    const baselineManualContainer = document.getElementById(
        "baseline-manual-container"
    );

    function updateBaselineManualVisibility() {
        if (!baselineManualContainer) return;

        const selectedSource = document.querySelector(
            "input[name='elongation-source']:checked"
        )?.value;

        baselineManualContainer.style.display =
            selectedSource === "external" ? "block" : "none";
    }

    elongationSourceRadios.forEach(radio => {
        radio.addEventListener("change", updateBaselineManualVisibility);
    });

    // Run once on page load
    updateBaselineManualVisibility();

    if (baselineValue) {
        baselineInput.value = `${baselineValue} mm`;
    } else {
        baselineInput.value = "Not available";
        console.warn("⚠️ No baseline value found. Please calculate it first in the Baseline module.");
    }

    // Elongation processing button
    const processElongationBtn = document.getElementById("tendon-elongation-processing");

    processElongationBtn.addEventListener("click", async () => {
        try {
            // Read which source was selected (kalman/external)
            const source = document.querySelector("input[name='elongation-source']:checked").value;

            let data;

            if (source === "kalman") {
                console.log("📌 Using Kalman-corrected DeepPatella elongation");
                data = await loadAndProcessCSV(); 
            } else {
                console.log("📌 Using EXTERNAL elongation file");
                data = await loadAndProcessCSV_External(); 
            }

            window.elongationData = data;     
            plotElongation(data);             

        } catch (error) {
            console.error("❌ Error processing tendon elongation:", error);
            alert("Error processing tendon elongation. Check console for details.");
        }
        
    });


    // Upload external tendon elongation
    const uploadExtElongBtn = document.getElementById("upload-tendon-elongation-btn");
    const uploadExtElongInput = document.getElementById("upload-tendon-elongation");

    if (uploadExtElongBtn && uploadExtElongInput) {
        uploadExtElongBtn.addEventListener("click", async () => {
            const file = uploadExtElongInput.files[0];
            if (!file) {
                alert("Please select a CSV or XLSX file first.");
                return;
            }

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch("/upload_external_elongation", {
                    method: "POST",
                    body: formData,
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Upload failed");

                console.log("✅ External elongation uploaded:", result);
                alert("External elongation uploaded successfully.");
            } catch (error) {
                console.error("❌ Error uploading external elongation:", error);
                alert("Error uploading external elongation. Check console for details.");
            }
        });
    }

    // Force ramp processing button
    const processForceBtn = document.getElementById("process-force-btn");
    if (processForceBtn) {
        processForceBtn.addEventListener("click", async () => {
            try {
                const source = document.querySelector(
                    "input[name='elongation-source']:checked"
                )?.value || "kalman";

                const response = await fetch("/process_force", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        elongation_source: source
                    })
                });

                const result = await response.json();
                console.log("✅ Force ramp processed:", result);

                await plotForceRamp();
            } catch (error) {
                console.error("❌ Error processing force ramp:", error);
                alert("Error processing force ramp. Check console for details.");
            }
        });
    }

    // Upload force ramp button (.xlsx)
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

// Read Kalman coords and calculate elongation (in mm)
async function loadAndProcessCSV() {
    const [distalResp, proximalResp] = await Promise.all([
        fetch("/static/data/kalman_coords_distal.csv").then(r => r.text()),
        fetch("/static/data/kalman_coords_proximal.csv").then(r => r.text())
    ]);

    const distalRows = distalResp.trim().split("\n").slice(1);
    const proximalRows = proximalResp.trim().split("\n").slice(1);
    const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor")) || 1;

    const data = distalRows.map((row, i) => {
        const colsD = row.split(",").map(Number);
        const colsP = proximalRows[i].split(",").map(Number);
        const dx = colsD.at(-2);
        const dy = colsD.at(-1);
        const px = colsP.at(-2);
        const py = colsP.at(-1);

        const elongation_mm = Math.sqrt((dy - py) ** 2 + (dx - px) ** 2) / factor;
        return { frame: i + 1, elongation_mm };
    });

    return data;
}

// Read external elongation CSV or XLSX that user uploaded
async function loadAndProcessCSV_External() {
    try {
        const response = await fetch("/static/data/external_elongation.csv");
        const text = await response.text();

        const rows = text.trim().split("\n");
        rows.shift(); // remove header

        const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor")) || 1;

        const data = rows.map((row, i) => {
            const [frame, elong_px] = row.split(",").map(Number);
            const elong_mm = elong_px;
            return { frame, elongation_mm: elong_mm };
        });

        console.log("✅ External elongation loaded:", data);
        window.externalFrames = data.map(d => d.frame);
        return data;

    } catch (error) {
        console.error("❌ Error loading external elongation file:", error);
        throw error;
    }
}

// Tendon length calculation and relative elongation (using Kalman coords)
async function computeTendonElongation() {
    const [distalResp, proximalResp] = await Promise.all([
        fetch("/static/data/kalman_coords_distal.csv").then(r => r.text()),
        fetch("/static/data/kalman_coords_proximal.csv").then(r => r.text())
    ]);

    const distalRows = distalResp.trim().split("\n").slice(1);
    const proximalRows = proximalResp.trim().split("\n").slice(1);
    const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor")) || 1;
    const baseline = parseFloat(localStorage.getItem("deepPatella_baseline_mm")) || 0;

    const elongationData = distalRows.map((row, i) => {
        const colsD = row.split(",").map(Number);
        const colsP = proximalRows[i].split(",").map(Number);
        const dx = colsD.at(-2);
        const dy = colsD.at(-1);
        const px = colsP.at(-2);
        const py = colsP.at(-1);

        const length_px = Math.sqrt((dy - py) ** 2 + (dx - px) ** 2);
        const length_mm = length_px / factor;
        const deltaL = length_mm - baseline;

        return { frame: i + 1, length_mm, deltaL };
    });

    return elongationData;
}



// Plot only elongation
function plotElongation(data) {
    const placeholder = document.querySelector("#plot-force-elongation .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const ctx = document.getElementById("chart-elongation").getContext("2d");
    const frames = data.map(d => d.frame);
    const elongations = data.map(d => d.elongation_mm);

    if (!chartElongation) chartElongation = createGlobalChart(ctx, frames);

    chartElongation.data.datasets = chartElongation.data.datasets.filter(ds => ds.label !== "Tendon length (mm)");

    chartElongation.data.datasets.push({
        label: "Tendon length (mm)",
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

// Plot only force ramp
async function plotForceRamp() {
    const placeholder = document.querySelector("#plot-force-elongation .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const response = await fetch("/static/data/force_ramp_processed.csv");
    const text = await response.text();
    const rows = text.trim().split("\n");
    rows.shift();

    // Read patellar tendon moment arm
    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) {
        momentArm = 0.04;
        console.log("⚙️ Using default patellar tendon moment arm = 0.04 m");
    }

    // Read lower leg moment arm
    const lowerLegMomentArmInput = document.getElementById("lower-leg-moment-arm");
    let lowerLegMomentArm = parseFloat(lowerLegMomentArmInput?.value);
    if (isNaN(lowerLegMomentArm) || lowerLegMomentArm <= 0) {
        lowerLegMomentArm = 0.28;
        console.log("⚙️ Using default lower leg moment arm = 0.28 m");
    }

    // Calculate force in tendon (torque x lower leg moment arm / tendon moment arm)
    const source = document.querySelector(
        "input[name='elongation-source']:checked"
    )?.value;

    if (
        source === "external" &&
        Array.isArray(window.externalFrames) &&
        window.externalFrames.length !== rows.length
    ) {
        console.warn(
            "External elongation and force ramp have different lengths. " +
            "Using the minimum common length."
        );
    }

    const n =
        source === "external" && Array.isArray(window.externalFrames)
            ? Math.min(rows.length, window.externalFrames.length)
            : rows.length;

    const data = [];

    for (let i = 0; i < n; i++) {
        const [, torqueNm] = rows[i].split(",").map(Number);

        let tendonForce;
        if (USE_LOWER_LEG_MOMENT_ARM) {
            tendonForce = (torqueNm * lowerLegMomentArm) / momentArm;
        } else {
            tendonForce = torqueNm / momentArm;
        }

        const frame =
            source === "external" && Array.isArray(window.externalFrames)
                ? window.externalFrames[i]
                : i + 1;

        data.push({ frame, tendonForce });
    }

    window.forceData = data;

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
    console.log("✅ Tendon force curve plotted using both moment arms (lower leg =", lowerLegMomentArm, "m, tendon =", momentArm, "m)");
}

// Create shared plot
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
                    title: { display: true, text: "Tendon length (mm)", color: "#fff" },
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

// Dataset animation in ~3 seconds
function animateDataset(chart, datasetIndex, values) {
    chart.data.datasets[datasetIndex].data = values;
    chart.update();
}

// Tab management
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

// Generate Force-Strain curve button (from any tab)
const generateForceStrainBtn = document.getElementById("generate-force-strain-raw");
if (generateForceStrainBtn) {
    generateForceStrainBtn.addEventListener("click", async () => {
        try {
            // Activate Force-Strain tab
            const rawTab = document.querySelector('[data-target="plot-hysteresis"]');
            if (rawTab) rawTab.click();

            await plotForceElongation();
        } catch (error) {
            console.error("❌ Error generating Force–Strain curve:", error);
            alert("Error generating Force–Strain curve. Check console for details.");
        }
    });
}

// Plot only elongation (Debugging) (ΔL in mm) 
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
                labels: frames,
                datasets: [{
                    label: "Elongation ΔL (mm)",
                    data: deltaL,
                    borderColor: "#00ffaa",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25
                }]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        title: { display: true, text: "Frame", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" }
                    },
                    y: {
                        title: { display: true, text: "Elongation ΔL (mm)", color: "#fff" },
                        ticks: { color: "#fff" },
                        grid: { color: "rgba(255,255,255,0.1)" }
                    }
                },
                plugins: { legend: { labels: { color: "#fff" } } }
            }
        });
    } else {
        chartHysteresis.data.datasets[0].data = deltaL;
        chartHysteresis.update();
    }

}

// Plot Force-Elongation curve
async function plotForceElongation() {
    const placeholder = document.querySelector("#plot-hysteresis .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const ctx = document.getElementById("chart-hysteresis").getContext("2d");

    const forceResp = await fetch("/static/data/force_ramp_processed.csv").then(r => r.text());

    const source = document.querySelector(
        "input[name='elongation-source']:checked"
    )?.value;

    const baseline = getBaselineFromStorage();

    const elongationData =
        source === "external"
            ? window.elongationData.map(d => ({
                frame: d.frame,
                deltaL: d.elongation_mm - baseline
            }))
            : await computeTendonElongation();


    const lines = forceResp.trim().split("\n");
    lines.shift();

    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) momentArm = 0.04;

    const forceData = lines.map(row => {
        const [frame, torqueNm] = row.split(",").map(Number);
        const lowerLegMomentArmInput = document.getElementById("lower-leg-moment-arm");
        let lowerLegMomentArm = parseFloat(lowerLegMomentArmInput?.value);
        if (isNaN(lowerLegMomentArm) || lowerLegMomentArm <= 0) {
            lowerLegMomentArm = 0.28; 
            console.log("⚙️ Using default lower leg moment arm = 0.28 m");
        }

let tendonForce;
if (USE_LOWER_LEG_MOMENT_ARM) {
    tendonForce = (torqueNm * lowerLegMomentArm) / momentArm;
} else {
    tendonForce = torqueNm / momentArm;
}
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


// Generate Force-Strain curve (TF50-TF80)
document.getElementById("generate-force-strain-tf0-tf80").addEventListener("click", function () {

    // Activate normalized Force/Strain curve 
    const targetTab = document.querySelector("[data-target='plot-force-elongation-tf0080']");
    const targetSection = document.getElementById("plot-force-elongation-tf0080");

    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".plot-section").forEach(sec => sec.classList.remove("active"));

    targetTab.classList.add("active");
    targetSection.classList.add("active");

    // Obtain baseline values (tendon length at rest)
    const source = document.querySelector(
        "input[name='elongation-source']:checked"
    )?.value;

    let tendonRestLength;

    try {
        tendonRestLength = getBaselineFromStorage();
    } catch (e) {
        alert(e.message);
        return;
    }

    if (isNaN(tendonRestLength) || tendonRestLength <= 0) {
        alert("Baseline tendon length is missing or invalid.");
        return;
    }
    if (isNaN(tendonRestLength) || tendonRestLength <= 0) {
        alert("Baseline tendon length is missing or invalid.");
        return;
    }

    // Make sure elongation and force have the same length
    const n = Math.min(window.forceData.length, window.elongationData.length);
    const force = window.forceData.slice(0, n).map(d => d.tendonForce);
    const elongation = window.elongationData.slice(0, n);

    // Calculate TFmax and determine range 50-80%
    const TFmax = Math.max(...force);
    const TF50 = 0.5 * TFmax;
    const TF80 = 0.8 * TFmax;

    // Filter points in range 50-80% of TFmax
    const filteredPoints = force
        .map((f, i) => ({ force: f, elong: elongation[i] }))
        .filter(p => p.force >= TF50 && p.force <= TF80);

    if (filteredPoints.length < 3) {
        alert("Not enough data points between 50% and 80% TFmax.");
        return;
    }

    // Calculate normalized strain (%)
    const forceFiltered = filteredPoints.map(p => p.force);
    const strainFiltered = filteredPoints.map(p => ((p.elong - elongation[0]) / tendonRestLength) * 100);

    // Clean previous plot if exists
    if (window.chartForceStrainNorm) {
        window.chartForceStrainNorm.destroy();
    }

    // Create plot with chart.js
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

});

// === Graficar curva Force–Elongation hasta 80 % TFmax === Plot Force-Elongation curve until 80% of TFmax
async function plotForceElongation_TF80() {
    const placeholder = document.querySelector("#plot-force-elongation-tf0080 .chart-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const canvas = document.getElementById("chart-force-elongation-tf0080");
    const ctx = canvas.getContext("2d");

    // Load force and elongation
    const forceResp = await fetch("/static/data/force_ramp_processed.csv").then(r => r.text());

    const source = document.querySelector(
        "input[name='elongation-source']:checked"
    )?.value;

    const baseline = getBaselineFromStorage();

    const elongationData =
        source === "external"
            ? window.elongationData.map(d => ({
                frame: d.frame,
                deltaL: d.elongation_mm - baseline
            }))
            : await computeTendonElongation();

    const lines = forceResp.trim().split("\n");
    lines.shift(); 

    const momentArmInput = document.getElementById("moment-arm");
    let momentArm = parseFloat(momentArmInput?.value);
    if (isNaN(momentArm) || momentArm <= 0) momentArm = 0.04;

    // Convert torque to linear force
    const forceData = lines.map(row => {
        const [frame, torqueNm] = row.split(",").map(Number);
        const lowerLegMomentArmInput = document.getElementById("lower-leg-moment-arm");
        let lowerLegMomentArm = parseFloat(lowerLegMomentArmInput?.value);
        if (isNaN(lowerLegMomentArm) || lowerLegMomentArm <= 0) {
            lowerLegMomentArm = 0.28; 
            console.log("⚙️ Using default lower leg moment arm = 0.28 m");
        }

let tendonForce;
if (USE_LOWER_LEG_MOMENT_ARM) {
    tendonForce = (torqueNm * lowerLegMomentArm) / momentArm;
} else {
    tendonForce = torqueNm / momentArm;
}
        return { frame, tendonForce };
    });

    // Calculate TFmax and 80% limit
    const TFmax = Math.max(...forceData.map(f => f.tendonForce));
    const TF80 = 0.8 * TFmax;

    // Quick control: plot curve until 80% or until 100% of TFmax
    const USE_FULL_CURVE = true;  // ← False: plot 80% of the curve

    let n;
    if (USE_FULL_CURVE) {
        n = Math.min(forceData.length, elongationData.length);
        console.log("Plotting full curve (0–100 % TFmax)");
    } else {
        const cutoffIndex = forceData.findIndex(f => f.tendonForce >= TF80);
        n = Math.min(cutoffIndex + 1, elongationData.length);
        console.log("Plotting until 80% (0–80 % TFmax)");
    }

    const paired = [];
    for (let i = 0; i < n; i++) {
        paired.push({
            x: elongationData[i].deltaL,
            y: forceData[i].tendonForce
        });
    }

    // Polynomial adjustment using regression.js
    const result = regression.polynomial(
        paired.map(p => [p.x, p.y]),
        { order: 2 }
    );

    console.log("✅ Polynomial fit:", result.string);

    // Save results globally for stiffness calculation
    window.lastRegressionResult = result;
    window.lastPairedData = paired;

    // Generate smooth curve for quadratic adjustment
    const coeffs = result.equation; // [a, b, c] of the polynomial a*x² + b*x + c
    const minX = Math.min(...paired.map(p => p.x));
    const maxX = Math.max(...paired.map(p => p.x));
    const fitData = [];

    // Generate 100 points in the range of 0 to 80%
    for (let x = minX; x <= maxX; x += (maxX - minX) / 100) {
        const y = coeffs[0] * x * x + coeffs[1] * x + coeffs[2];
        fitData.push({ x, y });
    }

    // Create or update plot
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

    // Visualize stiffness line (TF50 - TF80)
    const TF50 = 0.5 * TFmax;

    // Find elongations that most approximate the adjustment in TF50 and TF80
    function findXforForce(targetForce) {
        return fitData.reduce((prev, curr) => 
            Math.abs(curr.y - targetForce) < Math.abs(prev.y - targetForce) ? curr : prev
        );
    }

    const point50 = findXforForce(TF50);
    const point80 = findXforForce(TF80);

    // Dataset creation for stiffness line
    const stiffnessLine = [
        { x: point50.x, y: point50.y },
        { x: point80.x, y: point80.y }
    ];

    // Add the line to the plot
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

}

// Generate Force-Elongation curve (TF0-TF80)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("generate-force-strain-tf0-tf80");
  if (!btn) {
    console.warn("⚠️ Button #generate-force-strain-tf0-tf80 not found in DOM.");
    return;
  }

  btn.addEventListener("click", async function () {
    try {
        const targetTab = document.querySelector("[data-target='plot-force-elongation-tf0080']");
        const targetSection = document.getElementById("plot-force-elongation-tf0080");

        document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
        document.querySelectorAll(".plot-section").forEach(sec => sec.classList.remove("active"));

        if (targetTab && targetSection) {
            targetTab.classList.add("active");
            targetSection.classList.add("active");
        }

        await plotForceElongation_TF80();
    } catch (error) {
        console.error("❌ Error generating Force–Elongation (TF₀–TF₈₀):", error);
        alert("Error generating Force–Elongation (TF₀–TF₈₀). Check console for details.");
    }
  });
});

// Calculate tendon stiffness and normalized stiffness
document.getElementById("calculate-stiffness-btn").addEventListener("click", function () {
    try {
        // Make sure that the polynomial adjustment already exists
        if (!window.lastRegressionResult || !window.lastPairedData) {
            alert("Please generate the Force–Elongation (TF₀–TF₈₀) curve first.");
            return;
        }

        const result = window.lastRegressionResult;
        const coeffs = result.equation; // [a, b, c]

        // Obtain max force
        const TFmax = Math.max(...window.lastPairedData.map(p => p.y));
        const TF50 = 0.5 * TFmax;
        const TF80 = 0.8 * TFmax;

        // Polynomial inversion (search elongation for a given force)
        function elongationForForce(F) {
            const [a, b, c] = coeffs;
            const discriminant = b * b - 4 * a * (c - F);
            if (discriminant < 0) return null;
            const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
            const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
            return Math.max(x1, x2); 
        }

        const L50 = elongationForForce(TF50);
        const L80 = elongationForForce(TF80);

        if (L50 == null || L80 == null) {
            alert("Could not determine elongations for TF50–TF80.");
            return;
        }

        // Stiffness calculation (N/mm)
        const stiffness = (TF80 - TF50) / (L80 - L50);

        // Show in UI
        const stiffnessSpan = document.getElementById("stiffness-value");
        stiffnessSpan.textContent = stiffness.toFixed(2);
        localStorage.setItem("deepPatella_stiffness", stiffness.toFixed(2));

        // Calculate normalized stiffness (N)
        const source = document.querySelector(
            "input[name='elongation-source']:checked"
        )?.value;

        let baselineValue;

        try {
            baselineValue = getBaselineFromStorage();
        } catch (e) {
            console.warn(e.message);
            return;
        }

        if (!isNaN(baselineValue) && baselineValue > 0) {
            const normalizedStiffness = stiffness * baselineValue;
            const normalizedSpan = document.getElementById("normalized-stiffness-value");
            if (normalizedSpan) normalizedSpan.textContent = normalizedStiffness.toFixed(2);
            localStorage.setItem("deepPatella_stiffness_normalized", normalizedStiffness.toFixed(2));
            console.log(`Normalized stiffness: ${normalizedStiffness.toFixed(2)} N`);
        } else {
            console.warn("Baseline tendon length missing or invalid for normalized stiffness.");
        }

        console.log(`✅ Tendon stiffness: ${stiffness.toFixed(2)} N/mm`);
    } catch (error) {
        console.error("❌ Error calculating stiffness:", error);
        alert("Error calculating tendon stiffness. Check console for details.");
    }
});

// Export PDF Report
document.getElementById("export-pdf-btn").addEventListener("click", async () => {
    try {
        const source = document.querySelector(
            "input[name='elongation-source']:checked"
        )?.value;

        const baseline = localStorage.getItem("deepPatella_baseline_mm") || "–";
        const factor = localStorage.getItem("deepPatella_conversion_factor") || "–";
        const stiffness = localStorage.getItem("deepPatella_stiffness") || "–";
        const normalized = localStorage.getItem("deepPatella_stiffness_normalized") || "–";
        const videoName = localStorage.getItem("deepPatella_last_video") || "–";
        const timestamp = new Date().toLocaleString();

        // Convertir gráficos a imágenes base64
        const chart1 = document.getElementById("chart-elongation")?.toDataURL() || null;
        const chart2 = document.getElementById("chart-hysteresis")?.toDataURL() || null;
        const chart3 = document.getElementById("chart-force-elongation-tf0080")?.toDataURL() || null;

        const docDefinition = {
            content: [
                { text: "DeepPatella – Tendon Stiffness Report", style: "header" },
                { text: `Generated on: ${timestamp}`, margin: [0, 0, 0, 20] },

                { text: "Input Parameters", style: "subheader" },
                {
                    ul: [
                        `Video file: ${videoName}`,
                        `Baseline tendon length (mm): ${baseline}`,
                        `Pixel–mm conversion factor: ${factor}`,
                    ]
                },

                { text: "\nResults", style: "subheader" },
                {
                    ul: [
                        `Stiffness (N/mm): ${stiffness}`,
                        `Normalized stiffness (N): ${normalized}`
                    ]
                },

                { text: "\nPlots", style: "subheader" },
                chart1 ? { image: chart1, width: 450, margin: [0,10,0,10] } : "",
                chart2 ? { image: chart2, width: 450, margin: [0,10,0,10] } : "",
                chart3 ? { image: chart3, width: 450, margin: [0,10,0,10] } : "",

                { text: "\nDeepPatella – Automated tendon stiffness estimation", style: "footer" }
            ],
            styles: {
                header: { fontSize: 18, bold: true },
                subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
                footer: { fontSize: 8, italics: true, color: "gray" }
            }
        };

        pdfMake.createPdf(docDefinition).download("deepPatella_report.pdf");

    } catch (err) {
        console.error("❌ PDF error:", err);
        alert("Error exporting PDF");
    }
});

document.getElementById("export-xlsx-btn").addEventListener("click", () => {
    try {
        exportResultsToXLSX();
    } catch (err) {
        console.error("❌ XLSX export error:", err);
        alert("Error exporting Excel file. Check console.");
    }
});

function exportResultsToXLSX() {
    if (!window.elongationData || !window.forceData) {
        alert("Please process elongation and force ramp first.");
        return;
    }

    const source = document.querySelector(
        "input[name='elongation-source']:checked"
    )?.value || "kalman";

    
    const baseline = parseFloat(localStorage.getItem("deepPatella_baseline_mm"));
    const stiffness = parseFloat(localStorage.getItem("deepPatella_stiffness"));
    const normalized = parseFloat(localStorage.getItem("deepPatella_stiffness_normalized"));
    const factor = parseFloat(localStorage.getItem("deepPatella_conversion_factor"));
    const momentArm = parseFloat(document.getElementById("moment-arm")?.value) || 0.04;
    const videoName = localStorage.getItem("deepPatella_last_video") || "–";

    /* =========================
       Sheet 1 — Metadata
       ========================= */
    const metadata = [
        ["Parameter", "Value"],
        ["Video file", videoName],
        ["Elongation source", source],
        ["Baseline tendon length (mm)", baseline],
        ["Pixel–mm conversion factor", factor],
        ["Patellar tendon moment arm (m)", momentArm],
        ["Stiffness (N/mm)", stiffness],
        ["Normalized stiffness (N)", normalized],
        ["Export timestamp", new Date().toISOString()]
    ];

    const metaSheet = XLSX.utils.aoa_to_sheet(metadata);

    /* =========================
       Sheet 2 — Time Series
       ========================= */
    const n = Math.min(window.elongationData.length, window.forceData.length);

    const timeSeries = [];
    for (let i = 0; i < n; i++) {
        timeSeries.push({
            frame: window.elongationData[i].frame,
            elongation_mm: window.elongationData[i].elongation_mm,
            deltaL_mm: isFinite(baseline)
                ? window.elongationData[i].elongation_mm - baseline
                : null,
            force_N: window.forceData[i].tendonForce
        });
    }

    const tsSheet = XLSX.utils.json_to_sheet(timeSeries);

    /* =========================
       Sheet 3 — TF50–TF80
       ========================= */
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, metaSheet, "Metadata");
    XLSX.utils.book_append_sheet(wb, tsSheet, "TimeSeries");

    if (window.lastPairedData) {
        const tfSheet = XLSX.utils.json_to_sheet(
            window.lastPairedData.map(p => ({
                deltaL_mm: p.x,
                force_N: p.y
            }))
        );
        XLSX.utils.book_append_sheet(wb, tfSheet, "TF50_TF80");
    }

    XLSX.writeFile(wb, "deepPatella_results.xlsx");
}


// Tooltip HTML support (text + image)
document.querySelectorAll('.info-icon').forEach(icon => {
    let tooltip;

    icon.addEventListener('mouseenter', () => {
        const html = icon.dataset.tooltipHtml;
        if (!html) return;

        tooltip = document.createElement('div');
        tooltip.className = 'tooltip-box';
        tooltip.innerHTML = html;
        document.body.appendChild(tooltip);

        const rect = icon.getBoundingClientRect();
        tooltip.style.top = `${rect.bottom + 8}px`;
        tooltip.style.left = `${rect.left}px`;
    });

    icon.addEventListener('mouseleave', () => {
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    });
});
