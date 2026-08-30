const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const hudEl = document.getElementById("hud");

const BASE_FLOWER_COUNT = 8;
const FLOWERS_ADDED_PER_ROUND = 4;
const POINTS_PER_ROUND = 100;
const GOAL_CLEAR_RADIUS = 48;
const ROUNDS_PER_LEVEL = 3;
const STORY_LEVELS = 10;
const LEVEL_NAMES = [
  "Nursery Comb",
  "Dining Room",
  "Sweet Paths",
  "Busy Hive",
  "Sticky Halls",
  "Thorn Comb",
  "Deep Wax",
  "Pollen Maze",
  "Queen's Labyrinth",
  "Golden Hive",
];
const SQRT3 = Math.sqrt(3);
const HEX_NEIGHBORS = [
  [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
  ],
  [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ],
];

const bee = {
  x: 80,
  y: 250,
  size: 72,
  speed: 5,
  wingAngle: 0,
  facing: 1,
};

const maze = {
  cols: 0,
  rows: 0,
  hexSize: 40,
  originX: 0,
  originY: 0,
  wallT: 12,
  walls: [],
  pathCells: [],
  start: { c: 0, r: 0 },
  end: { c: 0, r: 0 },
  decorations: [],
  theme: "default",
};

const NURSERY_DECOR_TYPES = ["crib", "bottle", "rattle", "sleeper", "cocoon", "pacifier", "mobile", "blocks"];
const DINING_DECOR_TYPES = ["plate", "teacup", "honeypot", "utensils", "cake", "fruit", "bread", "pitcher"];
const NURSERY_CELL_PALETTES = [
  { inner: "#FFF8E1", mid: "#FFE082", outer: "#F9A825" },
  { inner: "#FFF0F6", mid: "#F8BBD0", outer: "#EC407A" },
  { inner: "#E8F5E9", mid: "#C5E1A5", outer: "#7CB342" },
  { inner: "#FFF3E0", mid: "#FFCC80", outer: "#FFA726" },
  { inner: "#F3E5F5", mid: "#CE93D8", outer: "#AB47BC" },
];
const DINING_CELL_PALETTES = [
  { inner: "#FFF8E1", mid: "#FFD54F", outer: "#F9A825" },
  { inner: "#FFECB3", mid: "#FFB74D", outer: "#EF6C00" },
  { inner: "#FFEBEE", mid: "#EF9A9A", outer: "#E53935" },
  { inner: "#EFEBE9", mid: "#D7CCC8", outer: "#8D6E63" },
  { inner: "#FFF3E0", mid: "#FFCC80", outer: "#FF8F00" },
];
const THEME_STYLES = {
  nursery: {
    wallEdge: "#6D4C41",
    wax: ["#E8C4B8", "#D7A89A", "#A1887F"],
    highlight: "rgba(255, 236, 239, 0.5)",
    cellStroke: "rgba(240, 160, 170, 0.45)",
    innerStroke: "rgba(255, 255, 255, 0.42)",
  },
  dining: {
    wallEdge: "#3E2723",
    wax: ["#BCAAA4", "#8D6E63", "#5D4037"],
    highlight: "rgba(255, 224, 178, 0.48)",
    cellStroke: "rgba(183, 110, 40, 0.5)",
    innerStroke: "rgba(255, 236, 179, 0.42)",
  },
  default: {
    wallEdge: "#4E342E",
    wax: ["#A1887F", "#8D6E63", "#5D4037"],
    highlight: "rgba(215, 204, 200, 0.38)",
    cellStroke: "rgba(230, 140, 20, 0.5)",
    innerStroke: "rgba(255, 243, 176, 0.38)",
  },
};

function levelTheme(n = level) {
  if (n === 1) return "nursery";
  if (n === 2) return "dining";
  return "default";
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  bee.size = maze.hexSize * 0.7;
  bee.speed = Math.max(3.6, canvas.width / 320);
  bee.x = Math.max(bee.size * 0.5, Math.min(canvas.width - bee.size * 0.5, bee.x));
  bee.y = Math.max(bee.size * 0.5, Math.min(canvas.height - bee.size * 0.5, bee.y));
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

let gameState = "playing";
let specialFlower = null;
let confetti = [];
let winStartTime = 0;
let level = 1;
let round = 1;
let points = 0;
let lastRoundPoints = 0;
let mazesCleared = 0;
let levelStartPoints = 0;
let advanceAt = 0;
const flowers = [];
const clouds = [
  { x: 0.08, y: 0.1, scale: 1 },
  { x: 0.28, y: 0.07, scale: 0.8 },
  { x: 0.52, y: 0.14, scale: 1.1 },
  { x: 0.72, y: 0.08, scale: 0.7 },
  { x: 0.9, y: 0.16, scale: 0.95 },
];

const flowerColors = ["#e91e63", "#ff9800", "#9c27b0", "#f44336", "#ec407a", "#ab47bc"];
const partyColors = ["#FF5252", "#FF4081", "#E040FB", "#7C4DFF", "#448AFF", "#40C4FF", "#69F0AE", "#FFEA00", "#FFD740"];

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function getTrapMouthHitbox(flower) {
  const s = flower.size;
  const facing = flower.trapFacing || 1;
  const open = flower.openAmount ?? 0;
  return {
    cx: flower.x + facing * s * 0.4,
    cy: flower.y,
    r: s * (0.22 + open * 0.05),
  };
}

function flowerRadius(flower) {
  if (flower.special) {
    return flower.size * 0.55;
  }
  return getTrapMouthHitbox(flower).r;
}

function getYellowWorldCircles() {
  const s = bee.size;
  const f = bee.facing;
  return [
    { x: bee.x + f * (-s * 0.08), y: bee.y + s * 0.04, r: s * 0.22 },
    { x: bee.x + f * (s * 0.3), y: bee.y - s * 0.04, r: s * 0.16 },
  ];
}

function yellowTouchesCircle(worldX, worldY, radius) {
  return getYellowWorldCircles().some((part) =>
    circlesOverlap(part.x, part.y, part.r, worldX, worldY, radius)
  );
}

function flowerTouchesYellowBody(flower) {
  if (flower.special) {
    return yellowTouchesCircle(flower.x, flower.y, flower.size * 0.38);
  }

  if ((flower.openAmount ?? 0) < 0.45) {
    return false;
  }

  const mouth = getTrapMouthHitbox(flower);
  return yellowTouchesCircle(mouth.cx, mouth.cy, mouth.r);
}

function beeSpawnRadius() {
  return bee.size * 0.55;
}

function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  return distance(x1, y1, x2, y2) < r1 + r2;
}

function isTooCloseToBee(flower) {
  const hitX = flower.special ? flower.x : getTrapMouthHitbox(flower).cx;
  const hitY = flower.special ? flower.y : getTrapMouthHitbox(flower).cy;
  return circlesOverlap(hitX, hitY, flowerRadius(flower), bee.x, bee.y, beeSpawnRadius() + 40);
}

function isTooCloseToOther(flower, others, minGap) {
  const ax = flower.special ? flower.x : getTrapMouthHitbox(flower).cx;
  const ay = flower.special ? flower.y : getTrapMouthHitbox(flower).cy;
  return others.some((other) => {
    const bx = other.special ? other.x : getTrapMouthHitbox(other).cx;
    const by = other.special ? other.y : getTrapMouthHitbox(other).cy;
    return circlesOverlap(ax, ay, flowerRadius(flower) + minGap, bx, by, flowerRadius(other));
  });
}

function createFlower(x, y, size, color, special = false) {
  return {
    x,
    y,
    size,
    color,
    special,
    hasFly: !special && Math.random() > 0.7,
    trapFacing: special ? 1 : Math.random() > 0.5 ? 1 : -1,
    openAmount: 0,
    openPhase: Math.random() * Math.PI * 2,
    openSpeed: 0.85 + Math.random() * 0.7,
    openBias: -0.15 + Math.random() * 0.28,
  };
}

function drawTinyFly(fx, fy, s) {
  ctx.fillStyle = "#4E342E";
  ctx.beginPath();
  ctx.ellipse(fx, fy, s * 0.15, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(210, 230, 245, 0.75)";
  ctx.strokeStyle = "rgba(160, 190, 210, 0.55)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(fx - s * 0.08, fy - s * 0.08, s * 0.11, s * 0.06, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(fx - s * 0.08, fy + s * 0.07, s * 0.11, s * 0.06, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function getTrapOpenTarget(flower) {
  return Math.sin(flower.openPhase) > (flower.openBias ?? 0.1) ? 1 : 0;
}

function updateTraps() {
  flowers.forEach((flower) => {
    flower.openPhase += flower.openSpeed * 0.018;
    const target = getTrapOpenTarget(flower);
    flower.openAmount += (target - flower.openAmount) * 0.14;
  });
}

function drawTrapLobePath(size, side, bulge) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    size * 0.18,
    side * size * bulge * 0.35,
    size * 0.55,
    side * size * bulge,
    size * 0.88,
    side * size * 0.06
  );
  ctx.quadraticCurveTo(size * 0.96, 0, size * 0.88, -side * size * 0.03);
  ctx.bezierCurveTo(size * 0.55, -side * size * 0.05, size * 0.16, -side * size * 0.02, 0, 0);
  ctx.closePath();
}

function drawTrapJaw(size, side, open) {
  const angle = side * (0.04 + open * 0.68);

  ctx.save();
  ctx.rotate(angle);

  const outer = ctx.createLinearGradient(0, side * size * 0.18, size * 0.9, 0);
  outer.addColorStop(0, "#1B5E20");
  outer.addColorStop(0.35, "#388E3C");
  outer.addColorStop(0.75, "#66BB6A");
  outer.addColorStop(1, "#A5D6A7");
  ctx.fillStyle = outer;
  ctx.strokeStyle = "#145214";
  ctx.lineWidth = 1.8;
  drawTrapLobePath(size, side, 0.28);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(20, 82, 20, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(size * 0.08, side * size * 0.01);
    ctx.quadraticCurveTo(
      size * (0.3 + i * 0.08),
      side * size * (0.12 + i * 0.02),
      size * (0.7 + i * 0.03),
      side * size * 0.04
    );
    ctx.stroke();
  }

  if (open > 0.08) {
    const inner = ctx.createRadialGradient(size * 0.45, 0, size * 0.04, size * 0.4, 0, size * 0.5);
    inner.addColorStop(0, "#FF8A80");
    inner.addColorStop(0.35, "#E53935");
    inner.addColorStop(0.75, "#B71C1C");
    inner.addColorStop(1, "#7F1214");
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, 0);
    ctx.bezierCurveTo(size * 0.32, side * size * 0.04, size * 0.62, side * size * 0.05, size * 0.84, 0);
    ctx.bezierCurveTo(size * 0.6, -side * size * 0.015, size * 0.3, -side * size * 0.01, size * 0.1, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(90, 12, 16, 0.28)";
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc(
        size * (0.22 + (i % 6) * 0.1),
        side * size * (0.008 + Math.floor(i / 6) * 0.01),
        size * 0.008,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(70, 10, 14, 0.55)";
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const hx = size * (0.28 + i * 0.18);
      ctx.beginPath();
      ctx.moveTo(hx, side * size * 0.006);
      ctx.lineTo(hx + size * 0.01, -side * size * 0.055);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#D7C7A1";
  ctx.strokeStyle = "#BCA77A";
  ctx.lineWidth = 0.8;
  const teeth = 11;
  for (let i = 0; i < teeth; i++) {
    const t = i / (teeth - 1);
    const bx = size * (0.16 + t * 0.7);
    const rimY = side * size * (0.015 + open * 0.01);
    const inward = -side * size * (0.03 + open * 0.07);
    const lean = size * 0.012 * (t - 0.5);

    ctx.beginPath();
    ctx.moveTo(bx - size * 0.012, rimY);
    ctx.lineTo(bx + lean, rimY + inward);
    ctx.lineTo(bx + size * 0.012, rimY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawFlyTrap(flower) {
  const { x, y, size, hasFly, trapFacing = 1 } = flower;
  const t = Date.now() / 1000 + x * 0.02;
  const open = flower.openAmount ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(trapFacing, 1);

  const petiole = ctx.createLinearGradient(-size * 0.05, 0, -size * 0.05, size * 0.78);
  petiole.addColorStop(0, "#81C784");
  petiole.addColorStop(0.45, "#43A047");
  petiole.addColorStop(1, "#2E7D32");
  ctx.fillStyle = petiole;
  ctx.strokeStyle = "#1B5E20";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-size * 0.06, size * 0.02);
  ctx.bezierCurveTo(-size * 0.28, size * 0.18, -size * 0.32, size * 0.5, -size * 0.12, size * 0.78);
  ctx.quadraticCurveTo(size * 0.08, size * 0.84, size * 0.16, size * 0.62);
  ctx.bezierCurveTo(size * 0.12, size * 0.36, size * 0.06, size * 0.16, 0, size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(27, 94, 32, 0.4)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.02, size * 0.06);
  ctx.quadraticCurveTo(-size * 0.08, size * 0.4, 0, size * 0.76);
  ctx.stroke();

  drawTrapJaw(size, 1, open);
  drawTrapJaw(size, -1, open);

  if (hasFly && open < 0.28) {
    drawTinyFly(size * 0.32, 0, size * 0.5);
  } else if (hasFly) {
    drawTinyFly(size * 0.22 + Math.sin(t * 4) * size * 0.025, 0, size * 0.5);
  }

  ctx.restore();
}

function trapTooCloseToGoal(flower) {
  if (!specialFlower || flower.special) {
    return false;
  }

  const mouth = getTrapMouthHitbox(flower);
  return distance(mouth.cx, mouth.cy, specialFlower.x, specialFlower.y) < GOAL_CLEAR_RADIUS + flowerRadius(flower);
}

function canPlaceTrap(flower, placed) {
  return (
    !isTooCloseToBee(flower) &&
    !isTooCloseToOther(flower, placed, 14) &&
    !trapTooCloseToGoal(flower)
  );
}

function levelName(n = level) {
  if (n <= LEVEL_NAMES.length) {
    return LEVEL_NAMES[n - 1];
  }
  return `Endless Honey ${n - LEVEL_NAMES.length}`;
}

function hexNeighbor(c, r, dir) {
  const [dc, dr] = HEX_NEIGHBORS[r & 1][dir];
  return { c: c + dc, r: r + dr };
}

function hexInBounds(c, r, cols, rows) {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

function mazeCellCenter(c, r) {
  const hexW = SQRT3 * maze.hexSize;
  return {
    x: maze.originX + c * hexW + (r % 2) * hexW * 0.5,
    y: maze.originY + r * maze.hexSize * 1.5,
  };
}

function hexCorner(cx, cy, size, i) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: cx + size * Math.cos(angle),
    y: cy + size * Math.sin(angle),
  };
}

function drawHexPath(cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const p = hexCorner(cx, cy, size, i);
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function beeHitsWallsAt(x, y) {
  const r = bee.size * 0.26 + maze.wallT * 0.5;
  return maze.walls.some((wall) => distToSegment(x, y, wall.x1, wall.y1, wall.x2, wall.y2) < r);
}

function mazeDifficulty() {
  return level - 1 + (round - 1) * 0.4;
}

function generateMaze() {
  const topPad = 118;
  const pad = 22;
  const d = mazeDifficulty();
  const availW = canvas.width - pad * 2;
  const availH = canvas.height - topPad - pad;
  const cols = Math.max(6, Math.min(12, 6 + Math.floor((level - 1) / 2) + (round > 2 ? 1 : 0)));
  const rows = Math.max(4, Math.min(8, 5 + Math.floor((level - 1) / 3) + (round > 1 ? 1 : 0)));
  const hexSize = Math.min(availW / (SQRT3 * (cols + 0.5)), availH / ((rows - 1) * 1.5 + 2));
  const wallT = hexSize * (0.36 + Math.min(0.08, d * 0.01));

  const gridW = (cols + 0.5) * SQRT3 * hexSize;
  const gridH = (rows - 1) * 1.5 * hexSize + 2 * hexSize;
  const originX = pad + (availW - gridW) / 2 + (SQRT3 * hexSize) / 2;
  const originY = topPad + (availH - gridH) / 2 + hexSize;

  maze.cols = cols;
  maze.rows = rows;
  maze.hexSize = hexSize;
  maze.originX = originX;
  maze.originY = originY;
  maze.wallT = wallT;

  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cellWalls = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Array(6).fill(true))
  );

  const startC = 0;
  const startR = Math.floor(rows / 2);
  const stack = [[startC, startR]];
  visited[startR][startC] = true;
  let lastDir = 0;

  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const neighbors = [];
    for (let dir = 0; dir < 6; dir++) {
      const n = hexNeighbor(c, r, dir);
      if (hexInBounds(n.c, n.r, cols, rows) && !visited[n.r][n.c]) {
        neighbors.push({ ...n, dir });
      }
    }

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const turns = neighbors.filter((n) => n.dir !== lastDir);
    const pickFrom = d > 0.4 && turns.length ? turns : neighbors;
    const next = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    cellWalls[r][c][next.dir] = false;
    cellWalls[next.r][next.c][(next.dir + 3) % 6] = false;
    visited[next.r][next.c] = true;
    lastDir = next.dir;
    stack.push([next.c, next.r]);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let dir = 0; dir < 6; dir++) {
        const n = hexNeighbor(c, r, dir);
        if (!hexInBounds(n.c, n.r, cols, rows)) {
          cellWalls[r][c][dir] = true;
        }
      }
    }
  }

  const walls = [];
  const pathCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pathCells.push({ c, r });
      const center = mazeCellCenter(c, r);
      for (let dir = 0; dir < 6; dir++) {
        if (!cellWalls[r][c][dir]) continue;
        const n = hexNeighbor(c, r, dir);
        const hasNeighbor = hexInBounds(n.c, n.r, cols, rows);
        if (hasNeighbor && (n.r > r || (n.r === r && n.c > c))) continue;
        const a = hexCorner(center.x, center.y, hexSize, dir);
        const b = hexCorner(center.x, center.y, hexSize, (dir + 1) % 6);
        walls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }

  maze.walls = walls;
  maze.pathCells = pathCells;
  maze.start = { c: startC, r: startR };
  maze.end = { c: cols - 1, r: Math.floor(rows / 2) };
  maze.theme = levelTheme();
  maze.decorations = [];
}

function themedCellPalette(c, r) {
  if (maze.theme === "nursery") {
    return NURSERY_CELL_PALETTES[(c * 3 + r * 5) % NURSERY_CELL_PALETTES.length];
  }
  if (maze.theme === "dining") {
    return DINING_CELL_PALETTES[(c * 3 + r * 5) % DINING_CELL_PALETTES.length];
  }
  return null;
}

function drawThemeCellMarks(x, y, size, c, r) {
  if (maze.theme === "nursery") {
    const marks = ["♥", "★", "✦"];
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#AD1457";
    ctx.font = `${Math.max(9, Math.round(size * 0.22))}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(marks[(c + r) % marks.length], x + size * 0.28, y - size * 0.32);
    ctx.restore();
    return;
  }

  if (maze.theme === "dining") {
    const marks = ["•", "✦", "❀"];
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#BF360C";
    ctx.font = `${Math.max(9, Math.round(size * 0.22))}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(marks[(c + r) % marks.length], x + size * 0.28, y - size * 0.32);
    ctx.restore();
  }
}

function drawMaze() {
  const style = THEME_STYLES[maze.theme] || THEME_STYLES.default;
  maze.pathCells.forEach((cell) => {
    const { x, y } = mazeCellCenter(cell.c, cell.r);
    const size = maze.hexSize * 0.98;
    drawHexPath(x, y, size);
    const honey = ctx.createRadialGradient(x - size * 0.22, y - size * 0.22, size * 0.08, x, y, size);
    const palette = themedCellPalette(cell.c, cell.r);
    if (palette) {
      honey.addColorStop(0, palette.inner);
      honey.addColorStop(0.5, palette.mid);
      honey.addColorStop(1, palette.outer);
    } else {
      honey.addColorStop(0, "#FFF3B0");
      honey.addColorStop(0.45, "#FFCA28");
      honey.addColorStop(1, "#F57F17");
    }
    ctx.fillStyle = honey;
    ctx.fill();
    ctx.strokeStyle = style.cellStroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    drawHexPath(x, y, size * 0.7);
    ctx.strokeStyle = style.innerStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawThemeCellMarks(x, y, size, cell.c, cell.r);
  });

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  maze.walls.forEach((wall) => {
    ctx.strokeStyle = style.wallEdge;
    ctx.lineWidth = maze.wallT + 3;
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();

    const wax = ctx.createLinearGradient(wall.x1, wall.y1, wall.x2, wall.y2);
    wax.addColorStop(0, style.wax[0]);
    wax.addColorStop(0.45, style.wax[1]);
    wax.addColorStop(1, style.wax[2]);
    ctx.strokeStyle = wax;
    ctx.lineWidth = maze.wallT;
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();

    ctx.strokeStyle = style.highlight;
    ctx.lineWidth = Math.max(2, maze.wallT * 0.22);
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();
  });
}

function getExtraFlowers() {
  return (round - 1) * FLOWERS_ADDED_PER_ROUND;
}

function getFlowerCountForRound() {
  const cells = Math.max(1, maze.cols * maze.rows);
  const wanted = BASE_FLOWER_COUNT + (level - 1) * 3 + getExtraFlowers();
  return Math.min(wanted, Math.max(3, cells - 4));
}

function honeycombLabel() {
  return `Honeycomb ${round} of ${ROUNDS_PER_LEVEL}`;
}

function levelTitle(n = level) {
  return `Level ${n} · ${levelName(n)}`;
}

function updateHud() {
  const total = getFlowerCountForRound();
  hudEl.textContent = `${levelTitle()} · ${honeycombLabel()} · ${total} fly traps · Points: ${points}`;
}

function placeFlowers(count) {
  flowers.length = 0;
  const placed = [];
  const goal = mazeCellCenter(maze.end.c, maze.end.r);
  specialFlower = createFlower(
    goal.x,
    goal.y,
    Math.max(24, maze.hexSize * 0.42),
    "#FFD700",
    true
  );

  const blocked = new Set([`${maze.start.c},${maze.start.r}`, `${maze.end.c},${maze.end.r}`]);
  const spots = maze.pathCells
    .filter((cell) => !blocked.has(`${cell.c},${cell.r}`))
    .sort(() => Math.random() - 0.5);

  const trapCount = Math.min(count, spots.length);
  const trapSize = maze.hexSize * 1.32;

  for (let i = 0; i < trapCount; i++) {
    const cell = spots[i];
    const center = mazeCellCenter(cell.c, cell.r);
    const flower = createFlower(
      center.x,
      center.y,
      trapSize,
      flowerColors[Math.floor(Math.random() * flowerColors.length)]
    );

    if (canPlaceTrap(flower, placed)) {
      flowers.push(flower);
      placed.push(flower);
    }
  }
}

function cellKey(c, r) {
  return `${c},${r}`;
}

function nearestCellKey(x, y) {
  let best = null;
  let bestDist = Infinity;
  maze.pathCells.forEach((cell) => {
    const center = mazeCellCenter(cell.c, cell.r);
    const dist = distance(x, y, center.x, center.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = cellKey(cell.c, cell.r);
    }
  });
  return best;
}

function placeLevelDecorations() {
  maze.decorations = [];
  const types = maze.theme === "nursery" ? NURSERY_DECOR_TYPES : maze.theme === "dining" ? DINING_DECOR_TYPES : null;
  if (!types) {
    return;
  }

  const occupied = new Set([cellKey(maze.start.c, maze.start.r), cellKey(maze.end.c, maze.end.r)]);
  flowers.forEach((flower) => occupied.add(nearestCellKey(flower.x, flower.y)));

  const free = maze.pathCells
    .filter((cell) => !occupied.has(cellKey(cell.c, cell.r)))
    .sort(() => Math.random() - 0.5);

  const count = Math.min(free.length, 5 + round);
  for (let i = 0; i < count; i++) {
    maze.decorations.push({
      type: types[i % types.length],
      c: free[i].c,
      r: free[i].r,
      flip: i % 2 === 0 ? 1 : -1,
    });
  }
}

function drawNurseryCrib(s) {
  ctx.fillStyle = "#D7CCC8";
  ctx.strokeStyle = "#8D6E63";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.12, s * 0.42, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#F8BBD0";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.3, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFE082";
  ctx.beginPath();
  ctx.arc(-s * 0.04, s * 0.02, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5D4037";
  ctx.beginPath();
  ctx.arc(-s * 0.07, 0, s * 0.018, 0, Math.PI * 2);
  ctx.arc(-s * 0.01, 0, s * 0.018, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5D4037";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(-s * 0.04, s * 0.04, s * 0.03, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.fillStyle = "#FFCC80";
  ctx.beginPath();
  ctx.ellipse(s * 0.16, s * 0.08, s * 0.08, s * 0.05, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawNurseryBottle(s) {
  ctx.fillStyle = "#FFFDE7";
  ctx.strokeStyle = "#BCAAA4";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-s * 0.1, -s * 0.08, s * 0.2, s * 0.38, s * 0.04);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#FFD54F";
  ctx.beginPath();
  ctx.rect(-s * 0.08, s * 0.04, s * 0.16, s * 0.22);
  ctx.fill();

  ctx.fillStyle = "#FFAB91";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.16, s * 0.07, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFCCBC";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.26, s * 0.035, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNurseryRattle(s) {
  ctx.strokeStyle = "#A1887F";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.18);
  ctx.lineTo(s * 0.02, -s * 0.02);
  ctx.stroke();

  ctx.fillStyle = "#F48FB1";
  ctx.strokeStyle = "#EC407A";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(s * 0.08, -s * 0.1, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#FFF59D";
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5;
    ctx.beginPath();
    ctx.arc(s * 0.08 + Math.cos(a) * s * 0.08, -s * 0.1 + Math.sin(a) * s * 0.08, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNurserySleeper(s) {
  ctx.fillStyle = "#FFF8E1";
  ctx.strokeStyle = "#D7CCC8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.06, s * 0.28, s * 0.16, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#FFE082";
  ctx.beginPath();
  ctx.arc(s * 0.16, -s * 0.02, s * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5D4037";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(s * 0.12, -s * 0.04, s * 0.03, 0.2, Math.PI - 0.2);
  ctx.arc(s * 0.2, -s * 0.04, s * 0.03, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.fillStyle = "#AD1457";
  ctx.font = `bold ${Math.max(10, Math.round(s * 0.28))}px Segoe UI, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("z", s * 0.28, -s * 0.16);
}

function drawNurseryCocoon(s) {
  const silk = ctx.createLinearGradient(0, -s * 0.28, 0, s * 0.28);
  silk.addColorStop(0, "#FFFDE7");
  silk.addColorStop(0.5, "#FFE0B2");
  silk.addColorStop(1, "#FFCC80");
  ctx.fillStyle = silk;
  ctx.strokeStyle = "#FFB74D";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.18, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, i * s * 0.08);
    ctx.quadraticCurveTo(0, i * s * 0.08 + s * 0.04, s * 0.14, i * s * 0.08);
    ctx.stroke();
  }
}

function drawNurseryPacifier(s) {
  ctx.strokeStyle = "#90CAF9";
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, s * 0.08, s * 0.16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#F8BBD0";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.04, s * 0.14, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFE0B2";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.14, s * 0.06, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNurseryMobile(s) {
  ctx.strokeStyle = "#A1887F";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.38);
  ctx.lineTo(0, -s * 0.08);
  ctx.moveTo(-s * 0.18, -s * 0.16);
  ctx.lineTo(s * 0.18, -s * 0.16);
  ctx.stroke();

  const charms = [
    { x: -s * 0.18, color: "#F48FB1", mark: "♥" },
    { x: 0, color: "#FFD54F", mark: "★" },
    { x: s * 0.18, color: "#81C784", mark: "✿" },
  ];
  charms.forEach((charm) => {
    ctx.beginPath();
    ctx.moveTo(charm.x, -s * 0.16);
    ctx.lineTo(charm.x, s * 0.02);
    ctx.stroke();
    ctx.fillStyle = charm.color;
    ctx.font = `${Math.max(10, Math.round(s * 0.28))}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(charm.mark, charm.x, s * 0.08);
  });
}

function drawNurseryBlocks(s) {
  const blocks = [
    { x: -s * 0.14, y: s * 0.08, color: "#F48FB1", letter: "A" },
    { x: s * 0.08, y: s * 0.1, color: "#90CAF9", letter: "B" },
    { x: -s * 0.02, y: -s * 0.1, color: "#FFE082", letter: "C" },
  ];
  blocks.forEach((block) => {
    ctx.fillStyle = block.color;
    ctx.strokeStyle = "rgba(93, 64, 55, 0.35)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(block.x - s * 0.11, block.y - s * 0.11, s * 0.22, s * 0.22, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5D4037";
    ctx.font = `bold ${Math.max(10, Math.round(s * 0.16))}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(block.letter, block.x, block.y + 1);
  });
}

function drawDiningPlate(s) {
  ctx.fillStyle = "#FAFAFA";
  ctx.strokeStyle = "#BDBDBD";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.04, s * 0.34, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.04, s * 0.2, s * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#FFB300";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.03, s * 0.1, s * 0.06, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#EF6C00";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, s * 0.02);
  ctx.quadraticCurveTo(0, -s * 0.02, s * 0.08, s * 0.05);
  ctx.stroke();
}

function drawDiningTeacup(s) {
  ctx.fillStyle = "#FFF8E1";
  ctx.strokeStyle = "#8D6E63";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, -s * 0.04);
  ctx.lineTo(-s * 0.1, s * 0.16);
  ctx.quadraticCurveTo(0, s * 0.22, s * 0.1, s * 0.16);
  ctx.lineTo(s * 0.14, -s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(s * 0.18, s * 0.04, s * 0.07, -1.1, 1.1);
  ctx.stroke();

  ctx.fillStyle = "#FFE082";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.04, s * 0.13, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#D7CCC8";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.2, s * 0.18, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawDiningHoneyPot(s) {
  ctx.fillStyle = "#EF6C00";
  ctx.strokeStyle = "#BF360C";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.18, -s * 0.1, s * 0.24);
  ctx.lineTo(s * 0.1, s * 0.24);
  ctx.quadraticCurveTo(s * 0.2, s * 0.18, s * 0.16, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#FFD54F";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.02, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#8D6E63";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.04, -s * 0.22);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.08, s * 0.02, s * 0.08);
  ctx.stroke();
  ctx.fillStyle = "#FFCA28";
  ctx.beginPath();
  ctx.ellipse(s * 0.02, s * 0.1, s * 0.05, s * 0.03, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawDiningUtensils(s) {
  ctx.strokeStyle = "#90A4AE";
  ctx.fillStyle = "#CFD8DC";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-s * 0.1, s * 0.22);
  ctx.lineTo(-s * 0.1, -s * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.16);
  ctx.lineTo(-s * 0.16, -s * 0.02);
  ctx.moveTo(-s * 0.1, -s * 0.18);
  ctx.lineTo(-s * 0.1, -s * 0.02);
  ctx.moveTo(-s * 0.04, -s * 0.16);
  ctx.lineTo(-s * 0.04, -s * 0.02);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.22);
  ctx.lineTo(s * 0.1, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.1, -s * 0.1, s * 0.07, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawDiningCake(s) {
  ctx.fillStyle = "#FFE0B2";
  ctx.strokeStyle = "#D7A574";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, s * 0.08);
  ctx.lineTo(-s * 0.2, s * 0.2);
  ctx.lineTo(s * 0.2, s * 0.2);
  ctx.lineTo(s * 0.2, s * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#F8BBD0";
  ctx.beginPath();
  ctx.rect(-s * 0.2, -s * 0.02, s * 0.4, s * 0.1);
  ctx.fill();

  ctx.fillStyle = "#FFF8E1";
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.02);
  ctx.lineTo(0, -s * 0.2);
  ctx.lineTo(s * 0.18, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#E53935";
  ctx.beginPath();
  ctx.arc(0, -s * 0.22, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawDiningFruit(s) {
  ctx.fillStyle = "#A1887F";
  ctx.strokeStyle = "#6D4C41";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.16, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#E53935";
  ctx.beginPath();
  ctx.arc(-s * 0.06, s * 0.02, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7CB342";
  ctx.beginPath();
  ctx.ellipse(-s * 0.02, -s * 0.08, s * 0.05, s * 0.02, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8E24AA";
  ctx.beginPath();
  ctx.arc(s * 0.1, s * 0.06, s * 0.055, 0, Math.PI * 2);
  ctx.arc(s * 0.16, s * 0.1, s * 0.045, 0, Math.PI * 2);
  ctx.arc(s * 0.08, s * 0.12, s * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFB300";
  ctx.beginPath();
  ctx.arc(-s * 0.16, s * 0.1, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
}

function drawDiningBread(s) {
  ctx.fillStyle = "#FFCC80";
  ctx.strokeStyle = "#EF6C00";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.04, s * 0.28, s * 0.16, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(191, 54, 12, 0.45)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.04, -s * 0.1, s * 0.02, -s * 0.02);
  ctx.moveTo(s * 0.02, 0);
  ctx.quadraticCurveTo(s * 0.1, -s * 0.08, s * 0.16, 0);
  ctx.stroke();
}

function drawDiningPitcher(s) {
  ctx.fillStyle = "#90CAF9";
  ctx.strokeStyle = "#1565C0";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.16);
  ctx.lineTo(-s * 0.14, s * 0.18);
  ctx.quadraticCurveTo(0, s * 0.26, s * 0.14, s * 0.18);
  ctx.lineTo(s * 0.1, -s * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(s * 0.16, 0, s * 0.08, -0.8, 1.3);
  ctx.stroke();

  ctx.fillStyle = "#FFE082";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.16, s * 0.1, s * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawDecor(decor) {
  const { x, y } = mazeCellCenter(decor.c, decor.r);
  const s = maze.hexSize * 0.72;
  ctx.save();
  ctx.translate(x, y + s * 0.04);
  ctx.scale(decor.flip, 1);
  if (decor.type === "crib") drawNurseryCrib(s);
  else if (decor.type === "bottle") drawNurseryBottle(s);
  else if (decor.type === "rattle") drawNurseryRattle(s);
  else if (decor.type === "sleeper") drawNurserySleeper(s);
  else if (decor.type === "cocoon") drawNurseryCocoon(s);
  else if (decor.type === "pacifier") drawNurseryPacifier(s);
  else if (decor.type === "mobile") drawNurseryMobile(s);
  else if (decor.type === "blocks") drawNurseryBlocks(s);
  else if (decor.type === "plate") drawDiningPlate(s);
  else if (decor.type === "teacup") drawDiningTeacup(s);
  else if (decor.type === "honeypot") drawDiningHoneyPot(s);
  else if (decor.type === "utensils") drawDiningUtensils(s);
  else if (decor.type === "cake") drawDiningCake(s);
  else if (decor.type === "fruit") drawDiningFruit(s);
  else if (decor.type === "bread") drawDiningBread(s);
  else if (decor.type === "pitcher") drawDiningPitcher(s);
  ctx.restore();
}

function setupRound() {
  confetti = [];
  winStartTime = 0;
  advanceAt = 0;
  gameState = "playing";
  generateMaze();
  bee.size = maze.hexSize * 0.7;
  const start = mazeCellCenter(maze.start.c, maze.start.r);
  bee.x = start.x;
  bee.y = start.y;
  bee.facing = 1;
  placeFlowers(getFlowerCountForRound());
  placeLevelDecorations();
  updateHud();
  statusEl.textContent = `${levelTitle()} · ${honeycombLabel()} — wait for closed mouths, then sneak past!`;
}

function resetGame() {
  level = 1;
  round = 1;
  points = 0;
  lastRoundPoints = 0;
  mazesCleared = 0;
  levelStartPoints = 0;
  advanceAt = 0;
  setupRound();
}

function restartCurrentLevel() {
  round = 1;
  points = levelStartPoints;
  lastRoundPoints = 0;
  mazesCleared = (level - 1) * ROUNDS_PER_LEVEL;
  advanceAt = 0;
  setupRound();
}

function startNextRound() {
  round += 1;
  setupRound();
}

function startNextLevel() {
  level += 1;
  round = 1;
  levelStartPoints = points;
  setupRound();
}

document.addEventListener("keydown", (e) => {
  if (e.key in keys) {
    keys[e.key] = true;
    e.preventDefault();
  }

  if ((e.key === "r" || e.key === "R") && gameState === "lost") {
    restartCurrentLevel();
  }

  if ((e.key === " " || e.key === "Enter") && gameState === "roundWon") {
    e.preventDefault();
    startNextRound();
  }

  if ((e.key === " " || e.key === "Enter") && gameState === "levelComplete") {
    e.preventDefault();
    startNextLevel();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key in keys) {
    keys[e.key] = false;
  }
});

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#87ceeb");
  gradient.addColorStop(0.55, "#c8e6c9");
  gradient.addColorStop(1, "#81c784");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCloud(cloud) {
  const x = cloud.x * canvas.width;
  const y = cloud.y * canvas.height;
  const scale = cloud.scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.arc(28, -4, 20, 0, Math.PI * 2);
  ctx.arc(52, 0, 22, 0, Math.PI * 2);
  ctx.arc(24, 8, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPetal(size, angle, length, width, colorA, colorB) {
  ctx.save();
  ctx.rotate(angle);
  const grad = ctx.createLinearGradient(0, 0, length, 0);
  grad.addColorStop(0, colorB);
  grad.addColorStop(0.45, colorA);
  grad.addColorStop(1, "#FFF8E1");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(183, 110, 0, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * 0.25, -width, length * 0.75, -width * 0.7, length, 0);
  ctx.bezierCurveTo(length * 0.75, width * 0.7, length * 0.25, width, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSpecialFlower(flower) {
  const { x, y, size } = flower;
  const pulse = 1 + Math.sin(Date.now() / 280) * 0.05;

  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = "#558B2F";
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, size * 0.15);
  ctx.quadraticCurveTo(-size * 0.08, size * 0.7, 0, size * 1.55);
  ctx.stroke();

  ctx.fillStyle = "#7CB342";
  ctx.strokeStyle = "#33691E";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-size * 0.04, size * 0.7);
  ctx.quadraticCurveTo(-size * 0.42, size * 0.45, -size * 0.48, size * 0.85);
  ctx.quadraticCurveTo(-size * 0.18, size * 0.95, -size * 0.02, size * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.95);
  ctx.quadraticCurveTo(size * 0.4, size * 0.7, size * 0.46, size * 1.05);
  ctx.quadraticCurveTo(size * 0.16, size * 1.15, size * 0.02, size * 1.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.scale(pulse, pulse);

  ctx.fillStyle = "rgba(255, 215, 0, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.35, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 8; i++) {
    drawPetal(size, (Math.PI * 2 * i) / 8 + 0.2, size * 0.95, size * 0.32, "#F9A825", "#F57F17");
  }
  for (let i = 0; i < 8; i++) {
    drawPetal(size, (Math.PI * 2 * i) / 8, size * 0.78, size * 0.24, "#FFD54F", "#FFC107");
  }

  const center = ctx.createRadialGradient(-size * 0.08, -size * 0.08, 1, 0, 0, size * 0.32);
  center.addColorStop(0, "#FFF59D");
  center.addColorStop(0.45, "#FFCA28");
  center.addColorStop(1, "#F57F17");
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#E65100";
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.14, Math.sin(a) * size * 0.14, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#FF8F00";
  ctx.font = `bold ${Math.round(size * 0.55)}px Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", 0, 1);
  ctx.restore();
  ctx.restore();
}

function drawFlower(flower) {
  if (!flower.special) {
    drawFlyTrap(flower);
    return;
  }

  drawSpecialFlower(flower);
}

function drawSideViewWing(s, cx, cy, angle, scale, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(scale, 1);
  const wing = ctx.createLinearGradient(0, -s * 0.2, s * 0.7, s * 0.1);
  wing.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  wing.addColorStop(0.45, `rgba(200, 235, 255, ${alpha * 0.85})`);
  wing.addColorStop(1, `rgba(160, 210, 240, ${alpha * 0.35})`);
  ctx.fillStyle = wing;
  ctx.strokeStyle = "rgba(120, 170, 200, 0.45)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(s * 0.12, -s * 0.42, s * 0.5, -s * 0.52, s * 0.78, -s * 0.12);
  ctx.bezierCurveTo(s * 0.6, s * 0.08, s * 0.22, s * 0.1, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(150, 190, 220, 0.35)";
  ctx.beginPath();
  ctx.moveTo(s * 0.08, -s * 0.02);
  ctx.quadraticCurveTo(s * 0.35, -s * 0.28, s * 0.68, -s * 0.12);
  ctx.moveTo(s * 0.1, 0);
  ctx.quadraticCurveTo(s * 0.32, s * 0.02, s * 0.55, -s * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawSideViewBee(s, wingFlap) {
  const yellow = "#FFD54F";
  const cream = "#FFF6C8";
  const black = "#3E2723";

  ctx.fillStyle = "#5D4037";
  ctx.beginPath();
  ctx.moveTo(-s * 0.52, 0);
  ctx.quadraticCurveTo(-s * 0.64, -s * 0.04, -s * 0.66, 0);
  ctx.quadraticCurveTo(-s * 0.64, s * 0.04, -s * 0.52, 0);
  ctx.fill();

  const belly = ctx.createRadialGradient(-s * 0.02, -s * 0.1, s * 0.04, -s * 0.1, s * 0.04, s * 0.5);
  belly.addColorStop(0, cream);
  belly.addColorStop(0.45, yellow);
  belly.addColorStop(1, "#F4B400");
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(-s * 0.08, s * 0.05, s * 0.42, s * 0.34, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4E342E";
  [-0.3, -0.12, 0.06].forEach((offset) => {
    ctx.beginPath();
    ctx.ellipse(s * offset, s * 0.05, s * 0.042, s * 0.3, -0.08, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255, 249, 220, 0.55)";
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.arc(-s * 0.1 + Math.cos(i * 1.3) * s * 0.22, s * 0.02 + Math.sin(i * 2.1) * s * 0.16, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const head = ctx.createRadialGradient(s * 0.3, -s * 0.12, s * 0.04, s * 0.32, 0, s * 0.32);
  head.addColorStop(0, "#FFF8DC");
  head.addColorStop(0.55, "#FFE082");
  head.addColorStop(1, "#FFCA28");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(s * 0.32, -s * 0.04, s * 0.28, 0, Math.PI * 2);
  ctx.fill();

  drawSideViewWing(s, -s * 0.02, -s * 0.1, -0.9 + wingFlap, 1.05, 0.88);
  drawSideViewWing(s, s * 0.06, -s * 0.16, -1.15 - wingFlap * 0.65, 0.78, 0.55);

  ctx.fillStyle = "rgba(255, 138, 148, 0.9)";
  ctx.beginPath();
  ctx.ellipse(s * 0.18, s * 0.1, s * 0.09, s * 0.065, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(s * 0.4, -s * 0.08, s * 0.16, s * 0.18, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 183, 197, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const pupil = ctx.createRadialGradient(s * 0.43, -s * 0.1, s * 0.02, s * 0.45, -s * 0.06, s * 0.11);
  pupil.addColorStop(0, "#6D4C41");
  pupil.addColorStop(1, "#3E2723");
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.ellipse(s * 0.44, -s * 0.07, s * 0.085, s * 0.11, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(s * 0.49, -s * 0.12, s * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.4, -s * 0.03, s * 0.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5D4037";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.06, s * 0.075, 0.2, Math.PI - 0.45);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.22, -s * 0.26);
  ctx.quadraticCurveTo(s * 0.32, -s * 0.52, s * 0.44, -s * 0.58);
  ctx.moveTo(s * 0.28, -s * 0.24);
  ctx.quadraticCurveTo(s * 0.38, -s * 0.42, s * 0.5, -s * 0.46);
  ctx.stroke();

  ctx.fillStyle = "#FF8A80";
  ctx.beginPath();
  ctx.arc(s * 0.44, -s * 0.58, s * 0.042, 0, Math.PI * 2);
  ctx.arc(s * 0.5, -s * 0.46, s * 0.036, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6D4C41";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, s * 0.28);
  ctx.quadraticCurveTo(-s * 0.06, s * 0.38, 0, s * 0.44);
  ctx.moveTo(s * 0.08, s * 0.3);
  ctx.quadraticCurveTo(s * 0.06, s * 0.4, s * 0.12, s * 0.46);
  ctx.moveTo(s * 0.2, s * 0.28);
  ctx.quadraticCurveTo(s * 0.22, s * 0.38, s * 0.28, s * 0.42);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(s * 0.18, -s * 0.16, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawBee() {
  const { x, y, size, wingAngle, facing } = bee;
  const s = size;
  const isMoving = keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight;
  const bob = isMoving ? Math.sin(wingAngle * 2) * 3 : Math.sin(wingAngle) * 1.2;
  const wingFlap = Math.sin(wingAngle) * (isMoving ? 0.28 : 0.14);

  ctx.save();
  ctx.translate(x, y + bob + s * 0.12);
  ctx.scale(1, 0.26);
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(facing, 1);
  drawSideViewBee(s, wingFlap);

  if (isMoving) {
    ctx.fillStyle = "#FF80AB";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.18);
    ctx.lineTo(-s * 0.49, -s * 0.28);
    ctx.lineTo(-s * 0.43, -s * 0.18);
    ctx.quadraticCurveTo(-s * 0.49, -s * 0.14, -s * 0.55, -s * 0.18);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function checkFlowerCollisions() {
  if (specialFlower && flowerTouchesYellowBody(specialFlower)) {
    return "win";
  }

  for (const flower of flowers) {
    if (flowerTouchesYellowBody(flower)) {
      return "lose";
    }
  }

  return null;
}

function updateBee() {
  if (gameState !== "playing") {
    return;
  }

  const prevX = bee.x;
  const prevY = bee.y;

  if (keys.ArrowUp) bee.y -= bee.speed;
  if (keys.ArrowDown) bee.y += bee.speed;
  if (keys.ArrowLeft) {
    bee.x -= bee.speed;
    bee.facing = -1;
  }
  if (keys.ArrowRight) {
    bee.x += bee.speed;
    bee.facing = 1;
  }

  bee.x = Math.max(bee.size * 0.35, Math.min(canvas.width - bee.size * 0.35, bee.x));
  bee.y = Math.max(bee.size * 0.35, Math.min(canvas.height - bee.size * 0.35, bee.y));

  if (beeHitsWallsAt(bee.x, prevY)) {
    bee.x = prevX;
  }
  if (beeHitsWallsAt(bee.x, bee.y)) {
    bee.y = prevY;
  }

  const collision = checkFlowerCollisions();

  if (collision === "lose") {
    gameState = "lost";
    statusEl.textContent = `You lost! Press R to try ${levelName()} again from honeycomb 1.`;
  } else if (collision === "win") {
    const bonus = getExtraFlowers() * 10;
    lastRoundPoints = POINTS_PER_ROUND + bonus;
    points += lastRoundPoints;
    mazesCleared += 1;
    advanceAt = Date.now() + 1800;

    if (round >= ROUNDS_PER_LEVEL) {
      gameState = "levelComplete";
      startWinParty();
      if (level >= STORY_LEVELS) {
        statusEl.textContent = `Hive complete! You flew through every honeycomb. Next maze soon…`;
      } else {
        statusEl.textContent = `${levelName()} complete! You flew through all 3 honeycombs. Next level soon…`;
      }
    } else {
      gameState = "roundWon";
      statusEl.textContent = `${levelName()} honeycomb ${round} of ${ROUNDS_PER_LEVEL} cleared! +${lastRoundPoints} points.`;
    }
    updateHud();
  } else {
    statusEl.textContent = `Follow the comb! ${levelTitle()} · ${honeycombLabel()}.`;
  }

  if (keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight) {
    bee.wingAngle += 0.5;
  } else {
    bee.wingAngle += 0.15;
  }
}

function drawRoundWinOverlay() {
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#FF8F00";
  ctx.font = "bold 44px Segoe UI, sans-serif";
  ctx.fillText(`${levelName()} · honeycomb ${round} of ${ROUNDS_PER_LEVEL}!`, canvas.width / 2, canvas.height / 2 - 50);

  ctx.fillStyle = "#6A1B9A";
  ctx.font = "28px Segoe UI, sans-serif";
  ctx.fillText(`+${lastRoundPoints} points`, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = "#558b2f";
  ctx.font = "22px Segoe UI, sans-serif";
  ctx.fillText(`Next: ${levelName()} honeycomb ${round + 1} of ${ROUNDS_PER_LEVEL}`, canvas.width / 2, canvas.height / 2 + 40);
  ctx.fillText("Continuing automatically — or press SPACE", canvas.width / 2, canvas.height / 2 + 80);
}

function drawLoseOverlay() {
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#D32F2F";
  ctx.font = "bold 48px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You Lose!", canvas.width / 2, canvas.height / 2 - 10);

  ctx.fillStyle = "#558b2f";
  ctx.font = "22px Segoe UI, sans-serif";
  ctx.fillText("A fly-eating plant got the bee!", canvas.width / 2, canvas.height / 2 + 30);
  ctx.fillText(`You had cleared ${mazesCleared} honeycomb${mazesCleared === 1 ? "" : "s"}`, canvas.width / 2, canvas.height / 2 + 60);
  ctx.fillText(`Press R to retry ${levelName()} from honeycomb 1`, canvas.width / 2, canvas.height / 2 + 90);
}

function startWinParty() {
  winStartTime = Date.now();
  confetti = [];

  for (let i = 0; i < 120; i++) {
    confetti.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 12,
      color: partyColors[Math.floor(Math.random() * partyColors.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.25,
      speedY: 2 + Math.random() * 4,
      speedX: (Math.random() - 0.5) * 3,
      wobble: Math.random() * Math.PI * 2,
    });
  }
}

function updateConfetti() {
  confetti.forEach((piece) => {
    piece.y += piece.speedY;
    piece.x += piece.speedX + Math.sin(piece.wobble) * 0.8;
    piece.wobble += 0.08;
    piece.rotation += piece.spin;

    if (piece.y > canvas.height + 20) {
      piece.y = -20;
      piece.x = Math.random() * canvas.width;
    }
  });
}

function drawConfetti() {
  confetti.forEach((piece) => {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.restore();
  });
}

function drawPartyStars(time) {
  const stars = ["★", "✦", "✧", "🎉", "🎊", "⭐"];
  ctx.textAlign = "center";

  for (let i = 0; i < 14; i++) {
    const x = 60 + (i % 7) * 110;
    const y = 40 + Math.floor(i / 7) * (canvas.height - 80);
    const bounce = Math.sin(time / 180 + i) * 8;
    const scale = 1 + Math.sin(time / 220 + i * 0.7) * 0.2;

    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.scale(scale, scale);
    ctx.font = i % 3 === 0 ? "28px Segoe UI Emoji, sans-serif" : "24px Segoe UI, sans-serif";
    ctx.fillStyle = partyColors[i % partyColors.length];
    ctx.fillText(stars[i % stars.length], 0, 0);
    ctx.restore();
  }
}

function drawWinOverlay() {
  const time = Date.now() - winStartTime;
  const bounce = Math.sin(time / 120) * 6;
  const titleScale = 1 + Math.sin(time / 200) * 0.06;

  const overlay = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  overlay.addColorStop(0, "rgba(255, 107, 129, 0.55)");
  overlay.addColorStop(0.35, "rgba(255, 214, 0, 0.5)");
  overlay.addColorStop(0.7, "rgba(105, 240, 174, 0.5)");
  overlay.addColorStop(1, "rgba(68, 138, 255, 0.55)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawConfetti();
  drawPartyStars(time);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 - 40 + bounce);
  ctx.scale(titleScale, titleScale);

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.roundRect(-280, -70, 560, 210, 24);
  ctx.fill();

  ctx.strokeStyle = "#FF6F00";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.font = "bold 36px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#FF6F00";
  if (level >= STORY_LEVELS) {
    ctx.fillText("👑 HIVE CHAMPION! 👑", 0, 0);
  } else {
    ctx.fillText(`🎉 ${levelName().toUpperCase()}! 🎉`, 0, 0);
  }

  ctx.font = "24px Segoe UI, sans-serif";
  ctx.fillStyle = "#6A1B9A";
  ctx.fillText(`You survived ${getFlowerCountForRound()} fly-eating plants!`, 0, 40);

  ctx.font = "22px Segoe UI, sans-serif";
  ctx.fillStyle = "#E65100";
  ctx.fillText(`Total points: ${points}`, 0, 72);

  ctx.font = "18px Segoe UI, sans-serif";
  ctx.fillStyle = "#558b2f";
  ctx.fillText(`All 3 ${levelName()} honeycombs cleared`, 0, 98);
  if (level >= STORY_LEVELS) {
    ctx.fillText("Next maze soon — or press SPACE", 0, 122);
  } else {
    ctx.fillText(`Next level: ${levelName(level + 1)} — fly through 3 more honeycombs`, 0, 122);
  }
  ctx.restore();
}

function draw() {
  drawSky();
  clouds.forEach((cloud) => drawCloud(cloud));
  drawMaze();
  maze.decorations.forEach(drawDecor);
  flowers.forEach(drawFlower);
  if (specialFlower) {
    drawFlower(specialFlower);
  }
  drawBee();

  if (gameState === "levelComplete") {
    drawWinOverlay();
  } else if (gameState === "roundWon") {
    drawRoundWinOverlay();
  } else if (gameState === "lost") {
    drawLoseOverlay();
  }
}

function maybeAdvance() {
  if (!advanceAt || Date.now() < advanceAt) {
    return;
  }
  advanceAt = 0;
  if (gameState === "roundWon") {
    startNextRound();
  } else if (gameState === "levelComplete") {
    startNextLevel();
  }
}

function gameLoop() {
  updateBee();
  maybeAdvance();
  if (gameState === "playing") {
    updateTraps();
  }
  if (gameState === "levelComplete") {
    updateConfetti();
  }
  draw();
  requestAnimationFrame(gameLoop);
}

resetGame();
gameLoop();
