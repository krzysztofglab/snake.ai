'use strict';

// ─── ReplayBuffer ─────────────────────────────────────────────────────────────
// Circular ring-buffer for experience replay.

class ReplayBuffer {
  constructor(cap = 50_000) {
    this._buf  = new Array(cap);
    this._cap  = cap;
    this._ptr  = 0;
    this._size = 0;
  }

  push(exp) {
    this._buf[this._ptr] = exp;
    this._ptr = (this._ptr + 1) % this._cap;
    if (this._size < this._cap) this._size++;
  }

  /** Uniform random sample without replacement (fast approximation). */
  sample(n) {
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = this._buf[Math.floor(Math.random() * this._size)];
    }
    return result;
  }

  get size() { return this._size; }
}


// ─── DQNAgent ─────────────────────────────────────────────────────────────────
// Deep Q-Network with a separate target network (fixed-target DQN).
// Training is async and fire-and-forget to avoid blocking the animation loop.

class DQNAgent {
  constructor({
    stateSize        = STATE_SIZE,
    actionSize       = ACTION_SIZE,
    gamma            = 0.95,          // discount factor
    lr               = 0.001,
    batchSize        = 128,
    bufferCap        = 50_000,
    targetUpdateFreq = 500,           // sync target every N gradient steps
    epsilonStart     = 1.0,
    epsilonMin       = 0.01,
    epsilonDecay     = 0.997,         // multiplied per episode
  } = {}) {
    this.gamma            = gamma;
    this.batchSize        = batchSize;
    this.targetUpdateFreq = targetUpdateFreq;
    this.epsilon          = epsilonStart;
    this.epsilonMin       = epsilonMin;
    this.epsilonDecay     = epsilonDecay;

    this._trainSteps   = 0;
    this._trainPending = false;
    this.lastLoss      = null;

    this.memory = new ReplayBuffer(bufferCap);
    this.model  = this._build(stateSize, actionSize, lr);
    this.target = this._build(stateSize, actionSize, lr);
    this._syncTarget();
  }

  // ── Model ─────────────────────────────────────────────────────────────────

  _build(stateSize, actionSize, lr) {
    const m = tf.sequential();
    m.add(tf.layers.dense({ inputShape: [stateSize], units: 256, activation: 'relu' }));
    m.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    m.add(tf.layers.dense({ units: actionSize, activation: 'linear' }));
    m.compile({ optimizer: tf.train.adam(lr), loss: 'meanSquaredError' });
    return m;
  }

  _syncTarget() {
    // setWeights copies values — no need to clone or dispose
    this.target.setWeights(this.model.getWeights());
  }

  // ── Action selection ──────────────────────────────────────────────────────

  /** ε-greedy action. */
  act(state) {
    if (Math.random() < this.epsilon) {
      return Math.floor(Math.random() * ACTION_SIZE);
    }
    return this._argmax(state);
  }

  /** Fully greedy action (for watching the trained agent). */
  greedyAct(state) {
    return this._argmax(state);
  }

  _argmax(state) {
    return tf.tidy(() =>
      this.model.predict(tf.tensor2d([state])).argMax(1).dataSync()[0]
    );
  }

  // ── Memory & training ─────────────────────────────────────────────────────

  remember(state, action, reward, nextState, done) {
    this.memory.push({ state, action, reward, nextState, done });
  }

  /** Decay ε by one episode step. Called at end of each episode. */
  decayEpsilon() {
    if (this.epsilon > this.epsilonMin) {
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    }
  }

  /**
   * Fire-and-forget async training step.
   * Guards against concurrent calls and silently skips if buffer is too small.
   */
  train() {
    if (this._trainPending || this.memory.size < this.batchSize) return;
    this._trainPending = true;
    this._step()
      .then(loss  => { this.lastLoss = loss; })
      .catch(err  => { console.error('[DQN] train error', err); })
      .finally(() => { this._trainPending = false; });
  }

  async _step() {
    const batch = this.memory.sample(this.batchSize);

    // Synchronous forward passes inside tf.tidy for automatic tensor cleanup
    const { cqs, nqs } = tf.tidy(() => {
      const sT  = tf.tensor2d(batch.map(e => e.state));
      const nsT = tf.tensor2d(batch.map(e => e.nextState));
      return {
        cqs: this.model.predict(sT).arraySync(),
        nqs: this.target.predict(nsT).arraySync(),
      };
    });

    // Compute Bellman targets
    const xs = [];
    const ys = [];
    for (let i = 0; i < batch.length; i++) {
      const exp     = batch[i];
      const maxNext = Math.max(...nqs[i]);
      const target  = exp.done ? exp.reward : exp.reward + this.gamma * maxNext;
      const tq      = cqs[i].slice();   // copy
      tq[exp.action] = target;
      xs.push(exp.state);
      ys.push(tq);
    }

    // Async gradient descent
    const xT  = tf.tensor2d(xs);
    const yT  = tf.tensor2d(ys);
    const h   = await this.model.fit(xT, yT, { epochs: 1, verbose: 0 });
    const loss = h.history.loss[0];
    xT.dispose();
    yT.dispose();

    // Periodically sync target network
    this._trainSteps++;
    if (this._trainSteps % this.targetUpdateFreq === 0) this._syncTarget();

    return loss;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async save(key = 'snake-dqn') {
    await this.model.save(`indexeddb://${key}`);
  }

  async load(key = 'snake-dqn') {
    try {
      const loaded = await tf.loadLayersModel(`indexeddb://${key}`);
      this.model.setWeights(loaded.getWeights());
      this._syncTarget();
      loaded.dispose();
      return true;
    } catch {
      return false;
    }
  }
}
