// baseline.js

window.addEventListener("load", () => {
    const img = document.getElementById("tendon-frame");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    // Ajusta canvas al tamaño de la imagen en pantalla
    function resizeCanvas() {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
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

    // Puntos iniciales (predichos, no eliminables)
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
            return Math.sqrt(dx * dx + dy * dy) < 10;
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
        if (point && !point.fixed) {
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
});
