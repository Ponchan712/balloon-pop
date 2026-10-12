// バルーンポップ！ セーブデータ・コイン・ショップ・ログインボーナス・デイリーミッション・トロフィー・週間チャレンジ・冒険マップ
// ・保存は localStorage の 'balloonSave'（JSON・バージョンつき）。前からある最高記録 balloonBestScore / balloonBestStage はそのまま使う
// ・日付は日本時間（UTC+9）。デイリーは毎日0時、週間チャレンジは毎週月曜0時に新しくなる
// ・コインが動く処理（購入・報酬・復活・ステージクリア）は、チェックとコインの増減と「もう受け取った」の印を1回の保存でまとめて書く
//   （途中で閉じても、二重にもらったり、コインだけへったりしない）
window.BalloonMeta = (() => {
  'use strict';
  const SAVE_KEY = 'balloonSave';
  const SAVE_VERSION = 1;

  // ---------- ねだん・報酬 ----------
  const CHAR_PRICE = { bear: 0, dog: 200, rabbit: 400, cat: 700, robot: 1000 };      // dragon はトロフィー20種コンプリートの限定（買えない）
  const SPECIAL_PRICE = { heart: 200, slow: 300, double: 400, freeze: 500, mystery: 600 };
  const SPECIAL_NAME = { heart: 'ハート', slow: 'スロー', double: 'ダブル得点', freeze: 'フリーズ', mystery: '？バルーン' };
  const SPECIAL_DESC = { heart: 'ライフが1つもどる（最大3）', slow: '5秒間 風船がゆっくり', double: '10秒間 得点が2倍', freeze: '3秒間 風船が止まる', mystery: '50点・+5秒・スロー・フリーズのどれか' };
  const ITEM_PRICE = { hat: 100, ribbon: 150, glasses: 200, crown: 400 };
  // 季節限定（春3〜4月／夏7〜8月／秋10〜11月／冬12〜1月）。買ったら一年中つかえる。買いのがしても、次の年の同じ季節にまた出る
  const SEASON_ITEMS = {
    spring: { sakura: 300, butterfly: 200, flowerGlasses: 400, tulip: 600 },
    summer: { straw: 300, sunglass: 200, lei: 400, icecream: 600 },
    autumn: { witch: 400, maple: 200, pumpkinGlasses: 300, lantern: 600 },
    winter: { santa: 400, muffler: 200, snowGlasses: 300, present: 600 },
  };
  const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const SEASON_OF_MONTH = { 3: 'spring', 4: 'spring', 7: 'summer', 8: 'summer', 10: 'autumn', 11: 'autumn', 12: 'winter', 1: 'winter' };

  const COIN = { pop: 1, firstClear: 30, reClear: 15, combo5: 5, noMiss: 50 };
  const REVIVE_COST = [30, 60, 100];
  const LOGIN_BONUS = [20, 30, 40, 50, 60, 70, 150];
  const DAILY = [
    { key: 'popped', n: 20, coins: 10, text: '風船を20こ わる' },
    { key: 'clears', n: 2, coins: 20, text: 'ステージを2回 クリア' },
    { key: 'combo10', n: 1, coins: 30, text: '10コンボを1回 たっせい' },
  ];
  const DAILY_ALL = 30;
  const WEEKLY = [
    { tier: 'かんたん', coins: 50, list: [{ key: 'popped', n: 100, text: '風船を100こ わる' }, { key: 'combo5', n: 5, text: '5コンボを5回' }, { key: 'clears', n: 10, text: 'ステージを10回 クリア' }] },
    { tier: 'ふつう', coins: 100, list: [{ key: 'popped', n: 300, text: '風船を300こ わる' }, { key: 'combo10', n: 5, text: '10コンボを5回' }, { key: 'nomiss', n: 5, text: 'ノーミスで5回 クリア' }] },
    { tier: 'むずかしい', coins: 200, list: [{ key: 'popped', n: 600, text: '風船を600こ わる' }, { key: 'combo20', n: 3, text: '20コンボを3回' }, { key: 'clears', n: 30, text: 'ステージを30回 クリア' }] },
  ];
  const WEEKLY_ALL = 100;
  const COMPLETE_COINS = 1000;

  // トロフィー20種類（kind：何で数えるか）
  const TROPHIES = [
    { id: 't01', name: 'はじめてのぽんっ！', text: 'ステージ1をクリア', kind: 'stage', n: 1, tier: 0 },
    { id: 't02', name: 'わくわくぼうけん隊', text: 'ステージ5をクリア', kind: 'stage', n: 5, tier: 0 },
    { id: 't03', name: 'ぷかぷかバルーン', text: '風船を100こ わる', kind: 'popped', n: 100, tier: 0 },
    { id: 't04', name: 'ぽんぽん5れんぞく！', text: '5コンボを たっせい', kind: 'combo', n: 5, tier: 0 },
    { id: 't05', name: 'おほしさまキラリ', text: '星をあわせて10こ', kind: 'stars', n: 10, tier: 0 },
    { id: 't06', name: 'はじめてのおかいもの', text: 'ショップではじめて買う', kind: 'purchases', n: 1, tier: 0 },
    { id: 't07', name: 'にじいろぼうけん隊', text: 'ステージ10をクリア', kind: 'stage', n: 10, tier: 1 },
    { id: 't08', name: 'おめでとうパーティー！', text: 'ステージ30をクリア', kind: 'stage', n: 30, tier: 1 },
    { id: 't09', name: 'バルーンいっぱい！', text: '風船を500こ わる', kind: 'popped', n: 500, tier: 1 },
    { id: 't10', name: 'ぽんぽん大行進', text: '風船を1,000こ わる', kind: 'popped', n: 1000, tier: 1 },
    { id: 't11', name: 'キラキラ10コンボ', text: '10コンボを たっせい', kind: 'combo', n: 10, tier: 1 },
    { id: 't12', name: 'ハートをまもれ！', text: 'ノーミスで10回 クリア', kind: 'nomiss', n: 10, tier: 1 },
    { id: 't13', name: 'おほしさまの宝箱', text: '星をあわせて30こ', kind: 'stars', n: 30, tier: 1 },
    { id: 't14', name: '星空のたからもの', text: '星をあわせて90こ', kind: 'stars', n: 90, tier: 1 },
    { id: 't15', name: 'おしゃれだいすき！', text: '着せ替えを5こ 買う', kind: 'costumes', n: 5, tier: 1 },
    { id: 't16', name: '夢のバルーン王国', text: 'ステージ100をクリア', kind: 'stage', n: 100, tier: 2 },
    { id: 't17', name: 'ぽんぽん伝説！', text: '風船を5,000こ わる', kind: 'popped', n: 5000, tier: 2 },
    { id: 't18', name: '30コンボの王冠', text: '30コンボを たっせい', kind: 'combo', n: 30, tier: 2 },
    { id: 't19', name: 'ハートの守り神', text: 'ノーミスで50回 クリア', kind: 'nomiss', n: 50, tier: 2 },
    { id: 't20', name: 'おほしさまのプリンセス', text: '星をあわせて200こ', kind: 'stars', n: 200, tier: 2 },
  ];
  const TROPHY_COINS = [50, 150, 300];
  const TIER_NAME = ['かんたん', 'ふつう', 'むずかしい'];

  // 冒険マップの世界（5ステージごとに景色とBGMがかわる。8つの世界をくり返す）
  const WORLDS = [
    { id: 'meadow', name: 'ぽかぽか草原' },
    { id: 'sakura', name: 'さくらの公園' },
    { id: 'sea', name: '南国の海' },
    { id: 'sunset', name: 'ゆうやけの丘' },
    { id: 'night', name: 'きらきら星空' },
    { id: 'space', name: 'ふしぎな宇宙' },
    { id: 'candy', name: 'お菓子の王国' },
    { id: 'cloud', name: 'にじの雲の国' },
  ];
  const STAGES_PER_WORLD = 5;
  const worldIndexOf = (stage) => Math.floor((Math.max(1, stage) - 1) / STAGES_PER_WORLD) % WORLDS.length;
  const worldOf = (stage) => WORLDS[worldIndexOf(stage)];
  // お祝いの節目（30・50・100・150・200…）
  const isMilestone = (stage) => stage === 30 || stage === 50 || (stage >= 100 && stage % 50 === 0);

  // ---------- 日本時間 ----------
  let clockOffset = 0;   // 自動テスト用（日付をすすめる）
  const now = () => Date.now() + clockOffset;
  const JST = 9 * 3600 * 1000;
  const pad = (n) => String(n).padStart(2, '0');
  function jst(t = now()) { const d = new Date(t + JST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }; }
  const dayKey = (t = now()) => { const p = jst(t); return p.y + '-' + pad(p.m) + '-' + pad(p.d); };
  // その週の月曜0時（日本時間）の時刻
  function weekStart(t = now()) {
    const p = jst(t);
    const midnight = Date.UTC(p.y, p.m - 1, p.d) - JST;
    return midnight - ((p.dow + 6) % 7) * 86400000;
  }
  const weekKey = (t = now()) => dayKey(weekStart(t));
  const seasonNow = () => SEASON_OF_MONTH[jst().m] || null;

  // ---------- 保存 ----------
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };
  function fresh() {
    return {
      v: SAVE_VERSION, coins: 0,
      chars: ['bear'], char: 'bear', specials: [], items: [], equip: {},
      stages: {}, maxCleared: 0, lastStage: 1,
      stats: { popped: 0, maxCombo: 0, nomiss: 0, clears: 0, purchases: 0, costumes: 0 },
      trophies: {}, celebrate: [], complete: false,
      login: { last: '', count: 0 },
      daily: { date: '', popped: 0, clears: 0, combo10: 0, done: [false, false, false], all: false },
      weekly: { unlockedAt: 0, week: '', picks: [], prev: [], prog: {}, done: [false, false, false], all: false, totalDone: 0, allWeeks: 0 },
      settings: { bgm: true, se: true }, tutorial: false, seen: [],
    };
  }
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  // 保存データをデフォルトに重ねる（足りない項目は足し、型のちがうものは使わない）
  function merge(base, saved) {
    if (!isObj(saved)) return base;
    for (const k of Object.keys(base)) {
      if (!(k in saved)) continue;
      const b = base[k], s = saved[k];
      if (isObj(b)) base[k] = isObj(s) ? (Object.keys(b).length ? merge(b, s) : s) : b;
      else if (Array.isArray(b)) base[k] = Array.isArray(s) ? s : b;
      else if (typeof b === typeof s) base[k] = s;
    }
    return base;
  }
  // 古い形の保存データを新しい形にする（バージョンが上がった時はここに足していく）
  const MIGRATIONS = {
    // 0 → 1：まだ balloonSave がない（ver4 までのデータ）。とどいたステージの1つ前まではクリアずみにする（星は最低の1つ）
    0(d) {
      const bestStage = Math.max(0, parseInt(ls.get('balloonBestStage'), 10) || 0);
      d.maxCleared = Math.max(0, bestStage - 1);
      for (let s = 1; s <= d.maxCleared; s++) d.stages[s] = 1;
      d.lastStage = d.maxCleared + 1;
      if (ls.get('balloonSound') === 'off') d.settings = { bgm: false, se: false };
      return d;
    },
  };
  function load() {
    let raw = null;
    try { raw = JSON.parse(ls.get(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
    let d;
    if (!raw) d = MIGRATIONS[0](fresh());
    else {
      d = merge(fresh(), raw);
      for (let v = (raw.v | 0) || 1; v < SAVE_VERSION; v++) if (MIGRATIONS[v]) d = MIGRATIONS[v](d);
    }
    d.v = SAVE_VERSION;
    // こわれた値を直す（コインは0以上の整数）
    d.coins = Math.max(0, Math.floor(Number(d.coins) || 0));
    if (!d.chars.includes('bear')) d.chars.unshift('bear');
    if (!d.chars.includes(d.char)) d.char = 'bear';
    d.lastStage = Math.min(Math.max(1, d.lastStage | 0), d.maxCleared + 1);
    return d;
  }
  let data = load();
  let dirty = false;
  function save() { dirty = false; ls.set(SAVE_KEY, JSON.stringify(data)); }
  function saveSoon() { dirty = true; }
  setInterval(() => { if (dirty) save(); }, 2000);
  window.addEventListener('pagehide', () => { if (dirty) save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) save(); });
  save();

  // ---------- お知らせ（画面がわで受け取る） ----------
  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  const emit = (ev, arg) => (listeners[ev] || []).forEach((fn) => { try { fn(arg); } catch (e) { setTimeout(() => { throw e; }); } });
  let inPlay = false;   // プレイ中にとったトロフィーは、ステージが終わってからお祝いする
  const setInPlay = (v) => { inPlay = !!v; if (!inPlay) flushCelebrations(); };
  function flushCelebrations() { if (data.celebrate.length) emit('celebrate'); }
  function takeCelebrations() { const list = data.celebrate.slice(); data.celebrate = []; save(); return list; }
  function addCoins(n) { data.coins = Math.max(0, data.coins + Math.floor(n)); emit('coins', data.coins); }

  // ---------- ステージ・星 ----------
  const totalStars = () => Object.values(data.stages).reduce((a, s) => a + (s | 0), 0);
  const starsOf = (stage) => data.stages[stage] | 0;
  const isUnlocked = (stage) => stage >= 1 && stage <= data.maxCleared + 1;

  // ---------- トロフィー ----------
  function trophyValue(t) {
    switch (t.kind) {
      case 'stage': return data.maxCleared;
      case 'popped': return data.stats.popped;
      case 'combo': return data.stats.maxCombo;
      case 'stars': return totalStars();
      case 'purchases': return data.stats.purchases;
      case 'costumes': return data.stats.costumes;
      case 'nomiss': return data.stats.nomiss;
      default: return 0;
    }
  }
  function checkTrophies() {
    let got = false;
    for (const t of TROPHIES) {
      if (data.trophies[t.id] || trophyValue(t) < t.n) continue;
      data.trophies[t.id] = dayKey();
      addCoins(TROPHY_COINS[t.tier]);
      data.celebrate.push({ type: 'trophy', id: t.id });
      got = true;
    }
    // 20種類ぜんぶ：にじいろドラゴン・にじいろクラウン・1000コイン（1回だけ）。ここから週間チャレンジが始まる
    if (!data.complete && TROPHIES.every((t) => data.trophies[t.id])) {
      data.complete = true;
      if (!data.chars.includes('dragon')) data.chars.push('dragon');
      if (!data.items.includes('rainbowCrown')) data.items.push('rainbowCrown');
      addCoins(COMPLETE_COINS);
      data.weekly.unlockedAt = now();
      data.celebrate.push({ type: 'complete' });
      ensureWeek();
      got = true;
    }
    if (got) { save(); if (!inPlay) flushCelebrations(); }
    return got;
  }

  // ---------- デイリーミッション ----------
  function ensureDay() {
    const today = dayKey();
    if (today > data.daily.date) {   // 日付は先にすすんだ時だけ新しくする（端末の時計をもどしても、もう一度もらえない）
      data.daily = { date: today, popped: 0, clears: 0, combo10: 0, done: [false, false, false], all: false };
      saveSoon();
    }
  }
  function checkDaily() {
    let changed = false;
    DAILY.forEach((m, i) => {
      if (!data.daily.done[i] && data.daily[m.key] >= m.n) {
        data.daily.done[i] = true; addCoins(m.coins); changed = true;
        emit('toast', { kind: 'daily', text: 'デイリーミッション クリア！ +' + m.coins + 'コイン', sub: m.text });
      }
    });
    if (!data.daily.all && data.daily.done.every(Boolean)) {
      data.daily.all = true; addCoins(DAILY_ALL); changed = true;
      emit('toast', { kind: 'daily', text: 'デイリー ぜんぶクリア！ +' + DAILY_ALL + 'コイン' });
    }
    if (changed) save();
  }

  // ---------- 週間チャレンジ（トロフィーコンプリート後） ----------
  const weeklyUnlocked = () => data.weekly.unlockedAt > 0;
  function ensureWeek() {
    if (!weeklyUnlocked()) return;
    const wk = weekKey();
    const w = data.weekly;
    if (w.picks.length === 3 && !(wk > w.week)) return;
    // 同じ難しさで、前の週と同じ目標はえらばない
    const prev = w.picks.length === 3 ? w.picks.slice() : w.prev;
    const picks = WEEKLY.map((tier, i) => {
      const opts = tier.list.map((_, j) => j).filter((j) => j !== prev[i]);
      return opts[Math.floor(Math.random() * opts.length)];
    });
    data.weekly = { ...w, week: wk, prev, picks, prog: {}, done: [false, false, false], all: false };
    save();
  }
  function weeklyGoal(i) { const w = data.weekly; return WEEKLY[i].list[w.picks[i]]; }
  function checkWeekly() {
    if (!weeklyUnlocked()) return;
    const w = data.weekly;
    let changed = false;
    for (let i = 0; i < 3; i++) {
      const g = weeklyGoal(i);
      if (!g || w.done[i] || (w.prog[g.key] || 0) < g.n) continue;
      w.done[i] = true; w.totalDone++; addCoins(WEEKLY[i].coins); changed = true;
      emit('toast', { kind: 'weekly', text: '週間チャレンジ たっせい！ +' + WEEKLY[i].coins + 'コイン', sub: g.text });
    }
    if (!w.all && w.done.every(Boolean)) {
      w.all = true; w.allWeeks++; addCoins(WEEKLY_ALL); changed = true;
      data.celebrate.push({ type: 'weekly' });
      if (!inPlay) flushCelebrations();
    }
    if (changed) save();
  }
  function weeklyAdd(key, n = 1) {
    if (!weeklyUnlocked()) return;   // 解放前のプレイは数えない
    ensureWeek();
    data.weekly.prog[key] = (data.weekly.prog[key] || 0) + n;
  }

  // ---------- ゲームから呼ばれる ----------
  // 風船をわった（にじ色のまとめわりも1こずつ。同じ風船は1回だけ呼ばれる）
  function recordPop(n = 1) {
    ensureDay();
    data.stats.popped += n;
    data.daily.popped += n;
    weeklyAdd('popped', n);
    saveSoon();
    checkDaily(); checkWeekly(); checkTrophies();
  }
  // コンボがふえた（5・10・20 をこえた瞬間を数える）
  function recordCombo(c) {
    ensureDay();
    if (c > data.stats.maxCombo) { data.stats.maxCombo = c; saveSoon(); }
    if (c === 10) data.daily.combo10++;
    if (c === 5) weeklyAdd('combo5');
    if (c === 10) weeklyAdd('combo10');
    if (c === 20) weeklyAdd('combo20');
    if (c === 5 || c === 10 || c === 20 || c === 30) { saveSoon(); checkDaily(); checkWeekly(); checkTrophies(); }
  }
  function beginAttempt(stage) { data.lastStage = stage; save(); }
  // ステージクリア：挑戦中のコイン＋クリアのコイン＋ノーミスのコインをまとめて受け取る
  function stageCleared({ stage, stars, nomiss, earned }) {
    ensureDay();
    const first = !(data.stages[stage] > 0);
    const r = { earned: Math.max(0, earned | 0), clear: first ? COIN.firstClear : COIN.reClear, first, nomiss: nomiss ? COIN.noMiss : 0 };
    r.total = r.earned + r.clear + r.nomiss;
    const before = data.stages[stage] | 0;
    data.stages[stage] = Math.max(before, stars);
    r.bestStars = data.stages[stage];
    r.newBest = stars > before;
    data.maxCleared = Math.max(data.maxCleared, stage);
    data.lastStage = stage + 1;
    data.stats.clears++;
    if (nomiss) data.stats.nomiss++;
    data.daily.clears++;
    weeklyAdd('clears');
    if (nomiss) weeklyAdd('nomiss');
    addCoins(r.total);
    save();
    checkDaily(); checkWeekly(); checkTrophies();
    return r;
  }
  // 失敗・とちゅうでやめた：挑戦中のコインは受け取らない（それまでのコイン・買ったものはそのまま）
  function stageFailed(stage) { data.lastStage = Math.min(stage, data.maxCleared + 1); save(); }
  // 復活（1回の挑戦で3回まで。30・60・100コイン。返金なし）
  const reviveCost = (used) => REVIVE_COST[used];
  function spendRevive(used) {
    const cost = REVIVE_COST[used];
    if (cost == null || data.coins < cost) return false;
    addCoins(-cost); save();
    return true;
  }

  // ---------- ショップ ----------
  // 商品：{ type: 'char'|'special'|'item', id, price, season? }
  function shopItems() {
    const list = [];
    for (const [id, price] of Object.entries(CHAR_PRICE)) if (price > 0) list.push({ type: 'char', id, price });
    for (const [id, price] of Object.entries(SPECIAL_PRICE)) list.push({ type: 'special', id, price });
    for (const [id, price] of Object.entries(ITEM_PRICE)) list.push({ type: 'item', id, price });
    const season = seasonNow();
    if (season) for (const [id, price] of Object.entries(SEASON_ITEMS[season])) list.push({ type: 'item', id, price, season });
    return list;
  }
  const keyOf = (p) => p.type + ':' + p.id;
  function owns(type, id) {
    if (type === 'char') return data.chars.includes(id);
    if (type === 'special') return data.specials.includes(id);
    return data.items.includes(id);
  }
  const isNew = (p) => !owns(p.type, p.id) && !data.seen.includes(keyOf(p));
  function markSeen(list) {
    let ch = false;
    for (const p of list) { const k = keyOf(p); if (!data.seen.includes(k)) { data.seen.push(k); ch = true; } }
    if (ch) save();
  }
  // 今日のおすすめ3つ（日付で決まる。値引きはしない）
  function recommended() {
    const list = shopItems().filter((p) => !owns(p.type, p.id));
    let seed = 0;
    for (const ch of dayKey()) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list.slice(0, 3);
  }
  function buy(type, id) {
    const p = shopItems().find((x) => x.type === type && x.id === id);
    if (!p) return { ok: false, reason: 'いまは買えません' };
    if (owns(type, id)) return { ok: false, reason: 'もう持っています' };
    if (data.coins < p.price) return { ok: false, reason: 'コインが ' + (p.price - data.coins) + ' たりません' };
    addCoins(-p.price);
    if (type === 'char') data.chars.push(id);
    else if (type === 'special') data.specials.push(id);
    else { data.items.push(id); data.stats.costumes++; }
    data.stats.purchases++;
    markSeen([p]);
    save();
    checkTrophies();
    return { ok: true };
  }

  // ---------- キャラクター・着せ替え ----------
  const slotOf = (id) => (window.BalloonChars.ITEMS[id] || {}).slot;
  function equipOf(charId) { return { ...(data.equip[charId] || {}) }; }
  function selectChar(id) { if (data.chars.includes(id)) { data.char = id; save(); return true; } return false; }
  // 買ったアイテムだけ着られる（同じ枠には1つ。帽子と王冠は同じ「頭」の枠）。着せ替えはキャラクターごとに保存
  function wear(charId, itemId) {
    if (!data.chars.includes(charId) || !data.items.includes(itemId)) return false;
    const slot = slotOf(itemId);
    if (!slot) return false;
    const e = data.equip[charId] = data.equip[charId] || {};
    if (e[slot] === itemId) delete e[slot]; else e[slot] = itemId;
    save();
    return true;
  }
  function unwearAll(charId) { data.equip[charId] = {}; save(); }

  // ---------- ログインボーナス（7日でひとまわり。休んだ日があっても続きから。1日1回） ----------
  const loginAvailable = () => dayKey() > data.login.last;
  const loginDay = () => data.login.count % 7;   // 次に受け取る日（0〜6）
  function claimLogin() {
    if (!loginAvailable()) return 0;
    const n = LOGIN_BONUS[loginDay()];
    data.login.last = dayKey();
    data.login.count++;
    addCoins(n);
    save();
    return n;
  }

  // ---------- 設定 ----------
  function setSetting(k, v) { data.settings[k] = !!v; save(); }

  ensureDay(); ensureWeek(); checkTrophies();

  return {
    // データ
    get data() { return data; },
    coins: () => data.coins,
    save,
    // ルールの数字
    COIN, REVIVE_COST, LOGIN_BONUS, DAILY, DAILY_ALL, WEEKLY, WEEKLY_ALL, COMPLETE_COINS, TROPHIES, TROPHY_COINS, TIER_NAME,
    CHAR_PRICE, SPECIAL_PRICE, SPECIAL_NAME, SPECIAL_DESC, ITEM_PRICE, SEASON_ITEMS, SEASON_NAME, WORLDS, STAGES_PER_WORLD,
    worldOf, worldIndexOf, isMilestone, seasonNow, dayKey, weekKey, weekStart, now,
    // ゲーム
    ownedSpecials: () => data.specials.slice(),
    recordPop, recordCombo, beginAttempt, stageCleared, stageFailed, reviveCost, spendRevive, setInPlay,
    // ステージ
    totalStars, starsOf, isUnlocked, maxCleared: () => data.maxCleared, lastStage: () => data.lastStage,
    // トロフィー・ミッション
    trophyValue, takeCelebrations, ensureDay, ensureWeek, weeklyUnlocked, weeklyGoal,
    // ショップ・着せ替え
    shopItems, owns, isNew, markSeen, recommended, buy, keyOf, equipOf, selectChar, wear, unwearAll,
    // ログイン・設定
    loginAvailable, loginDay, claimLogin, setSetting,
    on,
    // 自動テスト用（遊び方には関係しない）
    test: {
      addDays: (n) => { clockOffset += n * 86400000; ensureDay(); ensureWeek(); },
      setCoins: (n) => { data.coins = n; save(); },
      setStat: (k, v) => { data.stats[k] = v; save(); },
      setMaxCleared: (n) => { data.maxCleared = n; save(); },
      setStars: (stage, n) => { data.stages[stage] = n; save(); },
      giveSpecials: (list) => { data.specials = list.slice(); save(); },
      check: () => checkTrophies(),
      reload: () => { data = load(); },
    },
  };
})();
