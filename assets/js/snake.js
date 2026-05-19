'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const DIRECTIONS = Object.freeze({
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
});

const CONFIG = Object.freeze({
  CELL_SIZE:       24,
  CANVAS_WIDTH:    480,
  CANVAS_HEIGHT:   480,
  INITIAL_SPEED:   160,   // ms per tick
  MIN_SPEED:        60,
  SPEED_DECREMENT:   2,   // ms faster per food eaten
  SCORE_PER_FOOD:   10,
  LS_HIGH_SCORE:   'snakeHighScore',
});

// ─── Point ───────────────────────────────────────────────────────────────────

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  clone() {
    return new Point(this.x, this.y);
  }
}

// ─── Snake ───────────────────────────────────────────────────────────────────

class Snake {
  constructor(gridWidth, gridHeight) {
    this.gridWidth  = gridWidth;
    this.gridHeight = gridHeight;
    this.reset();
  }

  reset() {
    const sx = Math.floor(this.gridWidth / 2);
    const sy = Math.floor(this.gridHeight / 2);
    this.body = [
      new Point(sx,     sy),
      new Point(sx - 1, sy),
      new Point(sx - 2, sy),
    ];
    this.direction    = DIRECTIONS.RIGHT;
    this._dirQueue    = [];          // input buffer (max 2 pending inputs)
    this._pendingGrow = false;
  }

  /** Queue a direction change, ignoring 180° reversals. */
  setDirection(dir) {
    // Validate against the last queued direction (or current if queue is empty)
    const ref = this._dirQueue.length > 0
      ? this._dirQueue[this._dirQueue.length - 1]
      : this.direction;
    if (dir.x === -ref.x && dir.y === -ref.y) return;
    if (dir.x === ref.x  && dir.y === ref.y)  return; // ignore duplicate
    if (this._dirQueue.length < 2) this._dirQueue.push(dir);
  }

  /** Advance the snake by one cell. */
  tick() {
    if (this._dirQueue.length > 0) this.direction = this._dirQueue.shift();
    const head = this.body[0];
    this.body.unshift(new Point(head.x + this.direction.x, head.y + this.direction.y));
    if (!this._pendingGrow) {
      this.body.pop();
    }
    this._pendingGrow = false;
  }

  grow() {
    this._pendingGrow = true;
  }

  get head() {
    return this.body[0];
  }

  get length() {
    return this.body.length;
  }

  hitsWall() {
    const { x, y } = this.head;
    return x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight;
  }

  hitsSelf() {
    const head = this.head;
    return this.body.slice(1).some(s => s.equals(head));
  }

  occupies(point) {
    return this.body.some(s => s.equals(point));
  }
}

// ─── Food ────────────────────────────────────────────────────────────────────

class Food {
  constructor(gridWidth, gridHeight) {
    this.gridWidth  = gridWidth;
    this.gridHeight = gridHeight;
    this.position   = null;
  }

  spawn(snake) {
    let pos;
    do {
      pos = new Point(
        Math.floor(Math.random() * this.gridWidth),
        Math.floor(Math.random() * this.gridHeight),
      );
    } while (snake.occupies(pos));
    this.position = pos;
  }
}

// ─── ScoreManager ────────────────────────────────────────────────────────────

class ScoreManager {
  constructor() {
    this.score     = 0;
    this.highScore = parseInt(localStorage.getItem(CONFIG.LS_HIGH_SCORE) || '0', 10);
  }

  reset() {
    this.score = 0;
  }

  add(points) {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(CONFIG.LS_HIGH_SCORE, this.highScore);
    }
  }
}

// ─── InputHandler ────────────────────────────────────────────────────────────

class InputHandler {
  constructor(game) {
    this._game = game;

    this._keyMap = {
      ArrowUp:    DIRECTIONS.UP,
      ArrowDown:  DIRECTIONS.DOWN,
      ArrowLeft:  DIRECTIONS.LEFT,
      ArrowRight: DIRECTIONS.RIGHT,
      w: DIRECTIONS.UP,
      s: DIRECTIONS.DOWN,
      a: DIRECTIONS.LEFT,
      d: DIRECTIONS.RIGHT,
    };

    this._boundKeyDown    = this._onKeyDown.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchEnd   = this._onTouchEnd.bind(this);

    document.addEventListener('keydown',    this._boundKeyDown);
    document.addEventListener('touchstart', this._boundTouchStart, { passive: true });
    document.addEventListener('touchend',   this._boundTouchEnd,   { passive: true });
  }

  destroy() {
    document.removeEventListener('keydown',    this._boundKeyDown);
    document.removeEventListener('touchstart', this._boundTouchStart);
    document.removeEventListener('touchend',   this._boundTouchEnd);
  }

  _onKeyDown(e) {
    if (this._keyMap[e.key]) {
      e.preventDefault();
      this._game.setDirection(this._keyMap[e.key]);
      return;
    }
    if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      this._game.togglePause();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this._game.startOrRestart();
    }
  }

  _onTouchStart(e) {
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
  }

  _onTouchEnd(e) {
    const SWIPE_MIN = 20;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this._game.setDirection(dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
    } else {
      this._game.setDirection(dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
    }
  }

  _initTouch() {} // kept for compatibility
}

// ─── Renderer ────────────────────────────────────────────────────────────────

class Renderer {
  constructor(canvas, cellSize) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.cellSize = cellSize;

    this.palette = {
      bg:          '#0f172a',
      grid:        '#1e293b',
      snakeHead:   '#22c55e',
      snakeBody:   '#16a34a',
      snakeBorder: '#166534',
      food:        '#f97316',
      foodGlow:    'rgba(251, 146, 60, 0.35)',
      foodShine:   'rgba(255, 255, 255, 0.4)',
      eyeWhite:    '#f8fafc',
      overlayBg:   'rgba(2, 6, 23, 0.82)',
      overlayText: '#f8fafc',
      overlaySub:  '#94a3b8',
    };
  }

  clear() {
    const { ctx, canvas, palette } = this;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawGrid() {
    const { ctx, canvas, cellSize, palette } = this;
    ctx.save();
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawSnake(snake) {
    const { ctx, cellSize, palette } = this;
    const pad    = 2;
    const size   = cellSize - pad * 2;

    snake.body.forEach((seg, i) => {
      const isHead = i === 0;
      const x = seg.x * cellSize + pad;
      const y = seg.y * cellSize + pad;

      ctx.save();
      ctx.fillStyle   = isHead ? palette.snakeHead : palette.snakeBody;
      ctx.strokeStyle = palette.snakeBorder;
      ctx.lineWidth   = 1;
      this._roundRect(x, y, size, size, isHead ? 7 : 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (isHead) this._drawEyes(seg, snake.direction);
    });
  }

  _drawEyes(head, dir) {
    const { ctx, cellSize, palette } = this;
    const cx     = head.x * cellSize + cellSize / 2;
    const cy     = head.y * cellSize + cellSize / 2;
    const r      = 2;
    const offset = 4;

    let positions;
    if      (dir === DIRECTIONS.RIGHT) positions = [{ x: cx + 3, y: cy - offset }, { x: cx + 3, y: cy + offset }];
    else if (dir === DIRECTIONS.LEFT)  positions = [{ x: cx - 3, y: cy - offset }, { x: cx - 3, y: cy + offset }];
    else if (dir === DIRECTIONS.UP)    positions = [{ x: cx - offset, y: cy - 3 }, { x: cx + offset, y: cy - 3 }];
    else                               positions = [{ x: cx - offset, y: cy + 3 }, { x: cx + offset, y: cy + 3 }];

    ctx.save();
    ctx.fillStyle = palette.eyeWhite;
    positions.forEach(({ x, y }) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawFood(food, frame) {
    if (!food.position) return;
    const { ctx, cellSize, palette } = this;
    const cx   = food.position.x * cellSize + cellSize / 2;
    const cy   = food.position.y * cellSize + cellSize / 2;
    const base = cellSize / 2 - 3;
    const r    = base + Math.sin(frame * 0.12) * 1.5;

    ctx.save();

    // glow halo
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 6);
    grad.addColorStop(0, palette.foodGlow);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = palette.food;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // shine
    ctx.fillStyle = palette.foodShine;
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawOverlay(title, subtitle) {
    const { ctx, canvas, palette } = this;
    ctx.save();
    ctx.fillStyle = palette.overlayBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = palette.overlayText;
    ctx.font      = 'bold 40px Inter, sans-serif';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 22);

    ctx.fillStyle = palette.overlaySub;
    ctx.font      = '15px Inter, sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 22);

    ctx.restore();
  }

  /** Draw a rounded rectangle path (polyfill-safe). */
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x,     y,     x + r, y);
    ctx.closePath();
  }
}

// ─── Game ────────────────────────────────────────────────────────────────────

class Game {
  /** @param {object} ui — DOM element references */
  constructor(ui) {
    this._ui = ui;

    // Derive grid dimensions from canvas
    const cs = CONFIG.CELL_SIZE;
    this._gridW = Math.floor(CONFIG.CANVAS_WIDTH  / cs);
    this._gridH = Math.floor(CONFIG.CANVAS_HEIGHT / cs);

    // Size canvas to an exact grid multiple
    ui.canvas.width  = this._gridW * cs;
    ui.canvas.height = this._gridH * cs;

    this._snake   = new Snake(this._gridW, this._gridH);
    this._food    = new Food(this._gridW, this._gridH);
    this._score   = new ScoreManager();
    this._render  = new Renderer(ui.canvas, cs);
    this._input   = new InputHandler(this);

    /** @type {'idle'|'playing'|'paused'|'gameover'} */
    this._state   = 'idle';
    this._speed   = CONFIG.INITIAL_SPEED;
    this._lastTick = 0;
    this._frame   = 0;
    this._running  = true;
    this._rafId    = null;

    this._updateUI();
    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  // ── Public API (called by InputHandler & buttons) ────────────────────────

  destroy() {
    this._running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._input.destroy();
  }

  startOrRestart() {
    if (this._state === 'idle' || this._state === 'gameover') this._start();
  }

  togglePause() {
    if (this._state === 'playing') {
      this._state    = 'paused';
      this._lastTick = 0;
    } else if (this._state === 'paused') {
      this._state = 'playing';
    }
    this._updateUI();
  }

  setDirection(dir) {
    if (this._state === 'playing') this._snake.setDirection(dir);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _start() {
    this._snake.reset();
    this._food.spawn(this._snake);
    this._score.reset();
    this._speed    = CONFIG.INITIAL_SPEED;
    this._lastTick = 0;
    this._state    = 'playing';
    this._updateUI();
  }

  _gameOver() {
    this._state = 'gameover';
    this._updateUI();
  }

  _tick(timestamp) {
    if (this._state !== 'playing') return;
    if (!this._lastTick) { this._lastTick = timestamp; return; }
    if (timestamp - this._lastTick < this._speed) return;

    this._lastTick = timestamp;
    this._snake.tick();

    if (this._snake.hitsWall() || this._snake.hitsSelf()) {
      this._gameOver();
      return;
    }

    if (this._snake.head.equals(this._food.position)) {
      this._snake.grow();
      this._score.add(CONFIG.SCORE_PER_FOOD);
      this._food.spawn(this._snake);
      this._speed = Math.max(CONFIG.MIN_SPEED, this._speed - CONFIG.SPEED_DECREMENT);
      this._flashScore();
      this._updateUI();
    }
  }

  _draw() {
    const { _render: r, _snake: s, _food: f, _frame: fr, _state: st } = this;

    r.clear();
    r.drawGrid();

    if (st !== 'idle') {
      r.drawFood(f, fr);
      r.drawSnake(s);
    }

    if (st === 'idle') {
      r.drawOverlay('SNAKE', 'Press Enter or click Start');
    } else if (st === 'paused') {
      r.drawOverlay('PAUSED', 'Press Space / Esc to resume');
    } else if (st === 'gameover') {
      r.drawOverlay('GAME OVER', `Score: ${this._score.score}  •  Press Enter to retry`);
    }
  }

  _loop(timestamp) {
    if (!this._running) return;
    this._frame++;
    this._tick(timestamp);
    this._draw();
    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  // ── UI helpers ───────────────────────────────────────────────────────────

  _updateUI() {
    const { _ui: ui, _score: sc, _snake: sn, _state: st } = this;

    ui.score.textContent      = sc.score;
    ui.highScore.textContent  = sc.highScore;
    ui.snakeLength.textContent = sn.length;

    const level = Math.floor((CONFIG.INITIAL_SPEED - this._speed) / CONFIG.SPEED_DECREMENT) + 1;
    ui.level.textContent = level;

    // Status dot
    ui.statusDot.className = `status-dot ${st === 'playing' ? 'playing' : st === 'paused' ? 'paused' : st === 'gameover' ? 'gameover' : ''}`;

    // Action button label
    const labels = { idle: 'Start', playing: 'Pause', paused: 'Resume', gameover: 'Restart' };
    ui.actionBtn.textContent = labels[st] ?? 'Start';
  }

  _flashScore() {
    const el = this._ui.score;
    el.classList.remove('score-flash');
    void el.offsetWidth; // reflow
    el.classList.add('score-flash');
  }
}

// Bootstrap is in index.html
