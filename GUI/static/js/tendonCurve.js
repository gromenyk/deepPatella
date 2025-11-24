// tendonCurve.js
//
// Catmull–Rom spline interpolation and curve utilities for DeepPatella.
//
// This script provides smoothing, curve-length estimation, and drawing helpers
// used to visualize insertion trajectories and tendon paths in the UI.
// It is independent from the stiffness module and focuses purely on geometry.
//
// Responsibilities:
//
//   1. Generate smooth interpolated curves from discrete points using
//      Catmull–Rom splines (for visualizing tendon insertion trajectories)
//   2. Compute polyline length from a list of 2D points (for distance metrics)
//   3. Draw curves onto a canvas context for debugging or visualization
//
// Notes:
//
//   - All functions expect points in the form [[x, y], [x, y], ...]
//   - The spline interpolation works with any number of points ≥ 2
//   - The smoothing factor depends on the number of segments
//   - Returned curves can be used as-is or further processed downstream


/**
 * Catmull-Rom interpolation for a smoother curve
 * @param {Array} points - List of points [[x,y], [x,y], ...]
 * @param {number} segments - Number of subdivisions between each pair
 * @returns {Array} List of interpolated points
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
 * Calculate curve length
 * @param {Array} points - List of points [[x,y], ...]
 * @returns {number} Total length
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
 * Draw curve on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} curve - Points of the curve
 */
window.drawCurve = function(ctx, curve) {
    if (curve.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i][0], curve[i][1]);
    }
    ctx.strokeStyle = "yellow";  
    ctx.lineWidth = 2;
    ctx.stroke();
};
