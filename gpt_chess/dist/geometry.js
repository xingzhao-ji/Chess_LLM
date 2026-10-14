// Normalized corners of the marble playing surface. Rendering and hit-testing share
// one projective transform so target markers remain registered to the scene.
export const SCENE = { width: 1679, height: 937 };
export const BOARD = { tl: [0.240, 0.271], tr: [0.760, 0.271], br: [0.911, 0.897], bl: [0.089, 0.897] };
export function makeProjection({ tl, tr, br, bl }) {
  const dx1 = tr[0] - br[0], dx2 = bl[0] - br[0], dx3 = tl[0] - tr[0] + br[0] - bl[0];
  const dy1 = tr[1] - br[1], dy2 = bl[1] - br[1], dy3 = tl[1] - tr[1] + br[1] - bl[1];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = tr[0] - tl[0] + g * tr[0], b = bl[0] - tl[0] + h * bl[0], c = tl[0];
  const d = tr[1] - tl[1] + g * tr[1], e = bl[1] - tl[1] + h * bl[1], f = tl[1];
  return {
    project(col, row) {
      const u = col / 8, v = row / 8, z = g * u + h * v + 1;
      return [(a * u + b * v + c) / z, (d * u + e * v + f) / z];
    },
    invert(x, y) {
      const A = a - x * g, B = b - x * h, C = x - c;
      const D = d - y * g, E = e - y * h, F = y - f;
      const denominator = A * E - B * D;
      return [(C * E - B * F) / denominator * 8, (A * F - C * D) / denominator * 8];
    },
  };
}
export const perspective = makeProjection(BOARD);
export const tactical = makeProjection({ tl: [0.05, 0.05], tr: [0.95, 0.05], br: [0.95, 0.95], bl: [0.05, 0.95] });
export function squareAt(col, row, flipped = false) {
  if (col < 0 || col >= 8 || row < 0 || row >= 8) return null;
  return String.fromCharCode(97 + (flipped ? 7 - Math.floor(col) : Math.floor(col))) + (flipped ? Math.floor(row) + 1 : 8 - Math.floor(row));
}
export function coordinates(square, flipped = false) {
  const col = square.charCodeAt(0) - 97, row = 8 - Number(square[1]);
  return flipped ? [7 - col, 7 - row] : [col, row];
}
