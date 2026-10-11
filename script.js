// バルーンポップ！ ゲーム本体
// ・ステージは無制限。制限時間60秒のうちに目標点（ステージ1は200点、そのあと50点ずつ増える）に届いた瞬間にクリア
// ・ふつうの風船10点、金色50点、にじ色は画面の風船をまとめてわる、時計は10秒のばす
// ・5回つづけてわると +50点（コンボボーナス）。爆弾にさわるとライフが1へる（ライフ3、回復なし）
// ・クリアの速さ（本当にかかった時間）と爆弾で星1〜3個。最高得点と最高到達ステージは localStorage に保存（アプリを更新しても消えない）
(() => {
  'use strict';

  // ---------- ルール ----------
  const STAGE_TIME = 60;          // 1ステージの時間（秒）
  const FIRST_TARGET = 200;       // ステージ1の目標点
  const TARGET_STEP = 50;         // ステージごとに増える目標点
  const MAX_LIVES = 3;
  const POINTS = { normal: 10, gold: 50, rainbow: 10, clock: 0 };
  const CLOCK_BONUS = 10;         // 時計の風船でのびる秒数
  const MAX_CLOCKS = 2;           // 1ステージに出る時計の数（のびるのは最大20秒）
  const COMBO_STEP = 5;           // 何回つづけてわるとボーナスか
  const COMBO_BONUS = 50;
  const INTRO_TIME = 1.8;         // 「ステージ○」を出している時間（秒）
  const END_DELAY = 1.0;          // ライフが0になってから、ゲームオーバー画面を出すまで（秒）
  const MAX_BALLOONS = 16;

  const BEST_SCORE_KEY = 'balloonBestScore';
  const BEST_STAGE_KEY = 'balloonBestStage';
  const SOUND_KEY = 'balloonSound';

  const targetOf = (stage) => FIRST_TARGET + TARGET_STEP * (stage - 1);
  // 星：スタートから本当にかかった時間で決める（時計で時間をのばしても、のびた分は得にならない）
  //   ★3 … 30秒以内にクリア＋そのステージで爆弾に1回もさわっていない
  //   ★2 … 40秒以内にクリア
  //   ★1 … 時間内にクリア
  const STAR3_SEC = 30;
  const STAR2_SEC = 40;
  function starsOf(clearSec, bombsHit) {
    if (clearSec <= STAR3_SEC && bombsHit === 0) return 3;
    if (clearSec <= STAR2_SEC) return 2;
    return 1;
  }
  // ステージが進むと、風船が速く・多くなり、爆弾も少しずつ増える
  function stageParams(stage) {
    const s = stage - 1;
    return {
      speed: Math.min(0.40, 0.15 + 0.022 * s),   // 1秒に上がる高さ（画面の高さに対する割合）
      interval: Math.max(0.36, 0.78 - 0.04 * s), // 風船が出る間隔（秒、平均）
      bombs: Math.min(6, 2 + Math.floor(s / 2)), // 20個のうちの爆弾の数
    };
  }

  // ---------- 保存 ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 保存できない環境では気にしない */ } },
  };
  const readInt = (k) => Math.max(0, parseInt(store.get(k), 10) || 0);

  const $ = (id) => document.getElementById(id);

  // ---------- 音（BGM・効果音。Web Audio API で作るので、音のファイルはいらない） ----------
  const Sound = (() => {
    let ac = null, master = null, bgmGain = null, seGain = null, noiseBuf = null;
    let enabled = store.get(SOUND_KEY) !== 'off';
    let bgmTimer = null, nextTime = 0, step = 0;

    function unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain(); master.gain.value = enabled ? 1 : 0; master.connect(ac.destination);
        bgmGain = ac.createGain(); bgmGain.gain.value = 0.2; bgmGain.connect(master);
        seGain = ac.createGain(); seGain.gain.value = 0.55; seGain.connect(master);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    }
    const ready = () => ac && ac.state !== 'closed';
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function tone(freq, start, dur, o = {}) {
      const osc = ac.createOscillator(), g = ac.createGain();
      const vol = o.vol || 0.3;
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + (o.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g); g.connect(o.dest || seGain);
      osc.start(start); osc.stop(start + dur + 0.03);
    }
    function noise(start, dur, vol, freq, dest) {
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf;
      f.type = 'lowpass'; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(f); f.connect(g); g.connect(dest || seGain);
      src.start(start); src.stop(start + dur + 0.03);
    }
    function play(fn) { if (enabled && ready()) { try { fn(ac.currentTime + 0.005); } catch (e) { /* 音が出なくてもゲームは続ける */ } } }

    const se = {
      pop: () => play((t) => { noise(t, 0.09, 0.5, 3200); tone(620, t, 0.12, { type: 'triangle', vol: 0.25, slide: 2 }); }),
      gold: () => play((t) => { [88, 92, 95, 100].forEach((m, i) => tone(midi(m), t + i * 0.06, 0.22, { type: 'square', vol: 0.1 })); noise(t, 0.08, 0.4, 3500); }),
      rainbow: () => play((t) => { [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => tone(midi(m), t + i * 0.045, 0.3, { type: 'triangle', vol: 0.18 })); noise(t, 0.25, 0.5, 2500); }),
      clock: () => play((t) => { tone(1500, t, 0.05, { type: 'square', vol: 0.12 }); tone(1100, t + 0.12, 0.05, { type: 'square', vol: 0.12 }); tone(midi(84), t + 0.24, 0.3, { type: 'triangle', vol: 0.22 }); }),
      bomb: () => play((t) => { noise(t, 0.7, 0.9, 700); tone(160, t, 0.5, { type: 'sawtooth', vol: 0.3, slide: 0.25 }); }),
      combo: () => play((t) => { [79, 84, 88, 91].forEach((m, i) => tone(midi(m), t + i * 0.07, 0.18, { type: 'square', vol: 0.1 })); }),
      miss: () => play((t) => { tone(240, t, 0.08, { type: 'sine', vol: 0.08, slide: 0.7 }); }),
      tick: () => play((t) => { tone(1800, t, 0.04, { type: 'square', vol: 0.07 }); }),
      goal: () => play((t) => { [84, 88, 91, 96].forEach((m, i) => tone(midi(m), t + i * 0.09, 0.35, { type: 'triangle', vol: 0.2 })); }),
      start: () => play((t) => { [72, 79].forEach((m, i) => tone(midi(m), t + i * 0.12, 0.2, { type: 'square', vol: 0.1 })); }),
      clear: () => play((t) => {
        [[72, 0], [76, 0.14], [79, 0.28], [84, 0.42], [79, 0.62], [84, 0.76]].forEach(([m, d]) => tone(midi(m), t + d, d > 0.7 ? 0.7 : 0.18, { type: 'square', vol: 0.12 }));
        [48, 55, 60].forEach((m) => tone(midi(m), t + 0.76, 0.7, { type: 'triangle', vol: 0.15 }));
      }),
      star: (i) => play((t) => { const base = [84, 88, 91][i] || 91; [0, 7, 12].forEach((d, k) => tone(midi(base + d), t + k * 0.05, 0.45, { type: 'triangle', vol: 0.2 })); noise(t, 0.12, 0.25, 6000); }),
      over: () => play((t) => { [76, 72, 67, 60].forEach((m, i) => tone(midi(m), t + i * 0.2, 0.3, { type: 'triangle', vol: 0.2 })); }),
    };

    // BGM：明るい8分音符のくり返し（テンポ 140）
    const STEP = 60 / 140 / 2;
    const MELODY = [72, 76, 79, 76, 81, 79, 76, 0, 77, 81, 84, 81, 79, 0, 76, 0,
                    74, 77, 81, 77, 79, 76, 72, 0, 74, 76, 77, 79, 72, 0, 0, 0];
    const BASS = [48, 48, 48, 48, 53, 53, 53, 53, 50, 50, 55, 55, 48, 48, 55, 48];
    function schedule() {
      if (!ready()) return;
      while (nextTime < ac.currentTime + 0.3) {
        const m = MELODY[step % MELODY.length];
        if (m) tone(midi(m), nextTime, STEP * 0.9, { type: 'square', vol: 0.09, dest: bgmGain });
        if (step % 2 === 0) {
          const b = BASS[(step / 2) % BASS.length];
          tone(midi(b), nextTime, STEP * 1.7, { type: 'triangle', vol: 0.28, dest: bgmGain });
        } else {
          noise(nextTime, 0.03, 0.12, 9000, bgmGain);
        }
        nextTime += STEP;
        step++;
      }
    }
    function startBgm() {
      if (!ready()) return;
      if (bgmTimer) return;
      nextTime = ac.currentTime + 0.08;
      bgmTimer = setInterval(schedule, 60);
      schedule();
    }
    function stopBgm() { clearInterval(bgmTimer); bgmTimer = null; }
    function resetBgm() { step = 0; }

    function setEnabled(v) {
      enabled = v;
      store.set(SOUND_KEY, v ? 'on' : 'off');
      if (ready()) master.gain.setTargetAtTime(v ? 1 : 0, ac.currentTime, 0.02);
    }
    return { unlock, se, startBgm, stopBgm, resetBgm, setEnabled, isEnabled: () => enabled };
  })();

  // ---------- 画面 ----------
  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  const el = {
    hud: $('hud'), stageNum: $('stageNum'), timeNum: $('timeNum'), timeChip: $('timeChip'), lives: $('lives'),
    scoreNum: $('scoreNum'), stageScoreNum: $('stageScoreNum'), targetNum: $('targetNum'), goal: $('goal'), goalFill: $('goalFill'),
    combo: $('combo'), banner: $('banner'), bonus: $('bonus'),
    start: $('start'), pause: $('pause'), pauseMenu: $('pauseMenu'), confirm: $('confirm'), confirmText: $('confirmText'),
    clear: $('clear'), result: $('result'),
  };
  const show = (e) => e.classList.remove('hidden');
  const hide = (e) => e.classList.add('hidden');

  let W = 0, H = 0, DPR = 1, R = 36;
  let sprites = {};

  // 風船の色（金色とまぎれないよう、黄色は使わない）
  const COLORS = [
    ['#ff5a6e', '#c41f3a'], ['#4aa8ff', '#1c63c9'], ['#4fd16a', '#1f9440'],
    ['#ff9a3c', '#d9601a'], ['#ff7ac8', '#cf3d92'], ['#a77bff', '#6a3fd1'],
  ];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const newR = Math.round(Math.max(26, Math.min(50, Math.min(W, H * 0.62) * 0.085)));
    if (newR !== R || !sprites.bomb || sprites.dpr !== DPR) { R = newR; buildSprites(); }
    for (const b of balloons) b.x0 = Math.min(Math.max(b.x0, b.amp + R), Math.max(b.amp + R, W - b.amp - R));
  }

  // ---------- 風船の絵（はじめに1回描いておき、毎フレームはコピーするだけ） ----------
  function balloonPath(c, r) {
    c.beginPath();
    c.moveTo(0, -1.2 * r);
    c.bezierCurveTo(1.36 * r, -1.2 * r, 1.3 * r, 0.45 * r, 0, 1.1 * r);
    c.bezierCurveTo(-1.3 * r, 0.45 * r, -1.36 * r, -1.2 * r, 0, -1.2 * r);
    c.closePath();
  }
  function drawString(c, r) {
    c.strokeStyle = 'rgba(90, 90, 110, .7)';
    c.lineWidth = Math.max(1, r * 0.04);
    c.beginPath();
    c.moveTo(0, 1.22 * r);
    c.bezierCurveTo(0.25 * r, 1.6 * r, -0.25 * r, 1.9 * r, 0.05 * r, 2.35 * r);
    c.stroke();
  }
  function drawKnot(c, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, 1.05 * r);
    c.lineTo(0.13 * r, 1.25 * r);
    c.lineTo(-0.13 * r, 1.25 * r);
    c.closePath();
    c.fill();
  }
  function drawShine(c, r) {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath();
    c.ellipse(-0.4 * r, -0.55 * r, 0.2 * r, 0.36 * r, -0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)';
    c.beginPath();
    c.arc(-0.22 * r, -0.92 * r, 0.08 * r, 0, Math.PI * 2);
    c.fill();
  }
  function drawBody(c, kind, r, colorIndex) {
    if (kind === 'bomb') {
      // 爆弾：黒い玉と導火線
      c.strokeStyle = '#7a5a33'; c.lineWidth = r * 0.09; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0.42 * r, -0.78 * r); c.quadraticCurveTo(0.75 * r, -1.15 * r, 0.55 * r, -1.32 * r); c.stroke();
      c.fillStyle = '#555';
      c.save(); c.translate(0.4 * r, -0.75 * r); c.rotate(0.6); c.fillRect(-0.18 * r, -0.12 * r, 0.36 * r, 0.24 * r); c.restore();
      const g = c.createRadialGradient(-0.3 * r, -0.35 * r, 0.1 * r, 0, 0, r);
      g.addColorStop(0, '#6b6f80'); g.addColorStop(0.5, '#2a2c36'); g.addColorStop(1, '#0d0d12');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 0.92 * r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath(); c.ellipse(-0.35 * r, -0.4 * r, 0.16 * r, 0.26 * r, -0.6, 0, Math.PI * 2); c.fill();
      // ×じるし（あぶない）
      c.strokeStyle = 'rgba(255, 90, 90, .9)'; c.lineWidth = r * 0.13;
      c.beginPath(); c.moveTo(-0.28 * r, -0.08 * r); c.lineTo(0.28 * r, 0.48 * r); c.moveTo(0.28 * r, -0.08 * r); c.lineTo(-0.28 * r, 0.48 * r); c.stroke();
      return;
    }
    drawString(c, r);
    let knot;
    if (kind === 'gold') {
      const g = c.createRadialGradient(-0.35 * r, -0.5 * r, 0.1 * r, 0, 0, 1.3 * r);
      g.addColorStop(0, '#fffbd0'); g.addColorStop(0.35, '#ffd84a'); g.addColorStop(0.8, '#e0a414'); g.addColorStop(1, '#a8740a');
      c.fillStyle = g; knot = '#b8860b';
    } else if (kind === 'rainbow') {
      const g = c.createLinearGradient(-r, -1.2 * r, r, 1.1 * r);
      ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff', '#9b6bff'].forEach((col, i) => g.addColorStop(i / 5, col));
      c.fillStyle = g; knot = '#9b6bff';
    } else if (kind === 'clock') {
      const g = c.createRadialGradient(-0.35 * r, -0.5 * r, 0.1 * r, 0, 0, 1.3 * r);
      g.addColorStop(0, '#e8fbff'); g.addColorStop(0.45, '#6fd6f5'); g.addColorStop(1, '#1f9cc4');
      c.fillStyle = g; knot = '#1f9cc4';
    } else {
      const [light, dark] = COLORS[colorIndex];
      const g = c.createRadialGradient(-0.35 * r, -0.5 * r, 0.1 * r, 0, 0, 1.3 * r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, light); g.addColorStop(1, dark);
      c.fillStyle = g; knot = dark;
    }
    balloonPath(c, r);
    c.fill();
    drawKnot(c, r, knot);
    if (kind === 'clock') {
      // とけいの文字盤
      c.fillStyle = '#fff'; c.strokeStyle = '#1b7fa3'; c.lineWidth = r * 0.07;
      c.beginPath(); c.arc(0, -0.1 * r, 0.55 * r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#1b5f7a'; c.lineCap = 'round';
      for (let i = 0; i < 12; i += 3) {
        const a = (i / 12) * Math.PI * 2;
        c.lineWidth = r * 0.05;
        c.beginPath(); c.moveTo(Math.sin(a) * 0.42 * r, -0.1 * r - Math.cos(a) * 0.42 * r); c.lineTo(Math.sin(a) * 0.5 * r, -0.1 * r - Math.cos(a) * 0.5 * r); c.stroke();
      }
      c.lineWidth = r * 0.08;
      c.beginPath(); c.moveTo(0, -0.1 * r); c.lineTo(0, -0.48 * r); c.moveTo(0, -0.1 * r); c.lineTo(0.28 * r, -0.1 * r); c.stroke();
    }
    drawShine(c, r);
  }
  function makeSprite(kind, colorIndex) {
    const w = 3 * R, h = 4 * R, ax = 1.5 * R, ay = 1.5 * R;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(h * DPR);
    const c = cv.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, ax * DPR, ay * DPR);
    drawBody(c, kind, R, colorIndex);
    return { canvas: cv, w, h, ax, ay };
  }
  function buildSprites() {
    sprites = { dpr: DPR };
    COLORS.forEach((_, i) => { sprites['n' + i] = makeSprite('normal', i); });
    ['gold', 'rainbow', 'clock', 'bomb'].forEach((k) => { sprites[k] = makeSprite(k); });
  }
  // スタート画面の説明の小さな絵
  function drawRuleIcons() {
    document.querySelectorAll('canvas.kindIcon').forEach((cv) => {
      const kind = cv.dataset.kind;
      const size = 44, dpr = Math.min(3, window.devicePixelRatio || 1), r = 13;
      cv.width = size * dpr; cv.height = size * dpr;
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, (kind === 'bomb' ? 25 : 17) * dpr);
      drawBody(c, kind, r, 0);
    });
  }

  // ---------- ゲームの状態 ----------
  // mode: title（スタート画面）／intro（ステージ○の表示中）／play／paused／ending（ライフ0の爆発中）／clear（ステージクリア画面）／over（ゲームオーバー画面）
  const state = {
    mode: 'title', prevMode: null,
    stage: 1, total: 0, stageScore: 0, lives: MAX_LIVES, time: STAGE_TIME,
    combo: 0, bombsHit: 0, elapsed: 0, clearSec: 0, stars: 0, introLeft: 0, endTimer: 0, overReason: '',
    spawnTimer: 0, decoTimer: 0, bag: [], lastTick: 0, shake: 0, spawned: {},
    bestScore: readInt(BEST_SCORE_KEY), bestStage: readInt(BEST_STAGE_KEY),
    bestScoreAtStart: 0, bestStageAtStart: 0,
  };
  let balloons = [];
  let particles = [];
  let texts = [];
  let nextId = 1;

  // 20個ずつの袋から順に出す（種類の割合が毎回ほぼ同じになり、同じ種類が続きすぎない）
  function refillBag() {
    const p = stageParams(state.stage);
    const bag = ['gold', 'gold', 'rainbow'];
    bag.push((state.spawned.clock || 0) + state.bag.filter((k) => k === 'clock').length < MAX_CLOCKS ? 'clock' : 'normal');
    for (let i = 0; i < p.bombs; i++) bag.push('bomb');
    while (bag.length < 20) bag.push('normal');
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    state.bag = bag;
  }
  const SPEED_OF = { normal: 1, gold: 1.35, rainbow: 1.1, clock: 1.15, bomb: 0.95 };
  const SCALE_OF = { normal: 1, gold: 0.9, rainbow: 1, clock: 1, bomb: 0.95 };

  function spawn(kind, opts = {}) {
    const p = stageParams(state.stage);
    const scale = SCALE_OF[kind];
    const r = R * scale;
    const amp = r * (0.4 + Math.random() * 0.8);
    const minX = amp + r * 1.2, maxX = Math.max(minX, W - amp - r * 1.2);
    let x0 = opts.x != null ? opts.x : minX + Math.random() * (maxX - minX);
    if (opts.x == null) {
      // すぐ前の風船と重なりにくい場所をえらぶ
      for (let tries = 0; tries < 4; tries++) {
        if (!balloons.some((b) => !b.dead && b.y > H - 2.5 * R && Math.abs(b.x0 - x0) < 2.4 * R)) break;
        x0 = minX + Math.random() * (maxX - minX);
      }
    }
    const b = {
      id: nextId++, kind, color: Math.floor(Math.random() * COLORS.length), scale, r,
      x0, x: x0, y: opts.y != null ? opts.y : H + 1.6 * r,
      amp, freq: 0.35 + Math.random() * 0.35, phase: Math.random() * Math.PI * 2, age: 0, tilt: 0,
      speed: opts.still ? 0 : H * p.speed * SPEED_OF[kind] * (0.88 + Math.random() * 0.24),
      deco: !!opts.deco, dead: false,
    };
    if (!b.deco) state.spawned[kind] = (state.spawned[kind] || 0) + 1;
    balloons.push(b);
    return b;
  }
  function moveBalloons(dt) {
    for (const b of balloons) {
      b.age += dt;
      b.y -= b.speed * dt;
      const a = b.phase + b.age * b.freq * Math.PI * 2;
      b.x = b.x0 + b.amp * Math.sin(a);
      b.tilt = -Math.cos(a) * 0.12;
      if (b.y < -2.6 * b.r) b.dead = true;   // 上まで飛んでいった（減点なし）
    }
    balloons = balloons.filter((b) => !b.dead);
  }

  // ---------- 得点 ----------
  function addScore(n) {
    state.stageScore += n;
    state.total += n;
    // 目標点に届いた瞬間にステージクリア（タイマーと風船はそこで止まる）
    if (state.mode === 'play' && state.stageScore >= targetOf(state.stage)) clearStage();
  }
  function saveBest() {
    if (state.total > state.bestScore) { state.bestScore = state.total; store.set(BEST_SCORE_KEY, state.bestScore); }
    if (state.stage > state.bestStage) { state.bestStage = state.stage; store.set(BEST_STAGE_KEY, state.bestStage); }
  }

  // ---------- タップ ----------
  function hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const b of balloons) {
      if (b.dead || b.deco) continue;
      let d;
      if (b.kind === 'bomb') {
        const dx = x - b.x, dy = y - b.y;
        d = (dx * dx + dy * dy) / (b.r * b.r);         // 爆弾はまるい形のとおり
      } else {
        const dx = (x - b.x) / (b.r * 1.15), dy = (y - (b.y - 0.05 * b.r)) / (b.r * 1.3);
        d = dx * dx + dy * dy;                          // 風船は少し大きめに当たる
      }
      if (d <= 1 && d < bestD) { best = b; bestD = d; }
    }
    return best;
  }
  function tapAt(x, y) {
    if (state.mode !== 'play') return;
    const b = hitTest(x, y);
    if (!b) {
      if (state.combo > 0) { state.combo = 0; Sound.se.miss(); }
      ring(x, y, '#ffffff', 0.6);
      return;
    }
    if (b.kind === 'bomb') return hitBomb(b);

    // にじ色：画面にある、ばくだん以外の風船をまとめてわる
    const popped = [b];
    if (b.kind === 'rainbow') {
      for (const o of balloons) {
        if (o !== b && !o.dead && !o.deco && o.kind !== 'bomb' && o.y < H + o.r && o.y > -o.r) popped.push(o);
      }
    }
    let gained = 0;
    popped.forEach((p, i) => {
      p.dead = true;
      burst(p, i * 0.04);
      const pts = POINTS[p.kind];
      gained += pts;
      if (p.kind === 'clock') {
        state.time += CLOCK_BONUS;
        floatText(p.x, p.y, '+' + CLOCK_BONUS + '秒', '#1b8fc0', 1.1);
      } else {
        floatText(p.x, p.y, '+' + pts, p.kind === 'gold' ? '#d48a00' : '#ff4f7a', p.kind === 'gold' ? 1.25 : 1);
      }
    });
    state.combo++;
    if (state.combo % COMBO_STEP === 0) {
      gained += COMBO_BONUS;
      showBonus(state.combo + 'コンボ！ +' + COMBO_BONUS);
      Sound.se.combo();
    }
    addScore(gained);
    if (b.kind === 'rainbow') Sound.se.rainbow();
    else if (b.kind === 'gold') Sound.se.gold();
    else if (b.kind === 'clock') Sound.se.clock();
    else Sound.se.pop();
    balloons = balloons.filter((o) => !o.dead);
  }
  function hitBomb(b) {
    b.dead = true;
    balloons = balloons.filter((o) => !o.dead);
    explosion(b);
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    state.bombsHit++;
    state.shake = 0.45;
    Sound.se.bomb();
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) navigator.vibrate(120); } catch (e) { /* 対応していない時は何もしない */ }
    floatText(b.x, b.y, 'ライフ-1', '#e0303a', 1.15);
    if (state.lives <= 0) {
      state.mode = 'ending';
      state.endTimer = END_DELAY;
      state.overReason = 'ばくだんに3回さわってしまった';
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    tapAt(e.clientX - rect.left, e.clientY - rect.top);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- 演出 ----------
  function burst(b, delay = 0) {
    const col = b.kind === 'gold' ? '#ffd23f' : b.kind === 'clock' ? '#6fd6f5' : b.kind === 'rainbow' ? null : COLORS[b.color][0];
    const rainbow = ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff', '#9b6bff'];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const sp = R * (2.5 + Math.random() * 3);
      particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.55 + Math.random() * 0.2, t: -delay,
        color: col || rainbow[i % rainbow.length], size: R * (0.12 + Math.random() * 0.1), spin: Math.random() * 6 });
    }
    ring(b.x, b.y, col || '#ffffff', 1, delay);
    if (b.kind === 'gold' || b.kind === 'rainbow') {
      for (let i = 0; i < 6; i++) particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * R * 5, vy: (Math.random() - 0.8) * R * 5,
        life: 0.8, t: -delay, color: '#fffbe0', size: R * 0.16, star: true, spin: 0 });
    }
  }
  function explosion(b) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = R * (2 + Math.random() * 5);
      particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, t: 0,
        color: i % 3 === 0 ? '#3a3a44' : i % 3 === 1 ? '#ff8a1f' : '#ffd23f', size: R * (0.14 + Math.random() * 0.14), spin: 3 });
    }
    ring(b.x, b.y, '#ff8a1f', 2.2);
    particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.35, t: 0, flash: true, size: R * 2.2 });
  }
  // ステージクリアの紙ふぶき（画面の上から、いろいろな色がひらひら落ちる）
  function confetti() {
    const cols = ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff', '#9b6bff', '#ffffff'];
    const n = Math.min(90, Math.round(W / 8));
    for (let i = 0; i < n; i++) {
      particles.push({ x: Math.random() * W, y: -R * (0.5 + Math.random() * 3), vx: (Math.random() - 0.5) * R * 2, vy: H * (0.28 + Math.random() * 0.2), fall: true,
        life: 2.6 + Math.random() * 1.2, t: -Math.random() * 0.5, color: cols[i % cols.length], size: R * (0.1 + Math.random() * 0.08), spin: 4 + Math.random() * 8 });
    }
  }
  function ring(x, y, color, size, delay = 0) { particles.push({ x, y, vx: 0, vy: 0, life: 0.35, t: -delay, ring: true, color, size: R * size }); }
  function floatText(x, y, text, color, size) { texts.push({ x, y, text, color, size, t: 0, life: 0.9 }); }
  function updateEffects(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.t < 0) continue;
      if (p.fall) { p.x += (p.vx + Math.sin(p.t * 3 + p.spin) * R * 1.5) * dt; p.y += p.vy * dt; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + R * 6 * dt;
    }
    particles = particles.filter((p) => p.t < p.life);
    for (const t of texts) { t.t += dt; t.y -= R * 1.5 * dt; }
    texts = texts.filter((t) => t.t < t.life);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  }
  let bannerTimer = null;
  function banner(text, kind = '') {
    el.banner.textContent = text;
    el.banner.className = 'banner';
    void el.banner.offsetWidth;          // アニメーションを最初から動かすため
    el.banner.className = 'banner show ' + kind;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.banner.className = 'banner'; }, kind === 'intro' ? INTRO_TIME * 1000 : 1300);
  }
  let bonusTimer = null;
  function showBonus(text) {
    el.bonus.textContent = text;
    el.bonus.className = 'bonus';
    void el.bonus.offsetWidth;
    el.bonus.className = 'bonus show';
    clearTimeout(bonusTimer);
    bonusTimer = setTimeout(() => { el.bonus.className = 'bonus'; }, 1100);
  }

  // ---------- 描く ----------
  const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Meiryo", sans-serif';
  function star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = i % 2 === 0 ? r : r * 0.35;
      c.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr);
    }
    c.closePath(); c.fill();
  }
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.shake > 0 && state.mode !== 'paused') {
      const s = R * 0.25 * (state.shake / 0.45);
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    for (const b of balloons) {
      const spr = b.kind === 'normal' ? sprites['n' + b.color] : sprites[b.kind];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.tilt);
      ctx.scale(b.scale, b.scale);
      if (b.deco) ctx.globalAlpha = 0.75;
      ctx.drawImage(spr.canvas, -spr.ax, -spr.ay, spr.w, spr.h);
      if (b.kind === 'gold' || b.kind === 'rainbow') {
        ctx.fillStyle = '#fffbe0';
        const tw = (Math.sin(now * 6 + b.id) + 1) / 2;
        star(ctx, 0.75 * R, -0.95 * R, R * (0.12 + 0.12 * tw));
        star(ctx, -0.8 * R, 0.3 * R, R * (0.2 - 0.1 * tw));
      } else if (b.kind === 'bomb') {
        const fl = 0.7 + Math.random() * 0.5;
        ctx.fillStyle = '#ffd23f';
        star(ctx, 0.55 * R, -1.34 * R, R * 0.26 * fl);
        ctx.fillStyle = '#ff6a1f';
        star(ctx, 0.55 * R, -1.34 * R, R * 0.13 * fl);
      }
      ctx.restore();
    }
    for (const p of particles) {
      if (p.t < 0) continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, k);
      if (p.flash) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1.2 - k * 0.4));
        g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.5, 'rgba(255,160,40,.8)'); g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, R * 0.1 * k);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + (1 - k) * 0.9), 0, Math.PI * 2); ctx.stroke();
      } else if (p.star) {
        ctx.fillStyle = p.color; star(ctx, p.x, p.y, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * p.spin);
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      const size = Math.round(R * 0.62 * t.size * (k < 0.15 ? 0.7 + k * 2 : 1));
      ctx.font = '900 ' + size + 'px ' + FONT;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- プレイ中の表示 ----------
  const hudCache = {};
  function setText(key, node, value) { if (hudCache[key] !== value) { hudCache[key] = value; node.textContent = value; } }
  function updateHud() {
    const target = targetOf(state.stage);
    setText('stage', el.stageNum, String(state.stage));
    const sec = Math.max(0, Math.ceil(state.time));
    setText('time', el.timeNum, String(sec));
    el.timeChip.classList.toggle('hurry', state.mode === 'play' && sec <= 10);
    setText('score', el.scoreNum, String(state.total));
    setText('stageScore', el.stageScoreNum, String(state.stageScore));
    setText('target', el.targetNum, String(target));
    const ratio = Math.min(1, state.stageScore / target);
    if (hudCache.ratio !== ratio) { hudCache.ratio = ratio; el.goalFill.style.width = (ratio * 100).toFixed(1) + '%'; }
    el.goal.classList.toggle('done', state.stageScore >= target);
    if (hudCache.lives !== state.lives) {
      hudCache.lives = state.lives;
      el.lives.querySelectorAll('.heart').forEach((h, i) => h.classList.toggle('lost', i >= state.lives));
      el.lives.setAttribute('aria-label', 'ライフ ' + state.lives);
    }
    setText('combo', el.combo, state.combo >= 2 ? state.combo + 'コンボ' : '');
  }

  // ---------- ゲームの流れ ----------
  function startGame() {
    Sound.unlock();
    state.stage = 1;
    state.total = 0;
    state.lives = MAX_LIVES;
    state.bestScoreAtStart = state.bestScore;
    state.bestStageAtStart = state.bestStage;
    [el.start, el.result, el.clear, el.pause].forEach(hide);
    show(el.hud);
    Sound.resetBgm();
    beginStage();
  }
  function beginStage() {
    state.stageScore = 0;
    state.time = STAGE_TIME;
    state.combo = 0;
    state.bombsHit = 0;
    state.elapsed = 0;
    state.spawnTimer = 0.3;
    state.spawned = {};
    state.lastTick = 0;
    balloons = [];
    state.bag = [];
    refillBag();
    starTimers.forEach(clearTimeout);
    starTimers = [];
    hide(el.clear);
    saveBest();                       // ここまで来た＝このステージに到達
    state.mode = 'intro';
    state.introLeft = INTRO_TIME;
    banner('ステージ ' + state.stage + '\n目標 ' + targetOf(state.stage) + '点', 'intro');
    Sound.se.start();
    Sound.startBgm();
    updateHud();
  }
  // 時間切れ（目標点に届いたら、その瞬間に clearStage になるので、ここに来るのは届かなかった時だけ）
  function endStage() {
    state.time = 0;
    updateHud();
    state.overReason = '目標の ' + targetOf(state.stage) + '点 に、とどかなかった';
    gameOver();
  }
  // 目標点に届いた瞬間のステージクリア
  let starTimers = [];
  function clearStage() {
    state.mode = 'clear';
    state.clearSec = state.elapsed;
    state.stars = starsOf(state.clearSec, state.bombsHit);
    saveBest();
    Sound.stopBgm();
    Sound.se.clear();
    confetti();
    el.banner.className = 'banner';
    $('clearStage').textContent = state.stage;
    $('clearTime').textContent = formatSec(state.clearSec);
    $('clearStageScore').textContent = state.stageScore;
    $('clearTarget').textContent = targetOf(state.stage);
    $('clearTotal').textContent = state.total;
    $('clearBombs').textContent = state.bombsHit;
    // 星を1個ずつ光らせる（とれた星だけ、光る音つき）
    starTimers.forEach(clearTimeout);
    starTimers = [];
    document.querySelectorAll('#stars .star').forEach((s, i) => {
      s.className = 'star';
      if (i < state.stars) {
        starTimers.push(setTimeout(() => { s.className = 'star on'; Sound.se.star(i); }, STAR_FIRST_MS + i * STAR_STEP_MS));
      }
    });
    $('stars').setAttribute('aria-label', '星 ' + state.stars + '個');
    $('stars').dataset.count = state.stars;
    updateHud();
    show(el.clear);
  }
  const STAR_FIRST_MS = 600;   // クリア画面が出てから1個目の星が光るまで
  const STAR_STEP_MS = 450;    // 星と星のあいだ
  const formatSec = (sec) => (Math.floor(sec * 10) / 10).toFixed(1);
  function gameOver() {
    state.mode = 'over';
    saveBest();
    Sound.stopBgm();
    Sound.se.over();
    hide(el.hud);
    $('overReason').textContent = state.overReason;
    $('overStage').textContent = state.stage;
    $('overScore').textContent = state.total;
    $('recScore').textContent = state.bestScore;
    $('recStage').textContent = state.bestStage;
    $('newScore').classList.toggle('hidden', !(state.total > state.bestScoreAtStart && state.total > 0));
    $('newStage').classList.toggle('hidden', !(state.stage > state.bestStageAtStart));
    show(el.result);
    document.dispatchEvent(new Event('balloon:result'));
  }
  function goTitle() {
    starTimers.forEach(clearTimeout);
    saveBest();
    state.mode = 'title';
    Sound.stopBgm();
    balloons = [];
    [el.hud, el.result, el.clear, el.pause].forEach(hide);
    el.banner.className = 'banner';
    $('bestScore').textContent = state.bestScore;
    $('bestStage').textContent = state.bestStage;
    show(el.start);
    document.dispatchEvent(new Event('balloon:title'));
  }

  // ---------- 一時停止 ----------
  let confirmAction = null;
  function pauseGame() {
    if (state.mode !== 'play' && state.mode !== 'intro') return;
    state.prevMode = state.mode;
    state.mode = 'paused';
    Sound.stopBgm();
    saveBest();
    show(el.pauseMenu); hide(el.confirm);
    show(el.pause);
    el.banner.classList.add('frozen');
  }
  function resumeGame() {
    if (state.mode !== 'paused') return;
    Sound.unlock();
    state.mode = state.prevMode || 'play';
    hide(el.pause);
    el.banner.classList.remove('frozen');
    Sound.startBgm();
  }
  function askConfirm(text, action) {
    el.confirmText.textContent = text;
    confirmAction = action;
    hide(el.pauseMenu); show(el.confirm);
  }

  // ---------- ボタン ----------
  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);
  $('titleBtn').addEventListener('click', goTitle);
  $('nextBtn').addEventListener('click', () => {
    if (state.mode !== 'clear') return;
    Sound.unlock();
    state.stage++;
    beginStage();
  });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', () => askConfirm('さいしょからやり直しますか？', () => { saveBest(); startGame(); }));
  $('quitBtn').addEventListener('click', () => askConfirm('タイトルにもどりますか？', goTitle));
  $('noBtn').addEventListener('click', () => { hide(el.confirm); show(el.pauseMenu); });
  $('yesBtn').addEventListener('click', () => { const a = confirmAction; confirmAction = null; if (a) a(); });
  function refreshSoundButtons() {
    document.querySelectorAll('.soundToggle').forEach((b) => {
      b.textContent = Sound.isEnabled() ? '音：オン' : '音：オフ';
      b.classList.toggle('off', !Sound.isEnabled());
    });
  }
  document.querySelectorAll('.soundToggle').forEach((b) => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.setEnabled(!Sound.isEnabled());
    refreshSoundButtons();
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (state.mode === 'paused') resumeGame(); else pauseGame();
    }
  });
  // アプリを閉じた・別の画面に切り替えた時は、自動で一時停止
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); saveBest(); } });
  window.addEventListener('pagehide', saveBest);

  // ---------- 毎フレームの動き ----------
  function update(dt) {
    if (state.mode === 'paused') return;
    updateEffects(dt);
    if (state.mode !== 'clear') moveBalloons(dt);   // クリアしたら、風船と爆弾はその場で止まる
    if (state.mode === 'intro') {
      state.introLeft -= dt;
      if (state.introLeft <= 0) { state.mode = 'play'; banner('スタート！', 'go'); }
    } else if (state.mode === 'play') {
      state.time -= dt;
      state.elapsed += dt;
      const sec = Math.ceil(state.time);
      if (sec <= 5 && sec >= 1 && sec !== state.lastTick) { state.lastTick = sec; Sound.se.tick(); }
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const p = stageParams(state.stage);
        state.spawnTimer = p.interval * (0.7 + Math.random() * 0.6);
        if (balloons.length < MAX_BALLOONS) {
          if (!state.bag.length) refillBag();
          spawn(state.bag.pop());
        }
      }
      if (state.time <= 0) endStage();
    } else if (state.mode === 'ending') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) gameOver();
    } else if (state.mode === 'title' || state.mode === 'over') {
      // スタート画面のうしろで、かざりの風船がのんびり飛ぶ
      state.decoTimer -= dt;
      if (state.decoTimer <= 0) {
        state.decoTimer = 1.1 + Math.random() * 0.8;
        if (balloons.length < 8) spawn(Math.random() < 0.15 ? 'gold' : 'normal', { deco: true });
      }
    }
    if (state.mode !== 'title' && state.mode !== 'over') updateHud();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw(now / 1000);
    requestAnimationFrame(frame);
  }

  // ---------- はじめ ----------
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  drawRuleIcons();
  refreshSoundButtons();
  $('bestScore').textContent = state.bestScore;
  $('bestStage').textContent = state.bestStage;
  requestAnimationFrame(frame);

  window.BalloonGame = {
    // pwa.js が使う：ゲームの途中（一時停止中・ステージクリア画面も含む）は、新しいバージョンに切り替えない
    isPlaying: () => ['intro', 'play', 'paused', 'ending', 'clear'].includes(state.mode),
    // 自動テスト用（tools/test.ps1）。遊び方には関係しない
    test: {
      state: () => ({ mode: state.mode, stage: state.stage, total: state.total, stageScore: state.stageScore, lives: state.lives,
        time: state.time, elapsed: state.elapsed, clearSec: state.clearSec, stars: state.stars, combo: state.combo, bombsHit: state.bombsHit, target: targetOf(state.stage),
        bestScore: state.bestScore, bestStage: state.bestStage, spawned: { ...state.spawned }, R, W, H }),
      balloons: () => balloons.filter((b) => !b.dead && !b.deco).map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, r: b.r })),
      spawn: (kind, x, y, moving) => { const b = spawn(kind, { x, y, still: !moving }); if (!moving) b.amp = 0; return b.id; },
      clear: () => { balloons = []; },
      setTime: (sec) => { state.time = sec; },
      setElapsed: (sec) => { state.elapsed = sec; },
      setStageScore: (n) => { state.stageScore = n; },
      addScore: (n) => addScore(n),
      stars: starsOf,
      params: stageParams,
    },
  };
})();
