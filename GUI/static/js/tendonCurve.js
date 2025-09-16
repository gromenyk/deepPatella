// tendonCurve.js

/**
 * Interpolación Catmull-Rom para suavizar curva
 * @param {Array} points - lista de puntos [[x,y], [x,y], ...]
 * @param {number} segments - número de subdivisiones entre cada par
 * @returns {Array} lista de puntos interpolados
 */
window.catmullRomSpline = function(points, segments = 100) {
    if (points.length < 2) return points;

    const result = [];
    for (let i = -1; i < points.length - 2; i++) {
        const p0 = points[Math.max(i, 0)];
        const p1 = points[i + 1];
        const p2 = points[i + 2];
        const p3 = points[Math.min(i + 3, points.length - 1)];

        for (let t = 0; t <= 1; t += 1 / segments) {
            const tt = t * t;
            const ttt = tt * t;

            const x = 0.5 * (
                (2 * p1[0]) +
                (-p0[0] + p2[0]) * t +
                (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * tt +
                (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * ttt
            );

            const y = 0.5 * (
                (2 * p1[1]) +
                (-p0[1] + p2[1]) * t +
                (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * tt +
                (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * ttt
            );

            result.push([x, y]);
        }
    }
    return result;
};

/**
 * Calcular la longitud de la curva
 * @param {Array} points - lista de puntos [[x,y], ...]
 * @returns {number} longitud total
 */
window.curveLength = function(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        length += Math.sqrt(dx*dx + dy*dy);
    }
    return length;
};

/**
 * Dibujar la curva en el canvas
 * @param {CanvasRenderingContext2D} ctx - contexto del canvas
 * @param {Array} curve - puntos de la curva
 */
window.drawCurve = function(ctx, curve) {
    if (curve.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i][0], curve[i][1]);
    }
    ctx.strokeStyle = "yellow";  // color visible sobre escala de grises
    ctx.lineWidth = 2;
    ctx.stroke();
};
