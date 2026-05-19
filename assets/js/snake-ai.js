'use strict';

// ─── AIController ─────────────────────────────────────────────────────────────
// Manages the training loop and canvas rendering for the AI agent.
//
// Modes:
//   'training' — runs STEPS_PER_FRAME env steps per rAF tick (fast, visualised)
//   'watching' — runs one env step every _watchSpeed ms (slow, greedy policy)

const STEPS_PER_FRAME = 80;

class AIController {
  /**
   * @param {object} ui
   * @param {HTMLCanvasElement} ui.canvas
   * @param {HTMLElement} ui.episode
   * @param {HTMLElement} ui.bestScore
   * @param {HTMLElement} ui.avgScore
   * @param {HTMLElement} ui.epsilon
   * @param {HTMLElement} ui.loss
   * @param {HTMLElement} ui.memory
   * @param {HTMLElement} [ui.statusDot]
   * @param {HTMLElement} [ui.statusText]
   */
  constructor(ui) {
    this._ui     = ui;
    this._canvas = ui.canvas;

    const cs    = CONFIG.CELL_SIZE;
    const gridW = Math.floor(CONFIG.CANVAS_WIDTH  / cs);
    const gridH = Math.floor(CONFIG.CANVAS_HEIGHT / cs);

    this._canvas.width  = gridW * cs;
    this._canvas.height = gridH * cs;

    this._renderer = new Renderer(this._canvas, cs);
    this._env      = new SnakeEnv(gridW, gridH);
    this._agent    = new DQNAgent();

    /** @type {'training'|'watching'} */
    this._mode    = 'training';
    this._running = false;
    this._rafId   = null;
    this._frame   = 0;

    // Stats
    this._episode  = 0;
    this._scores   = [];      // last 100 episode scores
    this._maxScore = 0;

    // Watch-mode tick control
    this._watchSpeed    = 100;  // ms per step
    this._lastWatchTick = 0;

    // Current state
    this._curState = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async start() {
    if (this._running) return;
    this._running = true;

    // Attempt to restore a previously saved model
    const loaded = await this._agent.load();
    if (loaded) {
      console.log('[AI] Restored model from IndexedDB — resuming with ε =', this._agent.epsilon.toFixed(3));
      // Resume with low exploration so we can see what was learned
      if (this._agent.epsilon > 0.1) this._agent.epsilon = 0.1;
    }

    this._curState = this._env.reset();
    this._rafId    = requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Switch between 'training' and 'watching'. */
  setMode(mode) {
    this._mode          = mode;
    this._lastWatchTick = 0;
  }

  setWatchSpeed(ms) {
    this._watchSpeed = ms;
  }

  async save() {
    await this._agent.save();
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  _loop(timestamp) {
    if (!this._running) return;
    this._frame++;

    if (this._mode === 'training') {
      this._trainFrame();
    } else {
      this._watchFrame(timestamp);
    }

    this._render();
    this._updateUI();
    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  // ── Training mode ─────────────────────────────────────────────────────────

  _trainFrame() {
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const action                    = this._agent.act(this._curState);
      const { state: next, reward, done } = this._env.step(action);

      this._agent.remember(this._curState, action, reward, next, done);
      this._curState = next;

      if (done) {
        this._onEpisodeEnd();
        this._curState = this._env.reset();
      }
    }

    // Trigger one async training step per animation frame
    this._agent.train();
  }

  // ── Watch mode ────────────────────────────────────────────────────────────

  _watchFrame(timestamp) {
    if (!this._lastWatchTick) this._lastWatchTick = timestamp;
    if (timestamp - this._lastWatchTick < this._watchSpeed) return;
    this._lastWatchTick = timestamp;

    const action                    = this._agent.greedyAct(this._curState);
    const { state: next, done }     = this._env.step(action);
    this._curState = next;

    if (done) {
      this._onEpisodeEnd();
      this._curState      = this._env.reset();
      this._lastWatchTick = 0;
    }
  }

  // ── Episode bookkeeping ───────────────────────────────────────────────────

  _onEpisodeEnd() {
    const score = this._env.score;
    this._episode++;
    this._scores.push(score);
    if (this._scores.length > 100) this._scores.shift();

    if (score > this._maxScore) {
      this._maxScore = score;
      // Auto-save on new best score during training
      if (this._mode === 'training') {
        this._agent.save().catch(console.warn);
      }
    }

    this._agent.decayEpsilon();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  _render() {
    const { _renderer: r, _env: env, _frame: f } = this;
    r.clear();
    r.drawGrid();
    r.drawFood(env.food, f);
    r.drawSnake(env.snake);
    this._drawHUD();
  }

  _drawHUD() {
    const ctx  = this._canvas.getContext('2d');
    const mode = this._mode === 'training' ? 'TRAINING' : 'WATCHING';
    const eps  = this._agent.epsilon.toFixed(3);
    const sc   = this._env.score;
    const ep   = this._episode;

    ctx.save();
    ctx.fillStyle    = 'rgba(2, 6, 23, 0.72)';
    ctx.fillRect(0, 0, this._canvas.width, 28);
    ctx.fillStyle    = '#94a3b8';
    ctx.font         = 'bold 11px Inter, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${mode}  •  ep ${ep}  •  score ${sc}  •  ε ${eps}`, 9, 14);
    ctx.restore();
  }

  // ── UI update ─────────────────────────────────────────────────────────────

  _updateUI() {
    const { _ui: u, _agent: a, _scores: s } = this;
    const avg = s.length
      ? (s.reduce((acc, v) => acc + v, 0) / s.length).toFixed(1)
      : '—';

    u.episode.textContent   = this._episode;
    u.bestScore.textContent = this._maxScore;
    u.avgScore.textContent  = avg;
    u.epsilon.textContent   = a.epsilon.toFixed(4);
    u.loss.textContent      = a.lastLoss !== null ? a.lastLoss.toFixed(5) : '—';
    u.memory.textContent    = a.memory.size.toLocaleString();

    if (u.statusDot) {
      u.statusDot.className = `status-dot ${this._mode === 'training' ? 'playing' : 'paused'}`;
    }
    if (u.statusText) {
      u.statusText.textContent = this._mode === 'training' ? 'Training' : 'Watching';
    }
  }
}
