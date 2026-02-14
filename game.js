/* =========================================================
   HAUNTED HOUSE MAZE GAME (Pure JS)
   - ALWAYS connected maze (perfect maze generator)
   - Candy is FAR from start AND FAR from exit
   - Must collect candy before exit unlocks
   - Exciting “game” sound in maze, romantic sound in house
   - Desktop arrows + Mobile on-screen controller (press & hold)
========================================================= */

(() => {
  // ---------- DOM ----------
  const screenMaze = document.getElementById("screen-maze");
  const screenHouse = document.getElementById("screen-house");
  const canvas = document.getElementById("mazeCanvas");
  const ctx = canvas.getContext("2d");

  const soundBtn = document.getElementById("soundBtn");
  const sparkleBurst = document.getElementById("sparkleBurst");
  const thanksText = document.getElementById("thanksText");
  const envelopeBtn = document.getElementById("envelopeBtn");
  const envHint = document.getElementById("envHint");
  const letterBody = document.getElementById("letterBody");
  const restartBtn = document.getElementById("restartBtn");
  const heartsLayer = document.getElementById("heartsLayer");
  const objectivePill = document.getElementById("objectivePill");
  const exitLabel = document.getElementById("exitLabel");
  const toast = document.getElementById("toast");

  // ---------- TOAST ----------
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  // =========================================================
  //  MAZE GENERATION (Perfect maze => always connected)
  //  We'll generate on an odd grid:
  //   - walls everywhere
  //   - carve passages with DFS backtracker
  // =========================================================
  // Bigger = harder. Keep odd numbers.
  const GEN_COLS = 41; // harder
  const GEN_ROWS = 29; // harder

  let maze = []; // 1 wall, 0 path
  let rows = 0;
  let cols = 0;

  function generatePerfectMaze(w, h) {
    // ensure odd
    if (w % 2 === 0) w += 1;
    if (h % 2 === 0) h += 1;

    const grid = Array.from({ length: h }, () => Array(w).fill(1));

    // carve at odd cells
    function carve(x, y) { grid[y][x] = 0; }
    carve(1, 1);

    const stack = [{ x: 1, y: 1 }];
    const dirs = [
      { dx: 2, dy: 0 },
      { dx: -2, dy: 0 },
      { dx: 0, dy: 2 },
      { dx: 0, dy: -2 }
    ];

    while (stack.length) {
      const cur = stack[stack.length - 1];

      // shuffle directions for randomness
      const shuffled = dirs
        .map(d => ({ d, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(o => o.d);

      let carved = false;

      for (const d of shuffled) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
        if (grid[ny][nx] === 0) continue;

        // carve wall between
        const wx = cur.x + d.dx / 2;
        const wy = cur.y + d.dy / 2;
        carve(wx, wy);
        carve(nx, ny);

        stack.push({ x: nx, y: ny });
        carved = true;
        break;
      }

      if (!carved) stack.pop();
    }

    // thicken some dead ends (harder): add a few extra walls back carefully
    // (still connected, but more “twists” feel by limiting some straights)
    // We keep it safe: only add if it doesn't disconnect (skip expensive checks; keep mild).
    for (let i = 0; i < 140; i++) {
      const x = 1 + Math.floor(Math.random() * (w - 2));
      const y = 1 + Math.floor(Math.random() * (h - 2));
      if (grid[y][x] !== 0) continue;

      // don’t block important corridors too much (only block if many neighbors are open)
      const openN =
        (grid[y - 1][x] === 0) +
        (grid[y + 1][x] === 0) +
        (grid[y][x - 1] === 0) +
        (grid[y][x + 1] === 0);

      // “soft” walling: occasionally reduce big open junctions
      if (openN >= 3 && Math.random() < 0.25) {
        grid[y][x] = 1;
      }
    }

    // ensure borders walls
    for (let x = 0; x < w; x++) {
      grid[0][x] = 1;
      grid[h - 1][x] = 1;
    }
    for (let y = 0; y < h; y++) {
      grid[y][0] = 1;
      grid[y][w - 1] = 1;
    }

    return grid;
  }

  function isWalkable(x, y) {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
    return maze[y][x] === 0;
  }

  function nearestPassage(targetX, targetY) {
    // BFS ring search for nearest walkable
    const q = [{ x: targetX, y: targetY }];
    const seen = new Set([`${targetX},${targetY}`]);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    while (q.length) {
      const c = q.shift();
      if (isWalkable(c.x, c.y)) return { x: c.x, y: c.y };
      for (const d of dirs) {
        const nx = c.x + d.dx, ny = c.y + d.dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        q.push({ x: nx, y: ny });
      }
    }
    return { x: 1, y: 1 };
  }

  // ---------- BFS distance map ----------
  function bfsDistances(from) {
    const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const q = [];
    dist[from.y][from.x] = 0;
    q.push(from);

    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    while (q.length) {
      const c = q.shift();
      for (const d of dirs) {
        const nx = c.x + d.dx, ny = c.y + d.dy;
        if (!isWalkable(nx, ny)) continue;
        if (dist[ny][nx] !== -1) continue;
        dist[ny][nx] = dist[c.y][c.x] + 1;
        q.push({ x: nx, y: ny });
      }
    }
    return dist;
  }

  function getAllPassages() {
    const list = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (maze[y][x] === 0) list.push({ x, y });
      }
    }
    return list;
  }

  // ---------- Place start/candy/exit (FAR logic) ----------
  let startCell = { x: 1, y: 1 };
  let exitCell = { x: 1, y: 1 };
  let candyCell = { x: 1, y: 1 };

  function placeKeyCells() {
    // Start: bottom-left-ish
    startCell = nearestPassage(1, rows - 2);

    // Exit: bottom-right-ish
    exitCell = nearestPassage(cols - 2, rows - 2);

    // Distances
    const dStart = bfsDistances(startCell);
    const dExit = bfsDistances(exitCell);

    const passages = getAllPassages();

    // Candy should be FAR from start AND FAR from exit.
    // Score = min(distStart, distExit) * 10 + (distStart + distExit)
    // This strongly pushes it away from both.
    let best = passages[0];
    let bestScore = -1;

    for (const c of passages) {
      const a = dStart[c.y][c.x];
      const b = dExit[c.y][c.x];
      if (a < 0 || b < 0) continue;

      // avoid trivial spots too near start or exit
      if (a < 40) continue;
      if (b < 40) continue;

      const score = Math.min(a, b) * 10 + (a + b);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    // fallback if maze small (shouldn't happen)
    candyCell = bestScore >= 0 ? { ...best } : nearestPassage(Math.floor(cols * 0.3), Math.floor(rows * 0.3));

    // Ensure exit is far from candy too (for “return far to exit” feel):
    // If candy ended up too close to exit (rare), move exit to a farthest corner-like passage.
    const dCandy = bfsDistances(candyCell);
    if (dCandy[exitCell.y][exitCell.x] < 60) {
      // pick passage far from candy but still near bottom-right-ish
      let bestExit = exitCell;
      let bestED = -1;
      for (const c of passages) {
        const dc = dCandy[c.y][c.x];
        if (dc > bestED) {
          // prefer bottom-right bias without sacrificing distance
          const bias = (c.x / cols) + (c.y / rows);
          const combined = dc + bias * 15;
          if (combined > bestED) {
            bestED = combined;
            bestExit = c;
          }
        }
      }
      exitCell = bestExit;
    }
  }

  // ---------- Monsters decoration ----------
  let monsters = [];
  function placeMonsters() {
    const base = ["👻", "😈", "🕷️", "🧟", "🦇"];
    const passages = getAllPassages();
    monsters = [];
    for (let i = 0; i < 6; i++) {
      const c = passages[Math.floor(Math.random() * passages.length)];
      // avoid key cells
      if ((c.x === startCell.x && c.y === startCell.y) ||
        (c.x === exitCell.x && c.y === exitCell.y) ||
        (c.x === candyCell.x && c.y === candyCell.y)) {
        i--; continue;
      }
      monsters.push({ x: c.x, y: c.y, emoji: base[i % base.length] });
    }
  }

  // ---------- Render sizing ----------
  let cellSize = 18;
  let offsetX = 0;
  let offsetY = 0;

  function fitCanvas() {
    const wrapW = canvas.clientWidth;
    const targetW = Math.min(980, wrapW);
    const targetH = Math.round(targetW * (rows / cols));

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(targetW * dpr);
    canvas.height = Math.floor(targetH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cellSize = Math.floor(Math.min(targetW / cols, targetH / rows));
    const gridW = cellSize * cols;
    const gridH = cellSize * rows;
    offsetX = Math.floor((targetW - gridW) / 2);
    offsetY = Math.floor((targetH - gridH) / 2);

    draw();
  }

  // ---------- Player ----------
  const player = {
    cellX: 1, cellY: 1,
    px: 1, py: 1,
    moving: false,
    hasCandy: false
  };

  let gameFinished = false;

  // ---------- UI states ----------
  function updateExitUI() {
    if (!player.hasCandy) {
      exitLabel.classList.add("locked");
      exitLabel.classList.remove("unlocked");
      objectivePill.textContent = "Find the candy 🍬 (far away) to unlock EXIT";
    } else {
      exitLabel.classList.remove("locked");
      exitLabel.classList.add("unlocked");
      objectivePill.textContent = "EXIT unlocked ✅ Go to Elijah’s House 🏚️";
    }
  }

  // ---------- Drawing ----------
  function drawCellBadge(x, y, text) {
    const px = x * cellSize;
    const py = y * cellSize;

    ctx.save();
    const pad = Math.max(2, Math.floor(cellSize * 0.10));
    const w = cellSize - pad * 2;
    const h = Math.floor(cellSize * 0.58);
    const bx = px + pad;
    const by = py + (cellSize - h) / 2;

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(1, Math.floor(cellSize * 0.06));
    roundRect(ctx, bx, by, w, h, Math.floor(h * 0.35));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.font = `900 ${Math.floor(cellSize * 0.24)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + cellSize / 2, py + cellSize / 2);
    ctx.restore();
  }

  function drawEmojiAtCell(x, y, emoji, scale = 1) {
    const cx = x * cellSize + cellSize / 2;
    const cy = y * cellSize + cellSize / 2;
    ctx.save();
    ctx.font = `${Math.floor(cellSize * 0.75 * scale)}px "Apple Color Emoji","Segoe UI Emoji"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, cx, cy + 1);
    ctx.restore();
  }

  function drawSmallText(x, y, text) {
    const cx = x * cellSize + cellSize / 2;
    const cy = y * cellSize + cellSize / 2;
    ctx.save();
    ctx.font = `800 ${Math.max(10, Math.floor(cellSize * 0.18))}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.9;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function drawExitGlow(x, y) {
    const cx = x * cellSize + cellSize / 2;
    const cy = y * cellSize + cellSize / 2;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = "rgba(255,79,184,0.65)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "rgba(255,79,184,0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.floor(cellSize * 0.95), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayerRibbon(pxCell, pyCell, nearExit) {
    const cx = pxCell * cellSize + cellSize / 2;
    const cy = pyCell * cellSize + cellSize / 2;

    const bounce = player.moving ? 1.06 : 1.0;
    const size = Math.floor(cellSize * 0.82);

    ctx.save();
    const glowAlpha = nearExit ? 0.65 : 0.35;
    ctx.shadowColor = `rgba(255,79,184,${glowAlpha})`;
    ctx.shadowBlur = nearExit ? 30 : 18;

    ctx.font = `${Math.floor(size * bounce)}px "Apple Color Emoji","Segoe UI Emoji"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎀", cx, cy);
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background white
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // walls (black)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (maze[y][x] === 1) {
          ctx.fillStyle = "#000";
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // start/exit badges
    drawCellBadge(startCell.x, startCell.y, "START");
    drawCellBadge(exitCell.x, exitCell.y, "EXIT");

    // candy (far)
    if (!player.hasCandy) drawEmojiAtCell(candyCell.x, candyCell.y, "🍬", 0.95);

    // monsters
    monsters.forEach(m => drawEmojiAtCell(m.x, m.y, m.emoji, 0.9));

    // after candy: show house marker + glow at exit
    if (player.hasCandy) {
      drawExitGlow(exitCell.x, exitCell.y);

      // draw house above exit if possible
      if (isWalkable(exitCell.x, exitCell.y - 1)) {
        drawEmojiAtCell(exitCell.x, exitCell.y - 1, "🏚️", 1.05);
        drawSmallText(exitCell.x, exitCell.y - 0.55, "Elijah’s House");
      } else {
        drawEmojiAtCell(exitCell.x, exitCell.y, "🏚️", 1.05);
        drawSmallText(exitCell.x, exitCell.y + 0.35, "Elijah’s House");
      }
    }

    // player
    const nearExit = player.hasCandy && dist(player.px, player.py, exitCell.x, exitCell.y) < 2.2;
    drawPlayerRibbon(player.px, player.py, nearExit);

    ctx.restore();
  }

  // ---------- Sparkles ----------
  function popSparklesAtCell(x, y) {
    const localW = canvas.clientWidth;
    const localH = canvas.clientHeight;
    const gridW = cellSize * cols;
    const gridH = cellSize * rows;

    const px = offsetX + x * cellSize + cellSize / 2;
    const py = offsetY + y * cellSize + cellSize / 2;

    const sx = (px / (offsetX * 2 + gridW)) * localW;
    const sy = (py / (offsetY * 2 + gridH)) * localH;

    sparkleBurst.classList.add("show");
    for (let i = 0; i < 18; i++) {
      const s = document.createElement("div");
      s.className = "sparkle";
      s.style.left = `calc(${sx}px - 4px)`;
      s.style.top = `calc(${sy}px - 4px)`;
      s.style.setProperty("--dx", (Math.random() * 180 - 90) + "px");
      s.style.setProperty("--dy", (Math.random() * 160 - 80) + "px");
      sparkleBurst.appendChild(s);
      setTimeout(() => s.remove(), 750);
    }
    setTimeout(() => sparkleBurst.classList.remove("show"), 850);
  }

  // =========================================================
  //  SOUND: exciting game sound (maze) + romantic (house)
  //  Pure WebAudio. Unlocks after first user gesture.
  // =========================================================
  let audioCtx = null;
  let soundEnabled = false;
  let audioUnlocked = false;

  let mazeSongTimer = null;
  let mazeTick = 0;
  let mazeNodes = [];

  let houseSongTimer = null;
  let houseTick = 0;
  let houseNodes = [];

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function unlockAudioOnce() {
    if (audioUnlocked) return;
    ensureAudio();
    audioCtx.resume?.();
    audioUnlocked = true;
    if (soundEnabled) startMazeMusic();
  }

  function stopAllAudio() {
    if (mazeSongTimer) { clearInterval(mazeSongTimer); mazeSongTimer = null; }
    if (houseSongTimer) { clearInterval(houseSongTimer); houseSongTimer = null; }

    mazeNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch (_) { } });
    houseNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch (_) { } });
    mazeNodes = [];
    houseNodes = [];
  }

  // short beep
  function blip(freq, dur = 0.08, type = "square", vol = 0.06) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;

    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.linearRampToValueAtTime(0.0, t + dur);

    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);

    mazeNodes.push(o);
  }

  // tiny kick (noise+filter)
  function kick(vol = 0.08) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    const t = audioCtx.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);

    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.12);

    mazeNodes.push(o);
  }

  // EXCITING MAZE MUSIC (8-bit-ish)
  function startMazeMusic() {
    if (!audioCtx || !soundEnabled) return;
    stopAllAudio();
    mazeTick = 0;

    // tempo
    const bpm = 150;
    const stepMs = Math.floor((60_000 / bpm) / 2); // 8th notes

    const scale = [0, 2, 4, 7, 9]; // pentatonic-ish
    const base = 330; // E4-ish

    mazeSongTimer = setInterval(() => {
      // beat
      if (mazeTick % 2 === 0) kick(0.06);

      // melody
      const deg = scale[(mazeTick + (mazeTick >> 2)) % scale.length];
      const freq = base * Math.pow(2, deg / 12);

      // occasional higher note for “exciting”
      const up = (mazeTick % 8 === 6) ? 12 : 0;
      blip(freq * Math.pow(2, up / 12), 0.07, "square", 0.05);

      mazeTick++;
    }, stepMs);
  }

  // ROMANTIC HOUSE MUSIC (soft pad)
  function startHouseMusic() {
    if (!audioCtx || !soundEnabled) return;
    stopAllAudio();
    houseTick = 0;

    const bpm = 86;
    const stepMs = Math.floor((60_000 / bpm)); // quarter notes
    const chords = [
      [261.63, 329.63, 392.00], // C E G
      [293.66, 369.99, 440.00], // D F# A (sweet bright)
      [329.63, 415.30, 493.88], // E G# B
      [293.66, 349.23, 440.00], // D F A
    ];

    function padChord(freqs) {
      const t = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.setValueAtTime(0.0, t);
      master.gain.linearRampToValueAtTime(0.10, t + 0.25);
      master.gain.linearRampToValueAtTime(0.0, t + 1.6);
      master.connect(audioCtx.destination);

      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * (i === 0 ? 1 : 1);
        const g = audioCtx.createGain();
        g.gain.value = 0.7;
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 1.7);
        houseNodes.push(o);
      });
    }

    houseSongTimer = setInterval(() => {
      padChord(chords[houseTick % chords.length]);
      houseTick++;
    }, stepMs * 2);
  }

  function updateSoundBtn() {
    soundBtn.textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";
    soundBtn.setAttribute("aria-pressed", String(soundEnabled));
  }

  soundBtn.addEventListener("click", () => {
    unlockAudioOnce();
    soundEnabled = !soundEnabled;
    updateSoundBtn();
    stopAllAudio();

    if (!soundEnabled || !audioCtx) return;
    if (screenMaze.classList.contains("screen--active")) startMazeMusic();
    if (screenHouse.classList.contains("screen--active")) startHouseMusic();
  });

  // ---------- Movement ----------
  const MOVE_MS = 120;
  let queuedDir = null;

  function dirToDelta(dir) {
    if (dir === "up") return { dx: 0, dy: -1 };
    if (dir === "down") return { dx: 0, dy: 1 };
    if (dir === "left") return { dx: -1, dy: 0 };
    if (dir === "right") return { dx: 1, dy: 0 };
    return null;
  }

  function tryMove(dir) {
    if (gameFinished) return;
    if (player.moving) { queuedDir = dir; return; }

    const d = dirToDelta(dir);
    if (!d) return;

    const nx = player.cellX + d.dx;
    const ny = player.cellY + d.dy;
    if (!isWalkable(nx, ny)) return;

    player.moving = true;
    queuedDir = null;

    const sx = player.cellX, sy = player.cellY;
    const ex = nx, ey = ny;
    const startT = performance.now();

    player.cellX = ex;
    player.cellY = ey;

    const animate = (t) => {
      const p = Math.min(1, (t - startT) / MOVE_MS);
      const e = 1 - Math.pow(1 - p, 3);

      player.px = sx + (ex - sx) * e;
      player.py = sy + (ey - sy) * e;

      draw();

      if (p < 1) {
        requestAnimationFrame(animate);
      } else {
        player.px = ex;
        player.py = ey;
        player.moving = false;

        // candy pickup
        if (!player.hasCandy && player.cellX === candyCell.x && player.cellY === candyCell.y) {
          player.hasCandy = true;
          updateExitUI();
          popSparklesAtCell(candyCell.x, candyCell.y);
          showToast("Candy collected! 🍬 EXIT unlocked ✅");
          // little celebration blips
          if (audioCtx && soundEnabled) { blip(660, 0.06, "square", 0.07); blip(880, 0.06, "square", 0.07); }
        }

        // exit must have candy
        if (player.cellX === exitCell.x && player.cellY === exitCell.y) {
          if (!player.hasCandy) {
            showToast("Find the candy 🍬 first!");
          } else {
            finishMaze();
            return;
          }
        }

        if (queuedDir) {
          const next = queuedDir;
          queuedDir = null;
          tryMove(next);
        }
      }
    };

    requestAnimationFrame(animate);
  }

  // ---------- Finish flow ----------
  function finishMaze() {
    if (gameFinished) return;
    gameFinished = true;

    popSparklesAtCell(exitCell.x, exitCell.y);

    screenMaze.classList.add("fade-out");
    setTimeout(() => {
      screenMaze.classList.remove("screen--active", "fade-out");
      screenHouse.classList.add("screen--active", "fade-in");
      setTimeout(() => screenHouse.classList.remove("fade-in"), 600);

      // switch sound to romantic
      if (audioCtx && soundEnabled) startHouseMusic();

      runHouseSequence();
    }, 520);
  }

  // ---------- House sequence ----------
  const letterText =
    `Happy Valentine’s Day, my love ❤️

Being with you isn’t just about the cute moments or the sweet words, it’s about the future we’re building together. You make me want to dream bigger, work harder, and become better every single day.

I don’t just want memories with you… I want goals with you, plans with you, wins with you, and even the struggles, because everything feels lighter when we face it side by side.

Thank you for choosing me, for believing in us, and for staying committed through everything. I promise to keep choosing you too, not just today, but every day, in every season of life.

You’re not just my Valentine.
You’re my partner, my safe place, and my forever teammate. 💛

I love you always.`;

  function runHouseSequence() {
    startHearts();

    thanksText.classList.remove("show");
    envelopeBtn.classList.remove("show", "open");
    envHint.classList.remove("show");
    letterBody.textContent = letterText;

    setTimeout(() => thanksText.classList.add("show"), randBetween(2000, 3000));
    setTimeout(() => envelopeBtn.classList.add("show"), randBetween(4200, 6000));
    setTimeout(() => envHint.classList.add("show"), randBetween(6500, 9000));
  }

  function randBetween(a, b) { return Math.floor(a + Math.random() * (b - a)); }

  envelopeBtn.addEventListener("click", () => {
    unlockAudioOnce();
    envelopeBtn.classList.toggle("open");
    if (envelopeBtn.classList.contains("open")) envHint.classList.remove("show");
  });

  // ---------- Restart ----------
  restartBtn.addEventListener("click", () => {
    unlockAudioOnce();
    resetGame();
  });

  function resetGame() {
    gameFinished = false;
    player.hasCandy = false;
    queuedDir = null;

    // stop hearts & audio cleanly
    stopHearts?.();

    // close envelope UI state (so it doesn’t overlay)
    envelopeBtn.classList.remove("open");
    envHint.classList.remove("show");
    thanksText.classList.remove("show");

    // Switch screens FIRST (make maze visible)
    screenHouse.classList.remove("screen--active");
    screenMaze.classList.add("screen--active", "fade-in");

    // Remove fade class after animation
    setTimeout(() => screenMaze.classList.remove("fade-in"), 600);

    // IMPORTANT: wait for layout to be visible before fitting canvas + regenerating
    requestAnimationFrame(() => {
      // regenerate maze + reposition candy/exit (hard mode)
      initGame(true);

      // force a proper resize after screen is visible
      fitCanvas();
      draw();

      // back to exciting maze sound
      if (audioCtx && soundEnabled) startMazeMusic();
    });
  }


  // ---------- Input (Mobile controller press/hold) ----------
  document.querySelectorAll(".ctrl-btn").forEach(btn => {
    const dir = btn.getAttribute("data-dir");
    let holdTimer = null;
    let holding = false;

    const startHold = (ev) => {
      ev.preventDefault();
      unlockAudioOnce();
      holding = true;
      tryMove(dir);
      holdTimer = setInterval(() => { if (holding) tryMove(dir); }, 110);
    };

    const endHold = () => {
      holding = false;
      if (holdTimer) clearInterval(holdTimer);
      holdTimer = null;
    };

    btn.addEventListener("pointerdown", startHold, { passive: false });
    btn.addEventListener("pointerup", endHold);
    btn.addEventListener("pointercancel", endHold);
    btn.addEventListener("pointerleave", endHold);
  });

  // ---------- Hearts ----------
  let heartsInterval = null;
  function startHearts() {
    stopHearts();
    heartsInterval = setInterval(spawnHeart, 240);
  }
  function stopHearts() {
    if (heartsInterval) clearInterval(heartsInterval);
    heartsInterval = null;
  }
  function spawnHeart() {
    const h = document.createElement("div");
    h.className = "heart";
    h.textContent = Math.random() < 0.25 ? "💛" : "💗";
    const size = 14 + Math.random() * 18;
    h.style.fontSize = `${size}px`;
    h.style.left = `${Math.random() * 100}%`;
    h.style.bottom = `-20px`;
    h.style.animationDuration = `${5.5 + Math.random() * 4.5}s`;
    heartsLayer.appendChild(h);
    setTimeout(() => h.remove(), 11000);
  }

  // ---------- Init ----------
  function initGame(regenerate = false) {
    if (regenerate || maze.length === 0) {
      maze = generatePerfectMaze(GEN_COLS, GEN_ROWS);
      rows = maze.length;
      cols = maze[0].length;

      placeKeyCells();
      placeMonsters();
    }

    // place player at start
    player.cellX = startCell.x;
    player.cellY = startCell.y;
    player.px = startCell.x;
    player.py = startCell.y;
    player.moving = false;

    updateExitUI();
    fitCanvas();
    draw();
  }

  // letter
  letterBody.textContent = letterText;

  // sound
  updateSoundBtn();

  // resize
  window.addEventListener("resize", fitCanvas);

  // start game
  initGame(false);
})();

// ===============================
// ADVANCED KEYBOARD CONTROLS
// ===============================
const activeKeys = new Set();
let keyInterval = null;

window.addEventListener("keydown", (e) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;

  e.preventDefault();
  activeKeys.add(e.key);

  if (!keyInterval) {
    keyInterval = setInterval(() => {
      if (activeKeys.has("ArrowUp")) tryMove("up");
      if (activeKeys.has("ArrowDown")) tryMove("down");
      if (activeKeys.has("ArrowLeft")) tryMove("left");
      if (activeKeys.has("ArrowRight")) tryMove("right");
    }, 110); // matches mobile hold timing
  }
});

window.addEventListener("keyup", (e) => {
  activeKeys.delete(e.key);

  if (activeKeys.size === 0 && keyInterval) {
    clearInterval(keyInterval);
    keyInterval = null;
  }
});
