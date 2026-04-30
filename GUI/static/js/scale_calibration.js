document.addEventListener("DOMContentLoaded", () => {

    const openBtn = document.getElementById("calibrate-btn");
    const modal = document.getElementById("calibration-modal");
    const closeBtn = document.getElementById("calibration-cancel");
    const confirmBtn = document.getElementById("calibration-confirm");

    const img = document.getElementById("calibration-image");
    const canvas = document.getElementById("calibration-canvas");

    if (!openBtn || !modal || !canvas || !img) return;

    const ctx = canvas.getContext("2d");

    const savedScale = localStorage.getItem("deepPatella_conversion_factor");

    if (savedScale) {
        const originalDisplay = document.getElementById("original-scale-display");
        if (originalDisplay) {
            originalDisplay.textContent = `${parseFloat(savedScale).toFixed(2)} px/mm`;
        }
    }

    if (savedScale) {

        fetch("/transformations")
            .then(res => res.json())
            .then(data => {
                console.log("TRANSFORMATIONS:", data);

                const originalScale = parseFloat(savedScale); // FIX

                const scale_508 =
                    data.input_508?.scale_508 ||
                    data.input_508?.scale ||
                    data.scale_508 ||
                    1;

                const scale_512 =
                    data.input_512?.scale_512 ||
                    data.input_512?.scale ||
                    data.scale_512 ||
                    1;

                const effectiveScale = originalScale * scale_508 * scale_512;

                const effectiveDisplay = document.getElementById("effective-scale-display");

                if (effectiveDisplay) {
                    effectiveDisplay.textContent = `${effectiveScale.toFixed(2)} px/mm`;
                }

                localStorage.setItem("deepPatella_effective_scale", effectiveScale);
            })
            .catch(err => {
                console.error("Error loading transformations:", err);
            });
    }

    let drawing = false;
    let start = null;
    let end = null;

    function resizeCanvas() {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        canvas.style.width = img.clientWidth + "px";
        canvas.style.height = img.clientHeight + "px";
    }

    function drawLine() {
        if (!start || !end) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Line
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        ctx.lineTo(end[0], end[1]);
        ctx.strokeStyle = "#f6ff00";
        ctx.lineWidth = 3;
        ctx.stroke();

        const size = 4;

        // Start marker
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(start[0] - size / 2, start[1] - size / 2, size, size);
        ctx.strokeStyle = "#ff0000";
        ctx.strokeRect(start[0] - size / 2, start[1] - size / 2, size, size);

        // End marker
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(end[0] - size / 2, end[1] - size / 2, size, size);
        ctx.strokeStyle = "#ff0000";
        ctx.strokeRect(end[0] - size / 2, end[1] - size / 2, size, size);

        // SCALE CALCULATION
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];

        const length_px = Math.sqrt(dx * dx + dy * dy);
        const px_per_mm = length_px / 10;

        const display = document.getElementById("calibration-value");
        if (display) {
            display.textContent = px_per_mm.toFixed(2);
        }
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return [
            (e.clientX - rect.left) * scaleX,
            (e.clientY - rect.top) * scaleY
        ];
    }

    // Open modal
    openBtn.addEventListener("click", async () => {

        const baselineMode = document.querySelector('input[name="baseline-mode"]:checked')?.value;

        try {

            if (baselineMode === "manual") {

                const baselineImg = document.getElementById("tendon-frame");

                if (!baselineImg || !baselineImg.src) {
                    alert("No baseline image available.");
                    return;
                }

                img.src = baselineImg.src;

            } else {

                const url = "/static/img/original_frame.png?t=" + Date.now();

                const response = await fetch(url);

                if (!response.ok) {
                    alert("Original frame not available.");
                    return;
                }

                img.src = url;
            }

        } catch (err) {
            alert("Error loading calibration image.");
            return;
        }

        modal.classList.remove("hidden");

        start = null;
        end = null;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 🔥 IMPORTANTE: recalcular cuando cargue imagen correcta
        img.onload = () => {
            resizeCanvas();
        };
    });

    // Close modal
    closeBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
    });

    window.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.add("hidden");
        }
    });

    // Drawing
    canvas.addEventListener("mousedown", (e) => {

        const pos = getMousePos(e);

        if (start && end) {
            start = null;
            end = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        start = pos;
        drawing = true;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!drawing) return;

        const current = getMousePos(e);

        const dx = current[0] - start[0];
        const dy = current[1] - start[1];

        if (Math.abs(dx) > Math.abs(dy)) {
            end = [current[0], start[1]];
        } else {
            end = [start[0], current[1]];
        }

        drawLine();
    });

    canvas.addEventListener("mouseup", () => {
        drawing = false;
    });

    canvas.addEventListener("mouseleave", () => {
        drawing = false;
    });

    // Confirm calibration
    confirmBtn.addEventListener("click", () => {

        if (!start || !end) {
            alert("Please draw a line first.");
            return;
        }

        const dx = end[0] - start[0];
        const dy = end[1] - start[1];

        const length_px = Math.sqrt(dx * dx + dy * dy);
        const px_per_mm = length_px / 10;

        // Save
        localStorage.setItem("deepPatella_conversion_factor", px_per_mm);

        fetch("/transformations")
            .then(res => res.json())
            .then(data => {

                const scale_508 =
                    data.input_508?.scale_508 ||
                    data.input_508?.scale ||
                    data.scale_508 ||
                    1;

                const scale_512 =
                    data.input_512?.scale_512 ||
                    data.input_512?.scale ||
                    data.scale_512 ||
                    1;

                const effectiveScale = px_per_mm * scale_508 * scale_512;

                const effectiveDisplay = document.getElementById("effective-scale-display");

                if (effectiveDisplay) {
                    effectiveDisplay.textContent = `${effectiveScale.toFixed(2)} px/mm`;
                }

                localStorage.setItem("deepPatella_effective_scale", effectiveScale);
            });

        // Update original display
        const originalDisplay = document.getElementById("original-scale-display");
        if (originalDisplay) {
            originalDisplay.textContent = `${px_per_mm.toFixed(2)} px/mm`;
        }

        modal.classList.add("hidden");
    });

});