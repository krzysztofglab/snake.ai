'use strict';

// ─── SnakeEnv ─────────────────────────────────────────────────────────────────
// Wraps Snake + Food into a Gym-style environment for reinforcement learning.
//
//  State  : 11 floats (see _state())
//  Actions: 0 = straight, 1 = turn right, 2 = turn left  (relative)
//  Rewards: +10 food eaten | -10 death | ±0.1 distance shaping | -1 timeout

const STATE_SIZE  = 11;
const ACTION_SIZE = 3;

class SnakeEnv {
  constructor(gridW, gridH) {
    this.gridW      = gridW;
    this.gridH      = gridH;
    this.snake      = new Snake(gridW, gridH);
    this.food       = new Food(gridW, gridH);
    this.score      = 0;
    this._steps     = 0;
    this._maxSteps  = gridW * gridH * 3;   // prevent infinite loops
    this._prevDist  = 0;
  }

  /** Reset to a fresh episode. Returns the initial state vector. */
  reset() {
    this.snake.reset();
    this.food.spawn(this.snake);
    this.score     = 0;
    this._steps    = 0;
    this._prevDist = this._dist();
    return this._state();
  }

  /**
   * Advance one step.
   * @param {0|1|2} action
   * @returns {{ state: number[], reward: number, done: boolean }}
   */
  step(action) {
    const cur = this.snake.direction;
    if      (action === 1) this.snake._dirQueue = [SnakeEnv._right(cur)];
    else if (action === 2) this.snake._dirQueue = [SnakeEnv._left(cur)];
    // action 0 → keep going straight (empty queue keeps current direction)

    this.snake.tick();
    this._steps++;

    let reward = 0;
    let done   = false;

    if (this.snake.hitsWall() || this.snake.hitsSelf()) {
      reward = -10;
      done   = true;
    } else if (this.snake.head.equals(this.food.position)) {
      reward = 10;
      this.score++;
      this.snake.grow();
      this.food.spawn(this.snake);
      this._prevDist = this._dist();
    } else {
      // Small distance-shaping reward to guide exploration
      const d = this._dist();
      reward       = d < this._prevDist ? 0.1 : -0.1;
      this._prevDist = d;

      if (this._steps >= this._maxSteps) {
        done   = true;
        reward -= 1;
      }
    }

    return { state: this._state(), reward, done };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Build the 11-dimensional state vector. */
  _state() {
    const h = this.snake.head;
    const d = this.snake.direction;
    const f = this.food.position;
    const r = SnakeEnv._right(d);
    const l = SnakeEnv._left(d);

    return [
      // Immediate danger (1 cell ahead)
      +this._danger(h, d),   // straight
      +this._danger(h, r),   // right
      +this._danger(h, l),   // left
      // Current heading (one-hot)
      +(d === DIRECTIONS.UP),
      +(d === DIRECTIONS.DOWN),
      +(d === DIRECTIONS.LEFT),
      +(d === DIRECTIONS.RIGHT),
      // Food direction relative to head
      +(f.x < h.x),          // food is left
      +(f.x > h.x),          // food is right
      +(f.y < h.y),          // food is up
      +(f.y > h.y),          // food is down
    ];
  }

  _danger(head, dir) {
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;
    if (nx < 0 || nx >= this.gridW || ny < 0 || ny >= this.gridH) return true;
    return this.snake.body.slice(1).some(s => s.x === nx && s.y === ny);
  }

  _dist() {
    const h = this.snake.head;
    const f = this.food.position;
    return Math.abs(h.x - f.x) + Math.abs(h.y - f.y);
  }

  // ── Static direction helpers ──────────────────────────────────────────────

  static _right(d) {
    if (d === DIRECTIONS.UP)    return DIRECTIONS.RIGHT;
    if (d === DIRECTIONS.RIGHT) return DIRECTIONS.DOWN;
    if (d === DIRECTIONS.DOWN)  return DIRECTIONS.LEFT;
    return DIRECTIONS.UP;
  }

  static _left(d) {
    if (d === DIRECTIONS.UP)    return DIRECTIONS.LEFT;
    if (d === DIRECTIONS.LEFT)  return DIRECTIONS.DOWN;
    if (d === DIRECTIONS.DOWN)  return DIRECTIONS.RIGHT;
    return DIRECTIONS.UP;
  }
}
