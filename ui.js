// バルーンポップ！ ホーム画面とメニュー（冒険マップ・ショップ・きせかえルーム・トロフィー・チャレンジ・ログインボーナス・せってい）
// ・お祝い（トロフィー・コンプリート・週間チャレンジ全達成・30／50／100ステージ）と、小さなお知らせ（ミッション達成）
// ・はじめて開いた時は「あそびかた」、その日はじめてならログインボーナスを出す
(() => {
  'use strict';
  const Meta = window.BalloonMeta;
  const Chars = window.BalloonChars;
  const Game = window.BalloonGame;
  const Sound = Game.sound;
  const $ = (id) => document.getElementById(id);
  const show = (e) => e.classList.remove('hidden');
  const hide = (e) => e.classList.add('hidden');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => Number(n).toLocaleString('ja-JP');
  const coin = (n) => `<i class="coinIcon"></i>${num(n)}`;
  const bar = (cur, max) => `<div class="pbar"><i style="width:${Math.min(100, Math.round(cur / max * 100))}%"></i></div><div class="pnum">${num(Math.min(cur, max))} / ${num(max)}</div>`;

  // ---------- 画面の開け閉め ----------
  const RENDER = {};
  function open(id) {
    const s = $(id);
    if (!s) return;
    Sound.unlock();
    Sound.se.tap();
    if (RENDER[id]) RENDER[id]();
    show(s);
    syncInPage();
    const body = s.querySelector('.pageBody');
    if (body && id !== 'mapScreen') body.scrollTop = 0;
    if (id === 'mapScreen') scrollMap();
  }
  function close(s) {
    if (!s) return;
    hide(s);
    syncInPage();
    if (s.id === 'roomScreen') { trying = {}; }
    if (s.id === 'tutorial' && !Meta.data.tutorial) { Meta.data.tutorial = true; Meta.save(); afterTutorial(); }
    if (s.id === 'celebrate') nextCelebration();
    refreshHome();
  }
  function syncInPage() { document.body.classList.toggle('inPage', !!document.querySelector('.screen.page:not(.hidden)')); }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { open(o.dataset.open); return; }
    const b = e.target.closest('[data-back]');
    if (b) close(b.closest('.screen'));
  });

  // ---------- コイン・ホーム ----------
  function refreshCoins() { document.querySelectorAll('.coinsNow').forEach((e) => { e.textContent = num(Meta.coins()); }); }
  Meta.on('coins', refreshCoins);
  function refreshHome() {
    refreshCoins();
    const d = Meta.data;
    const st = Meta.lastStage();
    Chars.render($('homeChar'), d.char, Meta.equipOf(d.char), 'happy');
    $('homeCharName').textContent = Chars.CHARS[d.char].name;
    $('startLabel').textContent = 'ステージ ' + st;
    $('homeStage').textContent = Meta.worldOf(st).name;
    if (Game.mode() === 'title') Game.applyWorld(st);
    $('loginMenu').classList.toggle('dot', Meta.loginAvailable());
    Meta.ensureDay();
    $('challengeMenu').classList.toggle('dot', !d.daily.all);
    $('shopMenu').classList.toggle('dot', Meta.shopItems().some(Meta.isNew));
    // 週間チャレンジの進みぐあい（ホームに小さく）
    const wm = $('weeklyMini');
    if (Meta.weeklyUnlocked()) {
      Meta.ensureWeek();
      const n = d.weekly.done.filter(Boolean).length;
      wm.innerHTML = `<b>週間チャレンジ</b> ${n} / 3 ${d.weekly.all ? 'ぜんぶクリア！' : ''}<div class="pbar"><i style="width:${Math.round(n / 3 * 100)}%"></i></div>`;
    } else {
      const got = Object.keys(d.trophies).length;
      wm.innerHTML = `<b>トロフィー</b> ${got} / 20<small>（20こで 週間チャレンジ かいほう）</small><div class="pbar"><i style="width:${Math.round(got / 20 * 100)}%"></i></div>`;
    }
  }
  document.addEventListener('balloon:title', () => { syncInPage(); refreshHome(); showPendingCelebrations(); });
  document.addEventListener('balloon:openmap', () => open('mapScreen'));
  $('homeChar').addEventListener('click', () => { Sound.unlock(); Chars.cheer($('homeChar'), Meta.data.char, 'joy', Meta.equipOf(Meta.data.char)); setTimeout(refreshHome, 1500); });

  // ---------- 小さなお知らせ ----------
  function toast(text, sub = '', kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
    $('toasts').appendChild(t);
    Sound.se.coin();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }
  Meta.on('toast', (t) => toast(t.text, t.sub, t.kind));

  // ---------- たしかめる画面（買う時など） ----------
  const ask = document.createElement('div');
  ask.className = 'screen dim hidden';
  ask.id = 'askBox';
  ask.innerHTML = '<div class="panel askPanel"><div class="askArt" id="askArt"></div><p class="askText" id="askText"></p><button class="btn" id="askOk">はい</button><button class="btn sub" id="askNo">やめる</button></div>';
  document.body.appendChild(ask);
  let askAction = null;
  function confirmBox(text, art, okLabel, action) {
    $('askText').innerHTML = text;
    $('askArt').innerHTML = art || '';
    $('askOk').textContent = okLabel;
    askAction = action;
    show(ask);
  }
  $('askOk').addEventListener('click', () => { hide(ask); const a = askAction; askAction = null; if (a) a(); });
  $('askNo').addEventListener('click', () => { hide(ask); askAction = null; Sound.se.tap(); });

  // ---------- 冒険マップ ----------
  RENDER.mapScreen = () => {
    const max = Meta.maxCleared(), cur = Meta.lastStage();
    const per = Meta.STAGES_PER_WORLD;
    const shownWorlds = Math.ceil((max + 1) / per) + 1;   // 遊べる世界＋次の世界（まだ行けない）
    let h = `<p class="mapLead">クリアした ステージは 何回でも あそべるよ（★の数は さいこうきろく）</p>`;
    for (let w = 0; w < shownWorlds; w++) {
      const first = w * per + 1, world = Meta.worldOf(first);
      const locked = first > max + 1;
      h += `<section class="world w-${world.id}${locked ? ' locked' : ''}"><h3>ワールド${w + 1}　${esc(world.name)}${locked ? ' 🔒' : ''}</h3><div class="nodes">`;
      for (let s = first; s < first + per; s++) {
        const stars = Meta.starsOf(s), open = Meta.isUnlocked(s);
        const cls = ['node', stars ? 'done' : '', s === cur ? 'here' : '', open ? '' : 'lock', Meta.isMilestone(s) ? 'mile' : '', s % 5 === 0 ? 'five' : ''].join(' ');
        const st = open ? `<span class="nstars">${[1, 2, 3].map((i) => i <= stars ? '★' : '☆').join('')}</span>` : '<span class="nstars">🔒</span>';
        h += `<button class="${cls}" data-stage="${s}" ${open ? '' : 'disabled'}><b>${s}</b>${st}${s === cur ? '<span class="nhere">いまここ</span>' : ''}</button>`;
      }
      h += '</div></section>';
    }
    $('mapBody').innerHTML = h;
  };
  function scrollMap() {
    const here = $('mapBody').querySelector('.node.here') || $('mapBody').querySelector('.node:not(.lock):last-of-type');
    if (here) here.scrollIntoView({ block: 'center' });
  }
  $('mapBody').addEventListener('click', (e) => {
    const n = e.target.closest('.node[data-stage]');
    if (!n || n.disabled) return;
    const s = Number(n.dataset.stage);
    if (!Meta.isUnlocked(s)) return;
    hide($('mapScreen')); syncInPage();
    Game.startStage(s);
  });

  // ---------- ショップ ----------
  let shopTab = 'pick';
  const SLOT_NAME = { head: 'あたま', face: 'かお', neck: 'くびもと', hand: 'もちもの' };
  function itemName(p) {
    if (p.type === 'char') return Chars.CHARS[p.id].name;
    if (p.type === 'special') return Meta.SPECIAL_NAME[p.id] + 'の風船';
    return Chars.ITEMS[p.id].name;
  }
  function itemArt(p, charId = Meta.data.char) {
    if (p.type === 'char') return `<div class="art char ${p.id}">${Chars.svg(p.id, {}, 'happy')}</div>`;
    if (p.type === 'special') return `<div class="art"><canvas class="kindIcon big" data-kind="${p.id}"></canvas></div>`;
    return `<div class="art char ${charId}">${Chars.svg(charId, { [Chars.ITEMS[p.id].slot]: p.id }, 'happy')}</div>`;
  }
  function itemDesc(p) {
    if (p.type === 'char') return 'のうりょくは みんな同じ。うごきが ちがうよ';
    if (p.type === 'special') return Meta.SPECIAL_DESC[p.id];
    return SLOT_NAME[Chars.ITEMS[p.id].slot] + (p.season ? `・${Meta.SEASON_NAME[p.season]}の げんてい` : '');
  }
  function card(p) {
    const owned = Meta.owns(p.type, p.id), isNew = Meta.isNew(p);
    const btn = owned ? '<span class="owned">✓ もっている</span>'
      : `<button class="buyBtn${Meta.coins() < p.price ? ' short' : ''}" data-buy="${p.type}:${p.id}">${coin(p.price)}</button>`;
    return `<div class="shopCard${owned ? ' isOwned' : ''}">${isNew ? '<span class="newTag">NEW</span>' : ''}${p.season ? '<span class="seasonTag">季節げんてい</span>' : ''}` +
      `${itemArt(p)}<div class="cname">${esc(itemName(p))}</div><div class="cdesc">${esc(itemDesc(p))}</div>${btn}` +
      (p.type === 'item' ? `<button class="tryBtn" data-try="${p.id}">きてみる</button>` : '') + '</div>';
  }
  function renderShop() {
    document.querySelectorAll('#shopTabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === shopTab));
    let list, h = '';
    if (shopTab === 'pick') {
      list = Meta.recommended();
      h += `<p class="shopLead">きょうの おすすめ（毎日かわるよ）</p>`;
      if (!list.length) h += '<p class="empty">ぜんぶ もっているよ！すごい！</p>';
    } else {
      list = Meta.shopItems().filter((p) => p.type === shopTab);
      if (shopTab === 'special') h += '<p class="shopLead">買った風船は ゲームに出てくるようになるよ（ずっと）</p>';
      if (shopTab === 'item') {
        const s = Meta.seasonNow();
        h += `<p class="shopLead">${s ? 'いまは ' + Meta.SEASON_NAME[s] + 'の げんてい アイテムが あるよ！' : '季節げんていは 春(3-4月)・夏(7-8月)・秋(10-11月)・冬(12-1月)'}<br>買ったアイテムは 一年中 つかえるよ</p>`;
      }
    }
    h += `<div class="cards">${list.map(card).join('')}</div>`;
    $('shopBody').innerHTML = h;
    Game.drawIcons();
    Meta.markSeen(list);
  }
  RENDER.shopScreen = () => { renderShop(); };
  $('shopTabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; Sound.se.tap(); shopTab = t.dataset.tab; renderShop(); $('shopBody').scrollTop = 0; });
  function tryBuy(type, id, after) {
    const p = Meta.shopItems().find((x) => x.type === type && x.id === id);
    if (!p) return;
    if (Meta.coins() < p.price) {
      Sound.se.nope();
      confirmBox(`<b>${esc(itemName(p))}</b><br>コインが <b>${num(p.price - Meta.coins())}</b> たりないよ<br><small>ステージをクリアして あつめよう！</small>`, itemArt(p), 'わかった', null);
      Game.drawIcons();
      return;
    }
    confirmBox(`<b>${esc(itemName(p))}</b> を<br>${coin(p.price)} コインで かいますか？`, itemArt(p), 'かう！', () => {
      const r = Meta.buy(type, id);
      if (!r.ok) { Sound.se.nope(); toast(r.reason); return; }
      Sound.se.buy();
      Game.fx.confetti(0.4);
      toast(itemName(p) + ' を かったよ！', type === 'special' ? 'つぎのステージから 出てくるよ' : type === 'char' ? 'きせかえルームで えらべるよ' : 'きせかえルームで きられるよ');
      if (after) after();
      refreshHome();
    });
    Game.drawIcons();
  }
  $('shopBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (b) { const [type, id] = b.dataset.buy.split(':'); tryBuy(type, id, renderShop); return; }
    const t = e.target.closest('[data-try]');
    if (t) { trying = { [Chars.ITEMS[t.dataset.try].slot]: t.dataset.try }; roomIdx = Math.max(0, Chars.ORDER.indexOf(Meta.data.char)); open('roomScreen'); }
  });

  // ---------- きせかえルーム ----------
  let roomIdx = 0, trying = {};
  const roomChars = () => Chars.ORDER;   // にじいろドラゴンも見えるようにしておく（手に入れ方を出す）
  function roomItemList() {
    // 持っているもの＋いま売っているもの（季節げんていは その季節だけ）
    const sell = Meta.shopItems().filter((p) => p.type === 'item').map((p) => p.id);
    const ids = Object.keys(Chars.ITEMS).filter((id) => Meta.owns('item', id) || sell.includes(id));
    return ids;
  }
  function renderRoom() {
    const list = roomChars();
    roomIdx = (roomIdx + list.length) % list.length;
    const c = list[roomIdx], d = Meta.data, ownChar = Meta.owns('char', c);
    const equip = { ...(ownChar ? Meta.equipOf(c) : {}), ...trying };
    Chars.render($('roomChar'), c, equip, 'happy');
    $('roomChar').classList.toggle('lockedChar', !ownChar);
    $('roomName').innerHTML = esc(Chars.CHARS[c].name) + (d.char === c ? ' <span class="selTag">えらんでいるよ</span>' : '');
    let a = '';
    if (!ownChar) {
      a += c === 'dragon' ? '<p class="roomNote">🏆 トロフィーを20こ あつめると 手に入るよ</p>'
        : `<button class="btn" data-buy-char="${c}">${coin(Meta.CHAR_PRICE[c])} で かう</button>`;
    } else if (d.char !== c) a += `<button class="btn" id="roomSelect">このキャラで あそぶ</button>`;
    const tryIds = Object.values(trying).filter((id) => !Meta.owns('item', id));
    if (tryIds.length) {
      const id = tryIds[0], p = Meta.shopItems().find((x) => x.type === 'item' && x.id === id);
      a += `<p class="roomNote">おためし中：<b>${esc(Chars.ITEMS[id].name)}</b></p>` + (p ? `<button class="btn sub" data-buy-item="${id}">${coin(p.price)} で かう</button>` : '');
    }
    a += `<button class="btn sub" id="roomOff">ぜんぶ はずす</button>`;
    $('roomActions').innerHTML = a;
    const items = roomItemList();
    let h = '';
    for (const slot of ['head', 'face', 'neck', 'hand']) {
      const ids = items.filter((id) => Chars.ITEMS[id].slot === slot);
      if (!ids.length) continue;
      h += `<h4>${SLOT_NAME[slot]}</h4><div class="itemRow">`;
      for (const id of ids) {
        const own = Meta.owns('item', id), on = equip[slot] === id;
        const p = Meta.shopItems().find((x) => x.type === 'item' && x.id === id);
        h += `<button class="itemTile${on ? ' on' : ''}${own ? '' : ' notOwned'}" data-item="${id}">` +
          `<span class="art char ${c}">${Chars.svg(c, { [slot]: id }, 'happy')}</span><span class="iname">${esc(Chars.ITEMS[id].name)}</span>` +
          `<span class="istate">${own ? (on ? '✓ きている' : 'もっている') : p ? 'おためし ' + coin(p.price) : ''}</span></button>`;
      }
      h += '</div>';
    }
    $('roomItems').innerHTML = h;
  }
  // ひらいた時は、えらんでいるキャラから（ショップの「きてみる」から来た時は、そのアイテムをおためし中）
  RENDER.roomScreen = () => { if (!Object.keys(trying).length) roomIdx = Math.max(0, roomChars().indexOf(Meta.data.char)); renderRoom(); };
  $('roomPrev').addEventListener('click', () => { Sound.se.tap(); roomIdx--; trying = {}; renderRoom(); });
  $('roomNext').addEventListener('click', () => { Sound.se.tap(); roomIdx++; trying = {}; renderRoom(); });
  $('roomChar').addEventListener('click', () => { const c = roomChars()[roomIdx]; Chars.cheer($('roomChar'), c); });
  $('roomBody').addEventListener('click', (e) => {
    const c = roomChars()[roomIdx];
    const it = e.target.closest('[data-item]');
    if (it) {
      const id = it.dataset.item, slot = Chars.ITEMS[id].slot;
      Sound.se.tap();
      if (Meta.owns('item', id) && Meta.owns('char', c)) {
        delete trying[slot];
        Meta.wear(c, id);   // 同じものをもう一度押すと はずす
      } else {
        if (trying[slot] === id) delete trying[slot]; else trying[slot] = id;
      }
      renderRoom();
      Chars.cheer($('roomChar'), c);
      return;
    }
    if (e.target.closest('#roomOff')) { Sound.se.tap(); trying = {}; if (Meta.owns('char', c)) Meta.unwearAll(c); renderRoom(); return; }
    if (e.target.closest('#roomSelect')) { Meta.selectChar(c); Sound.se.buy(); Chars.cheer($('roomChar'), c); renderRoom(); refreshHome(); return; }
    const bc = e.target.closest('[data-buy-char]');
    if (bc) { tryBuy('char', bc.dataset.buyChar, renderRoom); return; }
    const bi = e.target.closest('[data-buy-item]');
    if (bi) {
      const id = bi.dataset.buyItem;
      tryBuy('item', id, () => { const slot = Chars.ITEMS[id].slot; delete trying[slot]; if (Meta.owns('char', c)) { const e2 = Meta.equipOf(c); if (e2[slot] !== id) Meta.wear(c, id); } renderRoom(); });
    }
  });

  // ---------- トロフィー（イラスト） ----------
  const balloonG = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 18 q5 8 0 16" stroke="#7a7a8a" fill="none" stroke-width="1.5"/><path d="M0 -16 C18 -16 17 6 0 15 C-17 6 -18 -16 0 -16Z" fill="${col}"/><path d="M0 14 l3 5 h-6z" fill="${col}"/><ellipse cx="-6" cy="-7" rx="3" ry="5" fill="#fff" opacity=".6"/></g>`;
  const starG = (x, y, r, col, stroke = '') => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; pts.push((x + Math.sin(a) * rr).toFixed(1) + ',' + (y - Math.cos(a) * rr).toFixed(1)); }
    return `<polygon points="${pts.join(' ')}" fill="${col}" ${stroke ? `stroke="${stroke}" stroke-width="2"` : ''} stroke-linejoin="round"/>`;
  };
  const heartG = (x, y, s, col) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 14 L-13 1 A7.5 7.5 0 0 1 0 -9 A7.5 7.5 0 0 1 13 1 Z" fill="${col}" stroke="#fff" stroke-width="2"/>`;
  const textG = (x, y, t, size, col) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="900" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke" font-family="sans-serif">${t}</text>`;
  const crownG = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-20 10 L-22 -12 L-10 0 L0 -16 L10 0 L22 -12 L20 10 Z" fill="${col}" stroke="#c88a00" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="2" r="3.5" fill="#ff4f6d"/></g>`;
  const EMBLEM = {
    t01: () => [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="${50 + Math.cos(a * Math.PI / 180) * 24}" y1="${48 + Math.sin(a * Math.PI / 180) * 24}" x2="${50 + Math.cos(a * Math.PI / 180) * 32}" y2="${48 + Math.sin(a * Math.PI / 180) * 32}" stroke="#ffb400" stroke-width="4" stroke-linecap="round"/>`).join('') + balloonG(50, 44, 1, '#ff5a6e'),
    t02: () => `<line x1="34" y1="70" x2="34" y2="26" stroke="#8a5a2a" stroke-width="4"/><path d="M34 26 L58 32 L34 40Z" fill="#4fd16a"/>` + balloonG(64, 46, 0.9, '#4aa8ff'),
    t03: () => balloonG(36, 46, 0.8, '#ff5a6e') + balloonG(64, 46, 0.8, '#4aa8ff') + balloonG(50, 36, 0.85, '#ffd23f'),
    t04: () => textG(50, 50, '5', 38, '#ff5a8a') + starG(26, 30, 7, '#ffe14d') + starG(74, 70, 6, '#ffe14d'),
    t05: () => starG(50, 50, 24, '#ffe14d', '#e0a000') + starG(76, 26, 6, '#fff') + starG(26, 72, 5, '#fff'),
    t06: () => `<path d="M30 38 h40 l-4 34 h-32z" fill="#ff7ab8" stroke="#d81b72" stroke-width="2.5"/><path d="M40 38 q0 -14 10 -14 q10 0 10 14" fill="none" stroke="#d81b72" stroke-width="3"/>` + heartG(50, 53, 0.7, '#fff'),
    t07: () => ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff'].map((c, i) => `<path d="M${22 + i * 4} 66 A${28 - i * 4} ${28 - i * 4} 0 0 1 ${78 - i * 4} 66" fill="none" stroke="${c}" stroke-width="4"/>`).join('') + `<line x1="50" y1="64" x2="50" y2="34" stroke="#8a5a2a" stroke-width="3"/><path d="M50 34 L66 39 L50 45Z" fill="#ff4f6d"/>`,
    t08: () => `<path d="M30 72 L44 30 L62 60 Z" fill="#ffd23f" stroke="#e08a00" stroke-width="2.5"/><path d="M36 54 l14 6 M40 42 l12 8" stroke="#ff5a8a" stroke-width="3"/>` + ['#ff4d6d', '#4ab3ff', '#5ee06a', '#b06bff'].map((c, i) => `<rect x="${58 + i * 6}" y="${22 + (i % 2) * 10}" width="6" height="6" fill="${c}" transform="rotate(${i * 25} ${61 + i * 6} ${25 + (i % 2) * 10})"/>`).join('') + starG(74, 56, 6, '#ffe14d'),
    t09: () => [['#ff5a6e', 30, 46], ['#ff9a3c', 42, 34], ['#ffd23f', 58, 34], ['#4fd16a', 70, 46], ['#4aa8ff', 50, 50]].map(([c, x, y]) => balloonG(x, y, 0.62, c)).join(''),
    t10: () => [0, 1, 2, 3, 4].map((i) => balloonG(20 + i * 15, 44 + (i % 2) * 8, 0.5, ['#ff5a6e', '#ff9a3c', '#ffd23f', '#4fd16a', '#4aa8ff'][i])).join('') + `<path d="M18 74 h64" stroke="#8a5a2a" stroke-width="2" stroke-dasharray="4 4"/>`,
    t11: () => textG(50, 50, '10', 32, '#4f8bff') + starG(22, 28, 7, '#ffe14d') + starG(78, 28, 6, '#ff7ad9') + starG(24, 72, 5, '#5ee06a') + starG(78, 72, 7, '#ffe14d'),
    t12: () => `<path d="M50 20 L74 30 V50 Q74 70 50 80 Q26 70 26 50 V30 Z" fill="#cfe8ff" stroke="#4a8fd4" stroke-width="3"/>` + heartG(50, 50, 1.1, '#ff4f6d'),
    t13: () => `<rect x="26" y="44" width="48" height="28" rx="4" fill="#c27a3a" stroke="#7a4a1a" stroke-width="2.5"/><path d="M26 44 Q50 22 74 44 Z" fill="#d98f4a" stroke="#7a4a1a" stroke-width="2.5"/><rect x="46" y="44" width="8" height="10" fill="#ffd23f"/>` + starG(50, 30, 9, '#ffe14d', '#e0a000') + starG(70, 26, 4, '#fff'),
    t14: () => `<path d="M58 22 A26 26 0 1 0 74 66 A20 20 0 1 1 58 22 Z" fill="#ffe680" stroke="#e0b000" stroke-width="2"/>` + starG(70, 34, 7, '#fff') + starG(76, 54, 5, '#fff') + starG(30, 30, 4, '#fff'),
    t15: () => `<path d="M40 30 h20 l14 44 h-48z" fill="#ff8fc8" stroke="#d81b72" stroke-width="2.5"/><path d="M50 32 L38 24 L38 38 Z M50 32 L62 24 L62 38 Z" fill="#ff4f7a"/><circle cx="50" cy="32" r="4" fill="#fff"/>` + starG(44, 56, 4, '#fff') + starG(58, 64, 4, '#fff'),
    t16: () => `<rect x="30" y="46" width="40" height="30" fill="#fff" stroke="#8a8aa8" stroke-width="2"/><rect x="26" y="34" width="12" height="42" fill="#fff" stroke="#8a8aa8" stroke-width="2"/><rect x="62" y="34" width="12" height="42" fill="#fff" stroke="#8a8aa8" stroke-width="2"/><path d="M26 34 l6 -10 6 10 M62 34 l6 -10 6 10" fill="#ff5a8a"/><path d="M44 76 v-12 a6 6 0 0 1 12 0 v12" fill="#8a5a2a"/>` + balloonG(20, 20, 0.45, '#ffd23f') + balloonG(82, 20, 0.45, '#4aa8ff') + balloonG(50, 22, 0.5, '#ff5a6e'),
    t17: () => [-1, 1].map((s) => [0, 1, 2, 3].map((i) => `<ellipse cx="${50 + s * (24 - i * 2)}" cy="${70 - i * 12}" rx="4" ry="8" fill="#4fbf5a" transform="rotate(${s * (30 + i * 10)} ${50 + s * (24 - i * 2)} ${70 - i * 12})"/>`).join('')).join('') + balloonG(50, 42, 0.95, '#ffc21a'),
    t18: () => crownG(50, 44, 1.3, '#ffd23f') + textG(50, 70, '30', 20, '#e8303f'),
    t19: () => [-1, 1].map((s) => `<path d="M${50 + s * 12} 46 Q${50 + s * 40} 24 ${50 + s * 36} 56 Q${50 + s * 26} 52 ${50 + s * 14} 58Z" fill="#fff" stroke="#9ac8ff" stroke-width="2"/>`).join('') + heartG(50, 50, 1.2, '#ff4f6d') + starG(50, 22, 5, '#ffe14d'),
    t20: () => `<path d="M24 60 Q50 30 76 60 L72 66 Q50 44 28 66 Z" fill="#ffd8f0" stroke="#e05aa8" stroke-width="2.5"/>` + starG(50, 38, 12, '#ffe14d', '#e0a000') + `<circle cx="34" cy="52" r="3" fill="#7ad0ff"/><circle cx="66" cy="52" r="3" fill="#7ad0ff"/>` + starG(76, 26, 5, '#fff'),
  };
  const TIER_COL = [['#ffe0c0', '#d98a4a'], ['#eef4fb', '#94a8c0'], ['#fff3b0', '#e0a800']];
  function trophyArt(t) {
    const [bg, ring] = TIER_COL[t.tier];
    return `<svg viewBox="0 0 100 100" class="tArt" aria-hidden="true"><path d="M36 82 L30 98 L42 92 L46 100 L50 84 Z M64 82 L70 98 L58 92 L54 100 L50 84 Z" fill="${ring}"/>` +
      `<circle cx="50" cy="50" r="44" fill="${bg}" stroke="${ring}" stroke-width="6"/><circle cx="50" cy="50" r="36" fill="#fff" opacity=".55"/>${EMBLEM[t.id]()}</svg>`;
  }
  RENDER.trophyScreen = () => {
    const d = Meta.data, got = Meta.TROPHIES.filter((t) => d.trophies[t.id]).length;
    let h = `<div class="tSummary">あつめた トロフィー <b>${got}</b> / 20<div class="pbar"><i style="width:${got * 5}%"></i></div></div><div class="tGrid">`;
    for (const t of Meta.TROPHIES) {
      const date = d.trophies[t.id], cur = Meta.trophyValue(t);
      h += `<div class="tCard${date ? ' got' : ' locked'}"><div class="tIcon">${trophyArt(t)}</div>` +
        `<div class="tInfo"><div class="tName">${esc(t.name)}</div><div class="tCond">${esc(t.text)}<span class="tTier t${t.tier}">${Meta.TIER_NAME[t.tier]}</span></div>` +
        bar(cur, t.n) + `<div class="tReward">${date ? '✨ ' + date.replace(/-/g, '/') + ' ゲット' : 'ごほうび ' + coin(Meta.TROPHY_COINS[t.tier])}</div></div></div>`;
    }
    h += `</div><div class="tComplete${d.complete ? ' got' : ''}"><b>🌈 20こ ぜんぶ あつめると…</b><br>げんていキャラ「にじいろドラゴン」・げんていアイテム「にじいろクラウン」・${coin(Meta.COMPLETE_COINS)} コイン<br>そして 週間チャレンジが はじまるよ！${d.complete ? '<br><b>✓ ゲットずみ</b>' : ''}</div>`;
    $('trophyBody').innerHTML = h;
  };

  // ---------- チャレンジ（デイリーミッション・週間チャレンジ） ----------
  function leftText(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), dd = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
    return dd > 0 ? `あと ${dd}日 ${hh}時間` : `あと ${hh}時間 ${mm}分`;
  }
  RENDER.challengeScreen = () => {
    Meta.ensureDay(); Meta.ensureWeek();
    const d = Meta.data, now = Meta.now();
    const nextDay = Meta.weekStart(now) + (Math.floor((now - Meta.weekStart(now)) / 86400000) + 1) * 86400000;
    let h = `<section class="cBox"><h3>📅 デイリーミッション<small>${leftText(nextDay - now)}で 新しくなる</small></h3>`;
    Meta.DAILY.forEach((m, i) => {
      const cur = d.daily[m.key], done = d.daily.done[i];
      h += `<div class="mission${done ? ' done' : ''}"><div class="mText">${esc(m.text)}</div><div class="mReward">${done ? 'クリア！' : coin(m.coins)}</div>${bar(cur, m.n)}</div>`;
    });
    h += `<div class="mission bonus${d.daily.all ? ' done' : ''}"><div class="mText">3つ ぜんぶ クリア</div><div class="mReward">${d.daily.all ? 'クリア！' : coin(Meta.DAILY_ALL)}</div></div></section>`;
    h += `<section class="cBox weekly"><h3>🌈 週間チャレンジ`;
    if (!Meta.weeklyUnlocked()) {
      const got = Object.keys(d.trophies).length;
      h += `</h3><p class="lockedNote">🔒 トロフィーを 20こ ぜんぶ あつめると はじまるよ（いま ${got}こ）</p>${bar(got, 20)}`;
    } else {
      const end = Meta.weekStart(now) + 7 * 86400000;
      h += `<small>${leftText(end - now)}で 新しくなる（毎週月曜）</small></h3>`;
      for (let i = 0; i < 3; i++) {
        const g = Meta.weeklyGoal(i), done = d.weekly.done[i];
        h += `<div class="mission${done ? ' done' : ''}"><div class="mText"><span class="tTier t${i}">${Meta.WEEKLY[i].tier}</span>${esc(g.text)}</div><div class="mReward">${done ? 'クリア！' : coin(Meta.WEEKLY[i].coins)}</div>${bar(d.weekly.prog[g.key] || 0, g.n)}</div>`;
      }
      h += `<div class="mission bonus${d.weekly.all ? ' done' : ''}"><div class="mText">3つ ぜんぶ たっせい</div><div class="mReward">${d.weekly.all ? 'クリア！' : coin(Meta.WEEKLY_ALL)}</div></div>`;
      h += `<p class="cTotal">これまでに たっせいした チャレンジ <b>${d.weekly.totalDone}</b>こ／ぜんぶクリアした週 <b>${d.weekly.allWeeks}</b>回</p>`;
    }
    h += '</section>';
    $('challengeBody').innerHTML = h;
  };

  // ---------- ログインボーナス ----------
  RENDER.loginScreen = () => {
    const day = Meta.loginDay(), avail = Meta.loginAvailable();
    // 受け取った日の数（このひとまわりの中）。きょう受け取ったあとは、次の日が「あした」
    $('loginGrid').innerHTML = Meta.LOGIN_BONUS.map((n, i) => {
      const got = avail ? i < day : i < day || (day === 0 && Meta.data.login.count > 0);
      const next = avail && i === day;
      return `<div class="lday${got ? ' got' : ''}${next ? ' next' : ''}${i === 6 ? ' big' : ''}"><small>${i + 1}日目</small>${coin(n)}${got ? '<span class="lstamp">✓</span>' : ''}</div>`;
    }).join('');
    const b = $('loginClaimBtn');
    b.disabled = !avail;
    b.textContent = avail ? Meta.LOGIN_BONUS[day] + 'コイン うけとる' : 'また あした！';
  };
  $('loginClaimBtn').addEventListener('click', () => {
    const n = Meta.claimLogin();
    if (!n) return;
    Sound.unlock(); Sound.se.buy();
    Game.fx.confetti(0.5);
    toast(n + 'コイン ゲット！', 'ログインボーナス');
    RENDER.loginScreen();
    refreshHome();
  });

  // ---------- せってい・きろく ----------
  RENDER.settingsScreen = () => {
    const d = Meta.data, s = d.stats;
    const rows = [
      ['もっているコイン', num(d.coins) + '枚'], ['最高得点', num(Number(localStorage.getItem('balloonBestScore')) || 0) + '点'],
      ['最高ステージ', 'ステージ ' + (Number(localStorage.getItem('balloonBestStage')) || 0)], ['クリアしたステージ', d.maxCleared + 'まで'],
      ['星の合計', Meta.totalStars() + 'こ'], ['わった風船', num(s.popped) + 'こ'], ['さいだいコンボ', s.maxCombo + 'コンボ'],
      ['ノーミスクリア', s.nomiss + '回'], ['トロフィー', Object.keys(d.trophies).length + ' / 20'],
      ['週間チャレンジ たっせい', d.weekly.totalDone + 'こ（ぜんぶ ' + d.weekly.allWeeks + '週）'],
    ];
    $('recordList').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd><b>${b}</b></dd>`).join('');
  };

  // ---------- あそびかた ----------
  let tutPage = 0;
  function showTutPage() {
    document.querySelectorAll('#tutorial .tutPage').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.page) !== tutPage));
    document.querySelectorAll('#tutDots i').forEach((d, i) => d.classList.toggle('on', i === tutPage));
    $('tutNext').textContent = tutPage === 3 ? 'はじめる！' : 'つぎへ';
  }
  RENDER.tutorial = () => { tutPage = 0; showTutPage(); Game.drawIcons(); };
  $('tutNext').addEventListener('click', () => {
    Sound.se.tap();
    if (tutPage < 3) { tutPage++; showTutPage(); return; }
    close($('tutorial'));
  });
  function afterTutorial() { if (Meta.loginAvailable()) setTimeout(() => open('loginScreen'), 200); }

  // ---------- お祝い ----------
  let celebQueue = [];
  function showPendingCelebrations() {
    if (Game.mode() !== 'title' && Game.mode() !== 'clear' && Game.mode() !== 'over') return;
    celebQueue.push(...Meta.takeCelebrations());
    if ($('celebrate').classList.contains('hidden')) nextCelebration();
  }
  Meta.on('celebrate', showPendingCelebrations);
  document.addEventListener('balloon:milestone', (e) => { celebQueue.unshift({ type: 'milestone', stage: e.detail.stage }); if ($('celebrate').classList.contains('hidden')) nextCelebration(); });
  function nextCelebration() {
    const c = celebQueue.shift();
    if (!c) return;
    const d = Meta.data;
    const art = $('celebArt');
    $('celebArt').className = 'celebArt';
    let title = '', text = '', coins = '';
    if (c.type === 'trophy') {
      const t = Meta.TROPHIES.find((x) => x.id === c.id);
      if (!t) return nextCelebration();
      art.innerHTML = trophyArt(t);
      art.classList.add('trophy');
      title = '🏆 トロフィー ゲット！';
      text = `<b>${esc(t.name)}</b><br>${esc(t.text)}`;
      coins = '+' + coin(Meta.TROPHY_COINS[t.tier]) + ' コイン';
      Sound.se.trophy();
      Game.fx.confetti(0.8);
    } else if (c.type === 'complete') {
      art.innerHTML = '<div class="bigChar"></div>';
      Chars.render(art.firstChild, 'dragon', { head: 'rainbowCrown' }, 'joy');
      setTimeout(() => Chars.cheer(art.firstChild, 'dragon'), 300);
      title = '🌈 トロフィー コンプリート！';
      text = 'げんていキャラ <b>にじいろドラゴン</b> と<br>げんていアイテム <b>にじいろクラウン</b> を ゲット！<br>週間チャレンジが はじまったよ！';
      coins = '+' + coin(Meta.COMPLETE_COINS) + ' コイン';
      Sound.se.special();
      Game.fx.fireworks(); Game.fx.confetti(1.4);
    } else if (c.type === 'weekly') {
      art.innerHTML = '<div class="bigChar"></div>';
      Chars.render(art.firstChild, d.char, Meta.equipOf(d.char), 'joy');
      setTimeout(() => Chars.cheer(art.firstChild, d.char), 300);
      art.classList.add('rainbowGlow');
      title = '🌈 週間チャレンジ ぜんぶクリア！';
      text = 'こんしゅうの チャレンジを ぜんぶ たっせい！';
      coins = '+' + coin(Meta.WEEKLY_ALL) + ' コイン';
      Sound.se.special();
      Game.fx.fireworks(); Game.fx.confetti(1.4);
    } else if (c.type === 'milestone') {
      art.innerHTML = '<div class="bigChar"></div>';
      Chars.render(art.firstChild, d.char, Meta.equipOf(d.char), 'joy');
      setTimeout(() => Chars.cheer(art.firstChild, d.char), 300);
      art.classList.add('rainbowGlow');
      title = '🎉 ステージ' + c.stage + ' クリア！';
      text = c.stage >= 100 ? 'すごすぎる！ バルーンの でんせつだ！' : c.stage >= 50 ? 'ここまで来るなんて すごい！' : 'おめでとう！ ぼうけんは まだまだ つづくよ！';
      Sound.se.special();
      Game.fx.fireworks(); Game.fx.confetti(1.4);
    }
    $('celebTitle').innerHTML = title;
    $('celebText').innerHTML = text;
    $('celebCoins').innerHTML = coins;
    show($('celebrate'));
    refreshCoins();
  }
  $('celebOk').addEventListener('click', () => { Sound.se.tap(); close($('celebrate')); });

  // ---------- はじめ ----------
  refreshHome();
  if (!Meta.data.tutorial) open('tutorial');
  else afterTutorial();
  showPendingCelebrations();

  // 自動テスト用（遊び方には関係しない）
  window.BalloonUI = { open, close: (id) => close($(id)), refreshHome, trophyArt, toast };
})();
