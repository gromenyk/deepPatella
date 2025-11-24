// baseline.js
//
// Baseline calculation module for DeepPatella, to obtain the tendon elongation at rest, in mm.
//
// This script runs on the Baseline Calculation page.
//
// Responsibilities:
//
//   - Displays the baseline frame and a transparent overlay canvas
//   - Loads distal/proximal coordinates predicted by Kalman filtering
//   - Allows manual correction of landmarks via drag & drop
//   - Supports adding/removing two extra points for spline interpolation
//   - Generates a Catmull–Rom curve and computes tendon length in pixels
//   - Converts px → mm using the user-defined calibration factor
//   - Stores the baseline (mm) and conversion factor in localStorage
//   - Polls for frame availability and Kalman coordinates on load
//

window.addEventListener("load", () => {
    const img = document.getElementById("tendon-frame");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    // Initial placeholder
    function drawPlaceholder() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ccc"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000"; 
        ctx.font = "20px Arial";
        ctx.fillText("Waiting for the first frame...", 40, canvas.height / 2);
    }

    // Adjusts the canvas to the size of the image
    function resizeCanvas() {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        drawPlaceholder();   
    }
    resizeCanvas();

    window.addEventListener("resize", () => {
        resizeCanvas();
        draw();
    });

    // Parse "(x, y)" → [x, y]
    function parseCoords(value) {
        const match = value.match(/\(([\d.]+),\s*([\d.]+)\)/);
        return match ? [parseFloat(match[1]), parseFloat(match[2])] : null;
    }

    // Initial distal and proximal tendon-bone insertion coords (predicted, can not be eliminated with right click)
    let points = [
        {
            coords: parseCoords(document.getElementById("distal").value),
            color: "#00FF00",
            inputId: "distal",
            fixed: true
        },
        {
            coords: parseCoords(document.getElementById("proximal").value),
            color: "#00BFFF",
            inputId: "proximal",
            fixed: true
        }
    ];

    let draggedPoint = null;
    let dragging = false; // flag to differenciate drag vs click

    // Points drawing
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        points.forEach(p => {
            if (!p.coords) return;
            ctx.beginPath();
            ctx.arc(p.coords[0], p.coords[1], 6, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
        });
    }

    draw();

    // Defines area to search for a point to check if the point is touchable - as a selection area (for dragging o delete)
    function getPointAt(x, y) {
        return points.find(p => {
            if (!p.coords) return false;
            const dx = x - p.coords[0];
            const dy = y - p.coords[1];
            return Math.sqrt(dx * dx + dy * dy) < 15; 
        });
    }

    // === Drag & drop ===
    canvas.addEventListener("mousedown", e => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        draggedPoint = getPointAt(x, y);

        if (draggedPoint) {
            dragging = true;
        }
    });

    canvas.addEventListener("mousemove", e => {
        if (!draggedPoint) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        draggedPoint.coords = [x, y];
        draw();
    });

    canvas.addEventListener("mouseup", () => {
        if (draggedPoint) {
            const input = document.getElementById(draggedPoint.inputId);
            if (input) {
                input.value = `(${draggedPoint.coords[0].toFixed(1)}, ${draggedPoint.coords[1].toFixed(1)})`;
            }
        }
        draggedPoint = null;
        setTimeout(() => { dragging = false; }, 0);
    });

    // Create extra points with mouse left click ===
    canvas.addEventListener("click", e => {
        if (dragging) return;

        // Check which input is still free
        const slots = [
            { id: "extra1", color: "#FFA500" },
            { id: "extra2", color: "#FF00FF" }
        ];
        const freeSlot = slots.find(slot => {
            const input = document.getElementById(slot.id);
            return input && input.value === "";
        });

        if (!freeSlot) return; // No free slots

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update input
        const input = document.getElementById(freeSlot.id);
        if (input) {
            input.value = `(${x.toFixed(1)}, ${y.toFixed(1)})`;
        }

        // If point already existed, replace. Otherwise, add the point. 
        const existing = points.find(p => p.inputId === freeSlot.id);
        if (existing) {
            existing.coords = [x, y];
        } else {
            points.push({
                coords: [x, y],
                color: freeSlot.color,
                inputId: freeSlot.id,
                fixed: false
            });
        }

        draw();
    });

    // Delete extra point with mouse right click
    canvas.addEventListener("contextmenu", e => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const point = getPointAt(x, y);
        if (point && !point.fixed) { // Only extra points can be deleted
            const input = document.getElementById(point.inputId);
            if (input) input.value = "";

            points = points.filter(p => p.inputId !== point.inputId);

            draw();
        }
    });

    // Button for calculating the tendon length and drawing the curve
    document.getElementById("calculate-btn").addEventListener("click", () => {
        let validPoints = points.filter(p => p.coords).map(p => p.coords);

        if (validPoints.length < 2) {
            alert("At least 2 points are needed to calculate the length");
            return;
        }

        // Arrange points from left to right
        validPoints.sort((a, b) => a[0] - b[0]);

        // Catmull-Rom curve generation
        const curve = window.catmullRomSpline(validPoints, 30);
        const length = window.curveLength(curve);

        // Re-draw points on top of the curve
        draw();
        window.drawCurve(ctx, curve);

        // Show length in input
        document.getElementById("tendon-length").value = length.toFixed(2);
    });

    // px → mm button conversion
    document.getElementById("convert-btn").addEventListener("click", () => {
        const pxValue = parseFloat(document.getElementById("tendon-length").value);
        const factor = parseFloat(document.getElementById("conversion-factor").value);

        if (isNaN(pxValue)) {
            alert("You need to calculate the tendon length in pixels first.");
            return;
        }

        if (isNaN(factor) || factor <= 0) {
            alert("Please enter a valid conversion factor (px per mm).");
            return;
        }

        const mmValue = pxValue / factor;
        document.getElementById("tendon-length-mm").value = mmValue.toFixed(2);

        localStorage.setItem("deepPatella_baseline_mm", mmValue.toFixed(2));
        localStorage.setItem("deepPatella_conversion_factor", factor);
    });


    // Polling for loading the real frame when available
    const frameUrl = img.getAttribute("data-frame-url");

    function checkFrame() {
        fetch(frameUrl, { cache: "no-store" })
            .then(response => {
                if (response.ok) {
                    img.src = frameUrl + "?t=" + new Date().getTime();
                } else {
                    setTimeout(checkFrame, 1000); 
                }
            })
            .catch(() => setTimeout(checkFrame, 1000));
    }
    checkFrame();

    // Polling for Kalman coordinates loading
    const distalUrl = document.body.getAttribute("data-distal-url");
    const proximalUrl = document.body.getAttribute("data-proximal-url");

    let kalmanLoaded = false;

    function checkKalman() {
        if (kalmanLoaded) return;

        Promise.all([
            fetch(distalUrl, { cache: "no-store" }).then(r => r.text()),
            fetch(proximalUrl, { cache: "no-store" }).then(r => r.text())
        ])
        .then(([distText, proxText]) => {

            const distRows = distText.trim().split("\n");
            const proxRows = proxText.trim().split("\n");

            if (distRows.length < 2 || proxRows.length < 2)
                throw new Error("Not ready");

            const d = distRows[1].split(",");
            const p = proxRows[1].split(",");

            // Only the two last columns from the file are used
            const d_csv_x = parseFloat(d[d.length - 2]);
            const d_csv_y = parseFloat(d[d.length - 1]);

            const p_csv_x = parseFloat(p[p.length - 2]);
            const p_csv_y = parseFloat(p[p.length - 1]);

            // Column order correction
            const distalX = d_csv_y;
            const distalY = d_csv_x;

            const proximalX = p_csv_y;
            const proximalY = p_csv_x;

            // Inputs update
            document.getElementById("distal").value = `(${distalX.toFixed(1)}, ${distalY.toFixed(1)})`;
            document.getElementById("proximal").value = `(${proximalX.toFixed(1)}, ${proximalY.toFixed(1)})`;

            // UI points update
            points.find(p => p.inputId === "distal").coords = [distalX, distalY];
            points.find(p => p.inputId === "proximal").coords = [proximalX, proximalY];

            draw();

            kalmanLoaded = true;
            console.log("Kalman coords loaded for baseline");
        })
        .catch(() => {
            setTimeout(checkKalman, 3000);
        });
    }

    checkKalman();

});
