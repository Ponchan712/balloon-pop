// バルーンポップ！ ゲーム本体
// ・ステージは無制限。制限時間60秒のうちに目標点（ステージ1は200点、そのあと50点ずつ増える）に届いた瞬間にクリア
// ・ふつうの風船10点、金色50点、にじ色は画面の風船をまとめてわる、時計は10秒のばす
// ・5回つづけてわると +50点（コンボボーナス）。爆弾（黒い風船）にさわるとライフが1へる（ライフ3、回復なし）
// ・爆弾以外の風船を画面の上へにがすと、ライフが1へる（爆弾はにがしてもへらない）
// ・ステージが進むと、とくべつな風船が出てくる（ver4〜）
//     ステージ2〜 ハート（ライフ+1、満タンなら10点）／3〜 スロー（5秒間 風船が半分の速さ）／4〜 ×2（10秒間 ふつう・金色の得点2倍）
//     5〜 ボーナスラッシュ（1ステージ1回、8秒間 風船がたくさん・爆弾なし・にがしてもOK）／6〜 フリーズ（3秒間 風船が止まる）
//     7〜 ？（50点・+5秒・スロー・フリーズのどれか）。スローとフリーズは、あとからとった方が優先
// ・5ステージごと（5・10・15…）のクリアは「SPECIAL CLEAR!」（花火・紙ふぶき・金色の星・ファンファーレ）
// ・クリアの速さ（本当にかかった時間）と爆弾で星1〜3個。最高得点と最高到達ステージは localStorage に保存（アプリを更新しても消えない）
(() => {
  'use strict';

  // ---------- ルール ----------
  const STAGE_TIME = 60;          // 1ステージの時間（秒）
  const FIRST_TARGET = 200;       // ステージ1の目標点
  const TARGET_STEP = 50;         // ステージごとに増える目標点
  const MAX_LIVES = 3;
  const POINTS = { normal: 10, gold: 50, rainbow: 10, clock: 0, heart: 10, slow: 10, double: 10, freeze: 10, mystery: 0 };
  const CLOCK_BONUS = 10;         // 時計の風船でのびる秒数
  const MAX_CLOCKS = 2;           // 1ステージに出る時計の数（のびるのは最大20秒）
  const COMBO_STEP = 5;           // 何回つづけてわるとボーナスか
  const COMBO_BONUS = 50;
  const INTRO_TIME = 1.8;         // 「ステージ○」を出している時間（秒）
  const END_DELAY = 1.0;          // ライフが0になってから、ゲームオーバー画面を出すまで（秒）
  const MAX_BALLOONS = 16;
  // とくべつな風船・ボーナスラッシュ（ver4〜）
  const FROM_STAGE = { heart: 2, slow: 3, double: 4, rush: 5, freeze: 6, mystery: 7 };   // 出てくるステージ
  const SLOW_SEC = 5, SLOW_RATE = 0.5;    // スロー：5秒間、風船の動きが50%
  const FREEZE_SEC = 3;                   // フリーズ：3秒間、風船が止まり、新しい風船も出ない
  const DOUBLE_SEC = 10;                  // ×2：10秒間、ふつう・金色の風船の得点が2倍（コンボボーナスは2倍にしない）
  const RUSH_SEC = 8;                     // ボーナスラッシュ：8秒間
  const RUSH_INTERVAL = 0.32;             // ラッシュ中の風船の出る間隔（ふだんの何倍か）
  const RUSH_MAX_BALLOONS = 24;
  const MYSTERY_POINTS = 50, MYSTERY_TIME = 5;   // ？の風船：50点 または +5秒（+5秒は1ステージ1回まで。時計の2個とは別）
  const MYSTERY_EFFECTS = ['points', 'time', 'slow', 'freeze'];
  const SPECIAL_EVERY = 5;                // 5ステージごとに SPECIAL CLEAR!
  const BAG_SIZE = 40;

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
  // ステージが進むと、風船が少しずつ速く・多くなり、爆弾も少しずつ増える（にがすとライフがへるので、上がり方はゆるやか）
  function stageParams(stage) {
    const s = stage - 1;
    return {
      speed: Math.min(0.36, 0.15 + 0.018 * s),   // 1秒に上がる高さ（画面の高さに対する割合）
      interval: Math.max(0.42, 0.78 - 0.035 * s), // 風船が出る間隔（秒、平均）
      bombs: Math.min(5, 2 + Math.floor(s / 2)), // 20個あたりの爆弾の数
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
      escape: () => play((t) => { tone(1100, t, 0.45, { type: 'sine', vol: 0.18, slide: 0.3 }); tone(220, t + 0.38, 0.22, { type: 'square', vol: 0.12, slide: 0.6 }); tone(165, t + 0.55, 0.3, { type: 'square', vol: 0.12, slide: 0.6 }); }),
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
      // とくべつな風船・ボーナスラッシュ・SPECIAL CLEAR!（ver4〜）
      heal: () => play((t) => { [72, 76, 79, 84, 88].forEach((m, i) => tone(midi(m), t + i * 0.07, 0.4, { type: 'sine', vol: 0.22 })); tone(midi(96), t + 0.35, 0.5, { type: 'triangle', vol: 0.12 }); noise(t + 0.3, 0.3, 0.15, 8000); }),
      slow: () => play((t) => { tone(700, t, 0.7, { type: 'triangle', vol: 0.22, slide: 0.4 }); tone(350, t + 0.1, 0.7, { type: 'sine', vol: 0.14, slide: 0.5 }); }),
      double: () => play((t) => { [[88, 0], [95, 0.08], [88, 0.2], [95, 0.28], [100, 0.36]].forEach(([m, d]) => tone(midi(m), t + d, 0.16, { type: 'square', vol: 0.1 })); }),
      freeze: () => play((t) => { [96, 100, 103, 108].forEach((m, i) => tone(midi(m), t + i * 0.05, 0.6, { type: 'sine', vol: 0.12 })); noise(t, 0.4, 0.25, 9000); }),
      mystery: () => play((t) => { [79, 74, 83, 78, 86, 91].forEach((m, i) => tone(midi(m), t + i * 0.055, 0.14, { type: 'square', vol: 0.09 })); }),
      rush: () => play((t) => {
        [[72, 0], [76, 0.09], [79, 0.18], [84, 0.27], [79, 0.4], [84, 0.49], [88, 0.58]].forEach(([m, d]) => tone(midi(m), t + d, d > 0.5 ? 0.45 : 0.12, { type: 'square', vol: 0.11 }));
        noise(t, 0.3, 0.3, 5000);
      }),
      special: () => play((t) => {
        const fan = [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [84, 0.6], [79, 0.85], [84, 1.0], [88, 1.15], [91, 1.3]];
        fan.forEach(([m, d]) => tone(midi(m), t + d, d >= 1.3 ? 1.0 : 0.2, { type: 'square', vol: 0.12 }));
        fan.forEach(([m, d]) => tone(midi(m - 12), t + d, 0.25, { type: 'triangle', vol: 0.12 }));
        [48, 55, 60, 64].forEach((m) => tone(midi(m), t + 1.3, 1.1, { type: 'triangle', vol: 0.13 }));
        [0.5, 0.9, 1.3, 1.7, 2.1, 2.5].forEach((d) => noise(t + d, 0.35, 0.35, 1800));   // 花火の音
      }),
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
    combo: $('combo'), effects: $('effects'), banner: $('banner'), bonus: $('bonus'),
    start: $('start'), pause: $('pause'), pauseMenu: $('pauseMenu'), confirm: $('confirm'), confirmText: $('confirmText'),
    clear: $('clear'), result: $('result'),
  };
  const show = (e) => e.classList.remove('hidden');
  const hide = (e) => e.classList.add('hidden');

  let W = 0, H = 0, DPR = 1, R = 36;
  let sprites = {};

  // ふつうの風船の色（金色とまぎれないよう黄色は使わない。ハートのピンク・スローの紫とまぎれないよう、ピンクと紫も使わない）
  // とくべつな風船は、どれもまん中に白いマークがある（ふつうの風船にはマークがない）
  const COLORS = [
    ['#ff5a6e', '#c41f3a'], ['#4aa8ff', '#1c63c9'], ['#4fd16a', '#1f9440'], ['#ff9a3c', '#d9601a'],
  ];
  // とくべつな風船の色（グラデーションの3色・結び目の色・こわれた時のかけらの色）
  const SPECIAL_LOOK = {
    heart: { g: ['#ffe0ef', '#ff6fae', '#d81b72'], knot: '#d81b72', bit: '#ff6fae' },
    slow: { g: ['#efe4ff', '#9a63ff', '#5626c0'], knot: '#5626c0', bit: '#9a63ff' },
    double: { g: ['#fff4c4', '#ffc21a', '#c77700'], knot: '#a86400', bit: '#ffc21a' },
    freeze: { g: ['#ffffff', '#c4ecff', '#5aaee0'], knot: '#4a9fd4', bit: '#c4ecff' },
  };

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
    } else if (kind === 'bomb') {
      // 爆弾：黒い風船
      const g = c.createRadialGradient(-0.35 * r, -0.5 * r, 0.1 * r, 0, 0, 1.3 * r);
      g.addColorStop(0, '#8a8d9c'); g.addColorStop(0.3, '#33353f'); g.addColorStop(1, '#09090d');
      c.fillStyle = g; knot = '#111116';
    } else if (kind === 'mystery') {
      // ？：ピンク〜紫〜青のカラフルな紫系
      const g = c.createLinearGradient(-r, -1.2 * r, r, 1.1 * r);
      g.addColorStop(0, '#ff7ad9'); g.addColorStop(0.45, '#a855f7'); g.addColorStop(1, '#3f3fd8');
      c.fillStyle = g; knot = '#3f3fd8';
    } else if (SPECIAL_LOOK[kind]) {
      const [a, b, d] = SPECIAL_LOOK[kind].g;
      const g = c.createRadialGradient(-0.35 * r, -0.5 * r, 0.1 * r, 0, 0, 1.3 * r);
      g.addColorStop(0, a); g.addColorStop(0.42, b); g.addColorStop(1, d);
      c.fillStyle = g; knot = SPECIAL_LOOK[kind].knot;
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
    if (kind === 'bomb') drawBombMark(c, r);
    else if (MARKS[kind]) MARKS[kind](c, r);
  }
  // とくべつな風船のまん中のマーク
  const MARK_Y = -0.08;   // マークの中心（r に対する割合）
  function badge(c, r, fill, stroke) {
    c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = r * 0.07;
    c.beginPath(); c.arc(0, MARK_Y * r, 0.52 * r, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  function markText(c, r, text, size, fill, stroke) {
    c.font = '900 ' + Math.round(size * r) + 'px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = r * 0.14; c.strokeText(text, 0, (MARK_Y + 0.04) * r); }
    c.fillStyle = fill; c.fillText(text, 0, (MARK_Y + 0.04) * r);
  }
  const MARKS = {
    // ハート：白いハート
    heart(c, r) {
      const y = MARK_Y * r, s = 0.5 * r;
      c.beginPath();
      c.moveTo(0, y + 0.42 * s);
      c.bezierCurveTo(-1.05 * s, y - 0.25 * s, -0.55 * s, y - 0.95 * s, 0, y - 0.45 * s);
      c.bezierCurveTo(0.55 * s, y - 0.95 * s, 1.05 * s, y - 0.25 * s, 0, y + 0.42 * s);
      c.closePath();
      c.fillStyle = '#fff'; c.strokeStyle = '#c0136a'; c.lineWidth = r * 0.06; c.lineJoin = 'round';
      c.fill(); c.stroke();
    },
    // スロー：白い丸の中に、紫のかたつむり
    slow(c, r) {
      badge(c, r, '#fff', '#5626c0');
      const y = MARK_Y * r;
      c.strokeStyle = '#6a35d8'; c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = r * 0.11;
      c.beginPath(); c.moveTo(-0.36 * r, y + 0.24 * r); c.lineTo(0.32 * r, y + 0.24 * r); c.stroke();            // からだ
      c.lineWidth = r * 0.05;
      c.beginPath(); c.moveTo(-0.3 * r, y + 0.2 * r); c.lineTo(-0.38 * r, y - 0.06 * r);
      c.moveTo(-0.24 * r, y + 0.2 * r); c.lineTo(-0.2 * r, y - 0.06 * r); c.stroke();                               // つの
      c.fillStyle = '#b48cff'; c.lineWidth = r * 0.07;
      c.beginPath(); c.arc(0.06 * r, y - 0.02 * r, 0.25 * r, 0, Math.PI * 2); c.fill(); c.stroke();                  // から
      c.lineWidth = r * 0.05;
      c.beginPath(); c.arc(0.06 * r, y - 0.02 * r, 0.12 * r, Math.PI * 0.2, Math.PI * 1.9); c.stroke();             // うずまき
    },
    // ×2：赤い丸に白い「×2」（金色50点の風船にはマークがないので、ひと目で区別できる）
    double(c, r) {
      badge(c, r, '#e8303f', '#fff');
      markText(c, r, '×2', 0.56, '#fff');
    },
    // フリーズ：雪の結晶
    freeze(c, r) {
      const y = MARK_Y * r, L = 0.46 * r;
      const flake = (w, col) => {
        c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, sx = Math.sin(a), cy = -Math.cos(a);
          c.moveTo(0, y); c.lineTo(sx * L, y + cy * L);
          for (const side of [-1, 1]) {
            const b = a + side * 0.7, bx = 0.55 * L * sx, by = y + 0.55 * L * cy;
            c.moveTo(bx, by); c.lineTo(bx + Math.sin(b) * 0.24 * L, by - Math.cos(b) * 0.24 * L);
          }
        }
        c.stroke();
      };
      flake(r * 0.2, '#2a86c9');
      flake(r * 0.09, '#fff');
    },
    // ？：大きな白い「？」
    mystery(c, r) { markText(c, r, '？', 0.95, '#fff', '#5b21b6'); },
  };
  // 黒い風船のまん中の爆弾の絵（白いふちどりで、黒い風船の上でもはっきり見える。火花は draw() で毎フレーム描く）
  const BOMB_SPARK = [0.5, -0.74];   // 導火線の先（r に対する割合）
  function drawBombMark(c, r) {
    const cx = -0.04 * r, cy = 0.02 * r, br = 0.4 * r;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // 導火線
    c.beginPath(); c.moveTo(cx + 0.26 * r, cy - 0.3 * r); c.quadraticCurveTo(cx + 0.5 * r, cy - 0.52 * r, BOMB_SPARK[0] * r, BOMB_SPARK[1] * r);
    c.strokeStyle = '#fff'; c.lineWidth = r * 0.15; c.stroke();
    c.strokeStyle = '#c8954a'; c.lineWidth = r * 0.07; c.stroke();
    // 口金
    c.save(); c.translate(cx + 0.24 * r, cy - 0.28 * r); c.rotate(0.75);
    c.fillStyle = '#6d7180'; c.strokeStyle = '#fff'; c.lineWidth = r * 0.05;
    c.beginPath(); c.rect(-0.13 * r, -0.09 * r, 0.26 * r, 0.18 * r); c.fill(); c.stroke();
    c.restore();
    // 玉
    const g = c.createRadialGradient(cx - 0.14 * r, cy - 0.14 * r, 0.03 * r, cx, cy, br);
    g.addColorStop(0, '#7d8192'); g.addColorStop(0.55, '#2c2e38'); g.addColorStop(1, '#101015');
    c.fillStyle = g; c.strokeStyle = '#fff'; c.lineWidth = r * 0.07;
    c.beginPath(); c.arc(cx, cy, br, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath(); c.ellipse(cx - 0.15 * r, cy - 0.16 * r, 0.07 * r, 0.12 * r, -0.7, 0, Math.PI * 2); c.fill();
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
    ['gold', 'rainbow', 'clock', 'bomb', 'heart', 'slow', 'double', 'freeze', 'mystery'].forEach((k) => { sprites[k] = makeSprite(k); });
  }
  // スタート画面の説明の小さな絵
  function drawRuleIcons() {
    document.querySelectorAll('canvas.kindIcon').forEach((cv) => {
      const kind = cv.dataset.kind;
      const size = 44, dpr = Math.min(3, window.devicePixelRatio || 1), r = 13;
      cv.width = size * dpr; cv.height = size * dpr;
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, 17 * dpr);
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
    motion: null, doubleLeft: 0, rushLeft: 0, rushDone: false, rushAt: Infinity, rushConfetti: 0, mysteryTimeUsed: false, lastMystery: null, special: false, savedByRush: 0,
    lostBy: { bomb: 0, escape: 0 }, escaped: {},   // ライフがへった理由ごとの回数・上へにげた風船の数（このゲームの合計）
    bestScore: readInt(BEST_SCORE_KEY), bestStage: readInt(BEST_STAGE_KEY),
    bestScoreAtStart: 0, bestStageAtStart: 0,
  };
  let balloons = [];
  let particles = [];
  let texts = [];
  let nextId = 1;

  // 40個ずつの袋から順に出す（種類の割合が毎回ほぼ同じになり、同じ種類が続きすぎない）
  //   金色4（10%）・にじ色2（5%）・時計（1ステージ2個まで）・爆弾（ステージで4〜10個）
  //   とくべつな風船は、出てくるステージから1個ずつ（それぞれ2.5%）。のこりはぜんぶ、ふつうの風船
  function refillBag() {
    const p = stageParams(state.stage);
    const bag = ['gold', 'gold', 'gold', 'gold', 'rainbow', 'rainbow'];
    for (let n = state.spawned.clock || 0; n < MAX_CLOCKS; n++) bag.push('clock');
    for (const k of ['heart', 'slow', 'double', 'freeze', 'mystery']) if (state.stage >= FROM_STAGE[k]) bag.push(k);
    for (let i = 0; i < p.bombs * 2; i++) bag.push('bomb');
    while (bag.length < BAG_SIZE) bag.push('normal');
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    state.bag = bag;
  }
  const SPEED_OF = { normal: 1, gold: 1.35, rainbow: 1.1, clock: 1.15, bomb: 0.95, heart: 1.15, slow: 1.05, double: 1.2, freeze: 1.05, mystery: 1.1 };
  const SCALE_OF = { normal: 1, gold: 0.9, rainbow: 1, clock: 1, bomb: 0.95, heart: 1, slow: 1, double: 0.95, freeze: 1, mystery: 1 };

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
      deco: !!opts.deco, rush: !!opts.rush, dead: false,   // rush：ボーナスラッシュで出た風船（にがしてもライフはへらない）
    };
    if (!b.deco) state.spawned[kind] = (state.spawned[kind] || 0) + 1;
    balloons.push(b);
    return b;
  }
  function moveBalloons(dt) {
    for (const b of balloons) {
      if (b.dead) continue;                  // にじ色などでわれた風船は、にげた扱いにしない
      b.age += dt;
      b.y -= b.speed * dt;
      const a = b.phase + b.age * b.freq * Math.PI * 2;
      b.x = b.x0 + b.amp * Math.sin(a);
      b.tilt = -Math.cos(a) * 0.12;
      if (b.y < -2.6 * b.r) {                // ひもの先まで、画面の上から完全に消えた
        b.dead = true;
        if (!b.deco && !b.escaped) { b.escaped = true; escapeBalloon(b); }
      }
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
      const dx = (x - b.x) / (b.r * 1.15), dy = (y - (b.y - 0.05 * b.r)) / (b.r * 1.3);
      const d = dx * dx + dy * dy;                      // 風船（爆弾の黒い風船も）は少し大きめに当たる
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
    // ×2 は、このタップの前から続いている時だけ（×2の風船をわったタップでは、まだ2倍にならない）
    const dbl = state.doubleLeft > 0;
    let gained = 0, healed = false;
    popped.forEach((p, i) => {
      p.dead = true;
      burst(p, i * 0.04);
      const r = popEffect(p, dbl);
      gained += r.pts;
      if (r.healed) healed = true;
    });
    state.combo++;
    if (state.combo % COMBO_STEP === 0) {
      gained += COMBO_BONUS;                 // コンボボーナスは2倍にしない
      showBonus(state.combo + 'コンボ！ +' + COMBO_BONUS);
      Sound.se.combo();
    }
    addScore(gained);
    if (b.kind === 'rainbow') Sound.se.rainbow();
    else if (b.kind === 'gold') Sound.se.gold();
    else if (b.kind === 'clock') Sound.se.clock();
    else if (b.kind === 'heart') (healed ? Sound.se.heal : Sound.se.pop)();
    else if (Sound.se[b.kind] && b.kind !== 'normal') Sound.se[b.kind]();
    else Sound.se.pop();
    balloons = balloons.filter((o) => !o.dead);
  }
  // 1個の風船がわれた時の得点と効果（タップでも、にじ色のまとめわりでも同じ）
  function popEffect(p, dbl) {
    let pts = POINTS[p.kind];
    if (dbl && (p.kind === 'normal' || p.kind === 'gold')) pts *= 2;
    let healed = false, label = null, color = '#ff4f7a', size = 1;
    if (p.kind === 'clock') {
      state.time += CLOCK_BONUS;
      label = '+' + CLOCK_BONUS + '秒'; color = '#1b8fc0'; size = 1.1;
    } else if (p.kind === 'heart') {
      if (state.lives < MAX_LIVES) { pts = 0; healed = true; healLife(); label = 'ライフ+1'; color = '#e8247a'; size = 1.15; }
    } else if (p.kind === 'slow') {
      setMotion('slow'); banner('SLOW!', 'eff slow');
    } else if (p.kind === 'freeze') {
      setMotion('freeze'); banner('FREEZE!', 'eff freeze');
    } else if (p.kind === 'double') {
      state.doubleLeft = DOUBLE_SEC; banner('SCORE ×2!', 'eff double');
    } else if (p.kind === 'mystery') {
      const m = mysteryEffect();
      pts += m.pts; label = m.label; color = '#8b2fd6'; size = 1.15;
    }
    if (!label) {
      label = '+' + pts;
      if (p.kind === 'gold') { color = '#d48a00'; size = 1.25; }
      if (pts > POINTS[p.kind]) label += ' ×2';
    }
    floatText(p.x, p.y, label, color, size);
    return { pts, healed };
  }
  // スロー・フリーズ（ひとつの枠を使うので、あとからとった方が優先。同じものをもう一度とると、時間が最初にもどる）
  function setMotion(kind) {
    state.motion = { kind, left: kind === 'freeze' ? FREEZE_SEC : SLOW_SEC };
  }
  const motionRate = () => !state.motion ? 1 : state.motion.kind === 'freeze' ? 0 : SLOW_RATE;
  // ？の風船：4つのうちどれか（悪い効果はない）。+5秒は1ステージ1回まで（2回目からは、ほかの3つから）
  let forcedMystery = null;   // 自動テスト用
  function mysteryEffect() {
    const opts = MYSTERY_EFFECTS.filter((k) => k !== 'time' || !state.mysteryTimeUsed);
    let pick = forcedMystery && opts.includes(forcedMystery) ? forcedMystery : opts[Math.floor(Math.random() * opts.length)];
    forcedMystery = null;
    state.lastMystery = pick;
    if (pick === 'points') { banner('？ → +' + MYSTERY_POINTS + '点！', 'eff mystery'); return { pts: MYSTERY_POINTS, label: '+' + MYSTERY_POINTS }; }
    if (pick === 'time') {
      state.time += MYSTERY_TIME; state.mysteryTimeUsed = true;
      banner('？ → +' + MYSTERY_TIME + '秒！', 'eff mystery'); return { pts: 0, label: '+' + MYSTERY_TIME + '秒' };
    }
    setMotion(pick);
    banner(pick === 'slow' ? '？ → SLOW!' : '？ → FREEZE!', 'eff mystery');
    return { pts: 0, label: pick === 'slow' ? 'スロー' : 'フリーズ' };
  }
  // ライフを1ふやす（ハートの風船だけ。最大3）。もどったハートが光る
  function healLife() {
    state.lives = Math.min(MAX_LIVES, state.lives + 1);
    updateHud();
    const heart = el.lives.querySelectorAll('.heart')[state.lives - 1];
    if (heart) { heart.classList.remove('hit', 'heal'); void heart.offsetWidth; heart.classList.add('heal'); }
    el.lives.classList.remove('hurt', 'healed'); void el.lives.offsetWidth; el.lives.classList.add('healed');
  }
  // ボーナスラッシュ（ステージ5から、1ステージ1回）
  function startRush() {
    state.rushDone = true;
    state.rushLeft = RUSH_SEC;
    state.rushConfetti = 0;
    state.spawnTimer = 0.1;
    document.body.classList.add('rush');
    banner('BONUS RUSH!', 'eff rush');
    Sound.se.rush();
  }
  function endRush() {
    state.rushLeft = 0;
    document.body.classList.remove('rush');
  }
  // ステージが変わる時・クリアした時・ゲームが終わる時は、とくべつな効果をぜんぶ消す
  function clearEffects() {
    state.motion = null;
    state.doubleLeft = 0;
    state.mysteryTimeUsed = false;
    endRush();
    // ゲームオーバー・タイトルでは表示の更新がないので、ここで消しておく
    document.body.classList.remove('slowfx', 'freezefx');
    el.effects.replaceChildren();
    hudCache.fx = '';
  }
  // 毎フレーム：効果ののこり時間をへらす（プレイ中だけ。一時停止中・クリア後は止まる）
  function tickEffects(dt) {
    if (state.motion) { state.motion.left -= dt; if (state.motion.left <= 0) state.motion = null; }
    if (state.doubleLeft > 0) state.doubleLeft = Math.max(0, state.doubleLeft - dt);
    if (state.stage >= FROM_STAGE.rush && !state.rushDone && state.elapsed >= state.rushAt) startRush();
    if (state.rushLeft > 0) {
      state.rushLeft -= dt;
      state.rushConfetti -= dt;
      if (state.rushConfetti <= 0) { state.rushConfetti = 0.45; confetti(0.12); }
      if (state.rushLeft <= 0) endRush();
    }
  }
  function hitBomb(b) {
    b.dead = true;
    balloons = balloons.filter((o) => !o.dead);
    explosion(b);
    state.bombsHit++;
    state.shake = 0.45;
    Sound.se.bomb();
    floatText(b.x, b.y, 'ライフ-1', '#e0303a', 1.15);
    loseLife('bomb');
  }
  // 風船が画面の上から完全に消えた（爆弾はにがしてもOK。ライフがへるのはプレイ中だけ。一時停止中・クリア後は風船が動かない）
  function escapeBalloon(b) {
    if (state.mode !== 'play') return;
    state.escaped[b.kind] = (state.escaped[b.kind] || 0) + 1;
    if (b.kind === 'bomb') return;
    const y = el.hud.getBoundingClientRect().bottom + R * 0.9;
    const x = Math.min(Math.max(b.x, R * 2.5), W - R * 2.5);
    // ボーナスラッシュ中ににげた風船・ラッシュで出た風船は、ライフがへらない（コンボだけ0にもどる）
    if (state.rushLeft > 0 || b.rush) {
      state.combo = 0;
      state.savedByRush = (state.savedByRush || 0) + 1;
      floatText(x, y, 'セーフ！', '#e08a00', 0.9);
      return;
    }
    floatText(x, y, 'にげた！ ライフ-1', '#e0303a', 1);
    state.shake = 0.25;
    Sound.se.escape();
    loseLife('escape');
  }
  // ライフを1へらす（ばくだん・にげた風船で共通。コンボも0にもどる）
  function loseLife(cause) {
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    state.lostBy[cause]++;
    const heart = el.lives.querySelectorAll('.heart')[state.lives];
    if (heart) { heart.classList.remove('hit', 'heal'); void heart.offsetWidth; heart.classList.add('hit'); }
    el.lives.classList.remove('hurt', 'healed'); void el.lives.offsetWidth; el.lives.classList.add('hurt');
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) navigator.vibrate(120); } catch (e) { /* 対応していない時は何もしない */ }
    if (state.lives <= 0) {
      state.mode = 'ending';
      state.endTimer = END_DELAY;
      const parts = [];
      if (state.lostBy.bomb) parts.push('ばくだん ' + state.lostBy.bomb + '回');
      if (state.lostBy.escape) parts.push('にがした風船 ' + state.lostBy.escape + '個');
      state.overReason = 'ライフがなくなった（' + parts.join('・') + '）';
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
    const col = b.kind === 'gold' ? '#ffd23f' : b.kind === 'clock' ? '#6fd6f5' : b.kind === 'rainbow' ? null : b.kind === 'mystery' ? '#a855f7'
      : SPECIAL_LOOK[b.kind] ? SPECIAL_LOOK[b.kind].bit : COLORS[b.color][0];
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
  // ステージクリアの紙ふぶき（画面の上から、いろいろな色がひらひら落ちる）。amount で量をかえる（ボーナスラッシュ中は少しずつ）
  function confetti(amount = 1) {
    const cols = ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff', '#9b6bff', '#ffffff'];
    const n = Math.max(3, Math.round(Math.min(90, Math.round(W / 8)) * amount));
    for (let i = 0; i < n; i++) {
      particles.push({ x: Math.random() * W, y: -R * (0.5 + Math.random() * 3), vx: (Math.random() - 0.5) * R * 2, vy: H * (0.28 + Math.random() * 0.2), fall: true,
        life: 2.6 + Math.random() * 1.2, t: -Math.random() * 0.5, color: cols[i % cols.length], size: R * (0.1 + Math.random() * 0.08), spin: 4 + Math.random() * 8 });
    }
  }
  // SPECIAL CLEAR! の花火（6発。パネルにかくれない画面の上と下で交互に。スマホでも重くならないよう、1発28個まで）
  function fireworks() {
    const cols = ['#ff4d6d', '#ffd23f', '#4ab3ff', '#5ee06a', '#ff7ad9', '#ff9f43'];
    for (let k = 0; k < 6; k++) {
      const x = W * (0.15 + Math.random() * 0.7), y = k % 2 === 0 ? H * (0.05 + Math.random() * 0.16) : H * (0.8 + Math.random() * 0.12), delay = 0.35 + k * 0.4, col = cols[k % cols.length];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, sp = R * (5 + Math.random() * 2.5);
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1 + Math.random() * 0.3, t: -delay,
          color: i % 4 === 0 ? '#fffbe0' : col, size: R * 0.08, spin: 0 });
      }
      for (let i = 0; i < 5; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * R * 6, vy: (Math.random() - 0.7) * R * 6,
        life: 1.2, t: -delay, color: '#ffe14d', size: R * 0.2, star: true, spin: 0 });
      ring(x, y, col, 3, delay);
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
  // sub：大きな文字の下に出す小さな文字（新しい風船のお知らせなど）
  function banner(text, kind = '', sub = '') {
    el.banner.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.banner.appendChild(s); }
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
        // 導火線の火花（ちらちら光る）
        const fl = 0.7 + Math.random() * 0.5;
        ctx.fillStyle = '#ffd23f';
        star(ctx, BOMB_SPARK[0] * R, BOMB_SPARK[1] * R, R * 0.22 * fl);
        ctx.fillStyle = '#ff6a1f';
        star(ctx, BOMB_SPARK[0] * R, BOMB_SPARK[1] * R, R * 0.11 * fl);
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
    // とくべつな効果ののこり時間（画面の上に「SLOW あと○秒」などを出す）
    const fx = [];
    const left = (s) => ' あと' + Math.max(1, Math.ceil(s)) + '秒';
    if (state.rushLeft > 0) fx.push(['rush', 'BONUS RUSH!' + left(state.rushLeft)]);
    if (state.motion) fx.push([state.motion.kind, (state.motion.kind === 'freeze' ? 'FREEZE' : 'SLOW') + left(state.motion.left)]);
    if (state.doubleLeft > 0) fx.push(['double', 'SCORE ×2' + left(state.doubleLeft)]);
    const key = fx.map((f) => f.join(':')).join('|');
    if (hudCache.fx !== key) {
      hudCache.fx = key;
      el.effects.replaceChildren(...fx.map(([k, t]) => { const s = document.createElement('span'); s.className = 'fx ' + k; s.textContent = t; return s; }));
      document.body.classList.toggle('slowfx', !!state.motion && state.motion.kind === 'slow');
      document.body.classList.toggle('freezefx', !!state.motion && state.motion.kind === 'freeze');
    }
  }

  // ---------- ゲームの流れ ----------
  function startGame() {
    Sound.unlock();
    state.stage = 1;
    state.total = 0;
    state.lives = MAX_LIVES;
    state.lostBy = { bomb: 0, escape: 0 };
    state.escaped = {};
    el.lives.classList.remove('hurt', 'healed');
    el.lives.querySelectorAll('.heart').forEach((h) => h.classList.remove('hit', 'heal'));
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
    clearEffects();                   // 前のステージの効果は持ちこさない
    state.rushDone = false;
    state.rushAt = state.stage >= FROM_STAGE.rush ? 12 + Math.random() * 14 : Infinity;   // ラッシュが始まる時間（スタートから12〜26秒）
    state.savedByRush = 0;
    starTimers.forEach(clearTimeout);
    starTimers = [];
    hide(el.clear);
    saveBest();                       // ここまで来た＝このステージに到達
    state.mode = 'intro';
    state.introLeft = INTRO_TIME;
    banner('ステージ ' + state.stage + '\n目標 ' + targetOf(state.stage) + '点', 'intro', NEW_AT[state.stage] ? 'NEW! ' + NEW_AT[state.stage] : '');
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
  // そのステージで初めて出てくるもの（「ステージ○」の下にお知らせ）
  const NEW_AT = {
    [FROM_STAGE.heart]: 'ハートの風船：ライフ+1', [FROM_STAGE.slow]: 'スローの風船：ゆっくりになる', [FROM_STAGE.double]: '×2の風船：得点2倍',
    [FROM_STAGE.rush]: 'ボーナスラッシュが来るかも', [FROM_STAGE.freeze]: 'フリーズの風船：風船が止まる', [FROM_STAGE.mystery]: '？の風船：なにかいいこと',
  };
  // 目標点に届いた瞬間のステージクリア（5ステージごとは SPECIAL CLEAR!）
  let starTimers = [];
  function clearStage() {
    state.mode = 'clear';
    state.clearSec = state.elapsed;
    state.stars = starsOf(state.clearSec, state.bombsHit);
    clearEffects();
    saveBest();
    Sound.stopBgm();
    const special = state.stage % SPECIAL_EVERY === 0;
    state.special = special;
    el.clear.classList.toggle('special', special);
    el.clear.querySelector('.stageClear span').textContent = special ? 'SPECIAL' : 'STAGE';
    el.clear.querySelector('.stageClear').setAttribute('aria-label', special ? 'スペシャルクリア' : 'ステージクリア');
    if (special) { Sound.se.special(); confetti(1.6); fireworks(); } else { Sound.se.clear(); confetti(); }
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
    clearEffects();
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
    clearEffects();
    updateHud();
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
    // クリアしたら、風船と爆弾はその場で止まる。スロー中は半分の速さ、フリーズ中は止まる（制限時間はふつうに進む）
    if (state.mode !== 'clear') moveBalloons(dt * motionRate());
    if (state.mode === 'intro') {
      state.introLeft -= dt;
      if (state.introLeft <= 0) { state.mode = 'play'; banner('スタート！', 'go'); }
    } else if (state.mode === 'play') {
      state.time -= dt;
      state.elapsed += dt;
      const sec = Math.ceil(state.time);
      if (sec <= 5 && sec >= 1 && sec !== state.lastTick) { state.lastTick = sec; Sound.se.tick(); }
      tickEffects(dt);
      if (motionRate() > 0) state.spawnTimer -= dt;   // フリーズ中は新しい風船も出ない
      if (state.spawnTimer <= 0) {
        const p = stageParams(state.stage), rush = state.rushLeft > 0;
        state.spawnTimer = p.interval * (rush ? RUSH_INTERVAL : 1) * (0.7 + Math.random() * 0.6);
        if (rush) {
          // ボーナスラッシュ：ふつうと金色だけ（爆弾は出ない）。袋は使わないので、ラッシュのあとは元の割合にもどる
          if (balloons.length < RUSH_MAX_BALLOONS) spawn(Math.random() < 0.2 ? 'gold' : 'normal', { rush: true });
        } else if (balloons.length < MAX_BALLOONS) {
          if (!state.bag.length) refillBag();
          spawn(state.bag.pop());
        }
      }
      if (state.time <= 0 && state.mode === 'play') endStage();
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
        lostBy: { ...state.lostBy }, escaped: { ...state.escaped }, overReason: state.overReason,
        motion: state.motion ? { ...state.motion } : null, doubleLeft: state.doubleLeft, rushLeft: state.rushLeft, rushDone: state.rushDone, rushAt: state.rushAt,
        mysteryTimeUsed: state.mysteryTimeUsed, lastMystery: state.lastMystery, savedByRush: state.savedByRush, special: !!state.special,
        bestScore: state.bestScore, bestStage: state.bestStage, spawned: { ...state.spawned }, R, W, H }),
      balloons: () => balloons.filter((b) => !b.dead && !b.deco).map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, r: b.r })),
      spawn: (kind, x, y, moving) => { const b = spawn(kind, { x, y, still: !moving }); if (!moving) b.amp = 0; return b.id; },
      clear: () => { balloons = []; },
      setTime: (sec) => { state.time = sec; },
      setLives: (n) => { state.lives = n; },
      setStage: (n) => { state.stage = n; },
      startRush: () => { if (state.mode === 'play') startRush(); },
      setRushAt: (sec) => { state.rushAt = sec; },
      nextMystery: (k) => { forcedMystery = k; },
      particles: () => particles.length,
      bag: () => state.bag.slice(),
      refillBag: () => { state.bag = []; refillBag(); return state.bag.slice(); },
      setElapsed: (sec) => { state.elapsed = sec; },
      setStageScore: (n) => { state.stageScore = n; },
      addScore: (n) => addScore(n),
      stars: starsOf,
      params: stageParams,
    },
  };
})();
