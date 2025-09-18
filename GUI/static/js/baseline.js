// baseline.js

window.addEventListener("load", () => {
    const img = document.getElementById("tendon-frame");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    // === Placeholder inicial ===
    function drawPlaceholder() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ccc"; // gris de fondo
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000"; // texto negro
        ctx.font = "20px Arial";
        ctx.fillText("Esperando primer frame...", 40, canvas.height / 2);
    }

    // Ajusta canvas al tamaño de la imagen en pantalla
    function resizeCanvas() {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        drawPlaceholder();   // placeholder al inicio
    }
    resizeCanvas();

    window.addEventListener("resize", () => {
        resizeCanvas();
        draw();
    });

    // Parsear "(x, y)" → [x, y]
    function parseCoords(value) {
        const match = value.match(/\(([\d.]+),\s*([\d.]+)\)/);
        return match ? [parseFloat(match[1]), parseFloat(match[2])] : null;
    }

    // Puntos iniciales (predichos, no eliminables con click derecho)
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
    let dragging = false; // flag para diferenciar drag vs click

    // === Dibujo de puntos ===
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        points.forEach(p => {
            if (!p.coords) return;

            // círculo relleno sin borde
            ctx.beginPath();
            ctx.arc(p.coords[0], p.coords[1], 6, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
        });
    }

    draw();

    // Buscar si hay punto en la posición (para drag o delete)
    function getPointAt(x, y) {
        return points.find(p => {
            if (!p.coords) return false;
            const dx = x - p.coords[0];
            const dy = y - p.coords[1];
            return Math.sqrt(dx * dx + dy * dy) < 15; // más tolerancia
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

    // === Crear puntos extra con click izquierdo ===
    canvas.addEventListener("click", e => {
        if (dragging) return;

        // Buscar cuál input está libre
        const slots = [
            { id: "extra1", color: "#FFA500" },
            { id: "extra2", color: "#FF00FF" }
        ];
        const freeSlot = slots.find(slot => {
            const input = document.getElementById(slot.id);
            return input && input.value === "";
        });

        if (!freeSlot) return; // no hay slot libre

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Actualizar input
        const input = document.getElementById(freeSlot.id);
        if (input) {
            input.value = `(${x.toFixed(1)}, ${y.toFixed(1)})`;
        }

        // Reemplazar si ya existía en points, si no agregar
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

    // === Eliminar punto extra con click derecho ===
    canvas.addEventListener("contextmenu", e => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const point = getPointAt(x, y);
        if (point && !point.fixed) { // sólo los extras se pueden eliminar
            const input = document.getElementById(point.inputId);
            if (input) input.value = "";

            points = points.filter(p => p.inputId !== point.inputId);

            draw();
        }
    });

    // === Botón para calcular longitud y dibujar curva ===
    document.getElementById("calculate-btn").addEventListener("click", () => {
        let validPoints = points.filter(p => p.coords).map(p => p.coords);

        if (validPoints.length < 2) {
            alert("Necesitas al menos 2 puntos para calcular la longitud");
            return;
        }

        // Ordenar puntos de izquierda a derecha (menor a mayor X)
        validPoints.sort((a, b) => a[0] - b[0]);

        // Generar curva con Catmull-Rom
        const curve = window.catmullRomSpline(validPoints, 30);
        const length = window.curveLength(curve);

        // Redibujar puntos y encima la curva
        draw();
        window.drawCurve(ctx, curve);

        // Mostrar longitud en input
        document.getElementById("tendon-length").value = length.toFixed(2);
    });

    // === Polling para cargar el frame real cuando esté disponible ===
    const frameUrl = img.getAttribute("data-frame-url");

    function checkFrame() {
        fetch(frameUrl, { cache: "no-store" })
            .then(response => {
                if (response.ok) {
                    img.src = frameUrl + "?t=" + new Date().getTime();
                } else {
                    setTimeout(checkFrame, 1000); // reintenta
                }
            })
            .catch(() => setTimeout(checkFrame, 1000));
    }
    checkFrame();

    // === Polling para cargar CSV de coordenadas ===
        // === Polling para cargar CSV de coordenadas ===
    const csvUrl = document.body.getAttribute("data-csv-url");
    let csvLoaded = false; // bandera para que solo cargue una vez

    function checkCSV() {
        if (csvLoaded) return; // si ya cargamos, no volver a correr

        fetch(csvUrl, { cache: "no-store" })
            .then(response => {
                if (!response.ok) throw new Error("CSV not found");
                return response.text();
            })
            .then(data => {
                const rows = data.trim().split("\n");
                if (rows.length < 2) return;
                const values = rows[1].split(",");

                // ⚠️ Reordenando las columnas
                const distalX = parseFloat(values[1]).toFixed(1);   // segunda columna
                const distalY = parseFloat(values[0]).toFixed(1);   // primera columna
                const proximalX = parseFloat(values[3]).toFixed(1); // cuarta columna
                const proximalY = parseFloat(values[2]).toFixed(1); // tercera columna

                // Actualizar inputs
                const distalInput = document.getElementById("distal");
                const proximalInput = document.getElementById("proximal");
                distalInput.value = `(${distalX}, ${distalY})`;
                proximalInput.value = `(${proximalX}, ${proximalY})`;

                // Actualizar points
                const distalPoint = points.find(p => p.inputId === "distal");
                if (distalPoint) distalPoint.coords = [parseFloat(distalX), parseFloat(distalY)];
                const proximalPoint = points.find(p => p.inputId === "proximal");
                if (proximalPoint) proximalPoint.coords = [parseFloat(proximalX), parseFloat(proximalY)];

                draw();

                // ✅ solo cargar una vez
                csvLoaded = true;
                console.log("CSV cargado, polling detenido");
            })

            .catch(() => {
                // aún no está disponible, reintentar
                setTimeout(checkCSV, 3000);
            });
    }
    checkCSV();

});
