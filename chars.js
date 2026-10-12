// バルーンポップ！ キャラクターと着せ替えの絵（SVG）
// ・どのキャラクターも頭の位置・目の高さ・首元・手の位置をそろえてあるので、着せ替えアイテムは全キャラ共通で使える
// ・表情：happy（ふつう）／joy（よろこぶ）／sad（ざんねん）
// ・動き（style.css）：犬＝しっぽ、うさぎ＝ぴょんぴょん、猫＝伸び・くるっと回る、ロボット＝回転ダンス、ドラゴン＝はばたき・虹のキラキラ
window.BalloonChars = (() => {
  'use strict';
  // 頭のまん中 (100, 80)・半径 56／目の高さ 82／首元 134／手 (152, 166)
  const CHARS = {
    bear: { name: 'くまのポン', body: '#c98a5b', dark: '#9c6438', light: '#f2d2b0' },
    dog: { name: 'いぬのワン', body: '#f6e3c4', dark: '#a8703f', light: '#fff8ec' },
    rabbit: { name: 'うさぎのピョン', body: '#ffffff', dark: '#f39bb9', light: '#fff0f6' },
    cat: { name: 'ねこのミィ', body: '#ffb35c', dark: '#e07b22', light: '#fff1de' },
    robot: { name: 'ロボのピコ', body: '#9fc4e8', dark: '#4f7fb3', light: '#e4f1ff' },
    dragon: { name: 'にじいろドラゴン', body: '#7fdcb0', dark: '#3aa77a', light: '#e2fff1' },
  };
  const ORDER = ['bear', 'dog', 'rabbit', 'cat', 'robot', 'dragon'];
  let uid = 0;

  function eyes(expr, c) {
    if (expr === 'joy') {
      return `<path d="M68 86 Q78 74 88 86 M112 86 Q122 74 132 86" fill="none" stroke="#3a2a22" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (expr === 'sad') {
      return `<ellipse cx="78" cy="86" rx="6" ry="7" fill="#3a2a22"/><ellipse cx="122" cy="86" rx="6" ry="7" fill="#3a2a22"/>` +
        `<path d="M66 72 L86 78 M134 72 L114 78" stroke="#3a2a22" stroke-width="3.5" stroke-linecap="round"/>` +
        `<path d="M131 94 q4 9 0 12 q-4 -3 0 -12z" fill="#7cc8ff"/>`;
    }
    if (c === 'robot') {
      return `<circle cx="78" cy="82" r="11" fill="#1d2b44"/><circle cx="122" cy="82" r="11" fill="#1d2b44"/>` +
        `<circle cx="78" cy="82" r="6" fill="#5ff4ff"/><circle cx="122" cy="82" r="6" fill="#5ff4ff"/>`;
    }
    return `<ellipse cx="78" cy="83" rx="8" ry="10" fill="#3a2a22"/><ellipse cx="122" cy="83" rx="8" ry="10" fill="#3a2a22"/>` +
      `<circle cx="81" cy="79" r="3" fill="#fff"/><circle cx="125" cy="79" r="3" fill="#fff"/>`;
  }
  function mouth(expr, c) {
    if (c === 'robot') {
      if (expr === 'sad') return `<rect x="86" y="106" width="28" height="6" rx="3" fill="#1d2b44"/>`;
      return `<path d="M84 104 Q100 ${expr === 'joy' ? 122 : 114} 116 104 Z" fill="#1d2b44"/>`;
    }
    if (expr === 'joy') return `<path d="M88 104 Q100 124 112 104 Z" fill="#c2304e"/><path d="M93 112 Q100 118 107 112" fill="#ff8aa5"/>`;
    if (expr === 'sad') return `<path d="M90 114 Q100 104 110 114" fill="none" stroke="#3a2a22" stroke-width="4" stroke-linecap="round"/>`;
    return `<path d="M89 104 Q100 115 111 104" fill="none" stroke="#3a2a22" stroke-width="4" stroke-linecap="round"/>`;
  }
  const cheeks = `<ellipse cx="62" cy="100" rx="9" ry="6" fill="#ff8fab" opacity=".6"/><ellipse cx="138" cy="100" rx="9" ry="6" fill="#ff8fab" opacity=".6"/>`;

  // うしろ（体より奥）に描く部分
  function back(c, k) {
    if (c === 'dog') return `<g class="ch-tail"><path d="M138 182 Q172 170 168 140" fill="none" stroke="${k.dark}" stroke-width="13" stroke-linecap="round"/></g>`;
    if (c === 'cat') return `<g class="ch-tail"><path d="M136 196 Q182 196 176 160 Q172 140 186 132" fill="none" stroke="${k.dark}" stroke-width="12" stroke-linecap="round"/></g>`;
    if (c === 'rabbit') return `<circle cx="140" cy="200" r="13" fill="#fff" stroke="#f2d9e3" stroke-width="2"/>`;
    if (c === 'dragon') {
      const wing = (s) => `<path d="M${100 + s * 34} 158 Q${100 + s * 92} 120 ${100 + s * 86} 168 Q${100 + s * 70} 160 ${100 + s * 66} 182 Q${100 + s * 54} 168 ${100 + s * 40} 182 Z" fill="${k.dark}" stroke="#2c8a63" stroke-width="2"/>`;
      return `<g class="ch-wing l">${wing(-1)}</g><g class="ch-wing r">${wing(1)}</g>` +
        `<path d="M130 200 Q170 210 176 186 l8 2 -10 -12 -4 12" fill="${k.body}" stroke="#2c8a63" stroke-width="2"/>`;
    }
    return '';
  }
  function bodyPart(c, k) {
    if (c === 'robot') {
      return `<rect x="58" y="138" width="84" height="74" rx="18" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>` +
        `<rect x="76" y="152" width="48" height="34" rx="8" fill="${k.light}"/><circle cx="90" cy="169" r="5" fill="#ff5a7a"/><circle cx="110" cy="169" r="5" fill="#ffd23f"/>` +
        `<rect x="40" y="150" width="20" height="36" rx="10" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/><rect x="140" y="150" width="20" height="36" rx="10" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>` +
        `<rect x="68" y="208" width="24" height="14" rx="6" fill="${k.dark}"/><rect x="108" y="208" width="24" height="14" rx="6" fill="${k.dark}"/>`;
    }
    let belly = `<ellipse cx="100" cy="180" rx="28" ry="24" fill="${k.light}"/>`;
    if (c === 'dragon') {
      belly = `<ellipse cx="100" cy="180" rx="28" ry="26" fill="#fff"/>` +
        ['#ff6b8a', '#ffb347', '#ffe066', '#7ee081', '#6cc4ff', '#b58cff'].map((col, i) => `<rect x="76" y="${160 + i * 7}" width="48" height="7" fill="${col}" opacity=".85"/>`).join('');
      belly = `<clipPath id="belly${uid}"><ellipse cx="100" cy="180" rx="28" ry="26"/></clipPath><g clip-path="url(#belly${uid})">${belly}</g>`;
    }
    return `<ellipse cx="100" cy="176" rx="46" ry="42" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>${belly}` +
      `<ellipse cx="54" cy="166" rx="13" ry="18" fill="${k.body}" stroke="${k.dark}" stroke-width="3" transform="rotate(25 54 166)"/>` +
      `<ellipse cx="146" cy="166" rx="13" ry="18" fill="${k.body}" stroke="${k.dark}" stroke-width="3" transform="rotate(-25 146 166)"/>` +
      `<ellipse cx="78" cy="214" rx="17" ry="10" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/><ellipse cx="122" cy="214" rx="17" ry="10" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>`;
  }
  function headPart(c, k, expr) {
    let s = '';
    if (c === 'bear') {
      s += `<circle cx="52" cy="36" r="20" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/><circle cx="52" cy="36" r="10" fill="${k.light}"/>` +
        `<circle cx="148" cy="36" r="20" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/><circle cx="148" cy="36" r="10" fill="${k.light}"/>`;
    } else if (c === 'rabbit') {
      s += `<ellipse cx="76" cy="6" rx="14" ry="40" fill="#fff" stroke="#f2d9e3" stroke-width="3" transform="rotate(-8 76 6)"/><ellipse cx="76" cy="8" rx="6" ry="28" fill="#ffc2d6" transform="rotate(-8 76 8)"/>` +
        `<ellipse cx="124" cy="6" rx="14" ry="40" fill="#fff" stroke="#f2d9e3" stroke-width="3" transform="rotate(8 124 6)"/><ellipse cx="124" cy="8" rx="6" ry="28" fill="#ffc2d6" transform="rotate(8 124 8)"/>`;
    } else if (c === 'cat') {
      s += `<path d="M50 56 L56 14 L88 34 Z" fill="${k.body}" stroke="${k.dark}" stroke-width="3" stroke-linejoin="round"/><path d="M58 44 L60 24 L76 36 Z" fill="#ffc2d6"/>` +
        `<path d="M150 56 L144 14 L112 34 Z" fill="${k.body}" stroke="${k.dark}" stroke-width="3" stroke-linejoin="round"/><path d="M142 44 L140 24 L124 36 Z" fill="#ffc2d6"/>`;
    } else if (c === 'dragon') {
      s += `<path d="M66 36 L60 4 L82 28 Z" fill="#ffe066" stroke="#d9a400" stroke-width="2"/><path d="M134 36 L140 4 L118 28 Z" fill="#ffe066" stroke="#d9a400" stroke-width="2"/>`;
    } else if (c === 'robot') {
      s += `<line x1="100" y1="28" x2="100" y2="8" stroke="${k.dark}" stroke-width="4"/><circle class="ch-led" cx="100" cy="6" r="8" fill="#ff5a7a"/>`;
    }
    if (c === 'robot') {
      s += `<rect x="44" y="28" width="112" height="104" rx="26" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>` +
        `<rect x="56" y="58" width="88" height="62" rx="16" fill="${k.light}"/>` +
        `<rect x="34" y="66" width="12" height="30" rx="5" fill="${k.dark}"/><rect x="154" y="66" width="12" height="30" rx="5" fill="${k.dark}"/>`;
    } else {
      s += `<circle cx="100" cy="80" r="56" fill="${k.body}" stroke="${k.dark}" stroke-width="3"/>`;
    }
    if (c === 'dog') {
      s += `<ellipse cx="46" cy="78" rx="15" ry="32" fill="${k.dark}" transform="rotate(14 46 78)"/><ellipse cx="154" cy="78" rx="15" ry="32" fill="${k.dark}" transform="rotate(-14 154 78)"/>` +
        `<ellipse cx="122" cy="80" rx="17" ry="15" fill="#e9c08f"/>`;
    }
    if (c === 'bear' || c === 'dog') s += `<ellipse cx="100" cy="104" rx="22" ry="16" fill="${k.light}"/><ellipse cx="100" cy="96" rx="8" ry="6" fill="#3a2a22"/>`;
    if (c === 'cat') {
      s += `<path d="M86 34 l4 12 M100 30 l0 14 M114 34 l-4 12" stroke="${k.dark}" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M96 96 h8 l-4 5 z" fill="#ff7fa0"/>` +
        `<path d="M40 96 h26 M42 106 l24 -4 M160 96 h-26 M158 106 l-24 -4" stroke="#7a5a3a" stroke-width="2" stroke-linecap="round"/>`;
    }
    if (c === 'rabbit') s += `<path d="M95 96 h10 l-5 6 z" fill="#ff7fa0"/>`;
    if (c === 'dragon') s += `<ellipse cx="92" cy="100" rx="3" ry="2.5" fill="#2c8a63"/><ellipse cx="108" cy="100" rx="3" ry="2.5" fill="#2c8a63"/>`;
    s += eyes(expr, c);
    if (c !== 'robot') s += cheeks;
    s += mouth(expr, c);
    return s;
  }

  // ---------- 着せ替えアイテム ----------
  // slot：head（頭：帽子・王冠など。同時に1つ）／face（顔：めがね）／neck（首元：リボン・スカーフ）／hand（手に持つもの）
  const ring = (cx, cy, r, stroke, w, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill || 'rgba(210,235,255,.35)'}" stroke="${stroke}" stroke-width="${w}"/>`;
  const glassesBase = (stroke, w, fill) => ring(78, 84, 16, stroke, w, fill) + ring(122, 84, 16, stroke, w, fill) +
    `<path d="M94 82 Q100 76 106 82" fill="none" stroke="${stroke}" stroke-width="${w}"/><path d="M62 80 L46 74 M138 80 L154 74" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  const flower = (x, y, r, petal, center) => [0, 1, 2, 3, 4].map((i) => {
    const a = i / 5 * Math.PI * 2;
    return `<circle cx="${(x + Math.sin(a) * r).toFixed(1)}" cy="${(y - Math.cos(a) * r).toFixed(1)}" r="${(r * 0.8).toFixed(1)}" fill="${petal}"/>`;
  }).join('') + `<circle cx="${x}" cy="${y}" r="${(r * 0.6).toFixed(1)}" fill="${center}"/>`;
  const crownPath = 'M60 40 L64 2 L82 24 L100 -6 L118 24 L136 2 L140 40 Z';

  const ITEMS = {
    hat: { slot: 'head', name: 'ぼうし', draw: () => `<ellipse cx="100" cy="34" rx="66" ry="12" fill="#2f7fe0" stroke="#1d5fa6" stroke-width="3"/><path d="M60 34 Q60 -8 100 -8 Q140 -8 140 34 Z" fill="#4aa0ff" stroke="#1d5fa6" stroke-width="3"/><rect x="60" y="20" width="80" height="11" fill="#ffd23f"/>` },
    ribbon: { slot: 'neck', name: 'リボン', draw: () => `<path d="M100 138 L70 122 L72 154 Z M100 138 L130 122 L128 154 Z" fill="#ff4f7a" stroke="#c41f4a" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="138" r="9" fill="#ff7f9c" stroke="#c41f4a" stroke-width="3"/>` },
    glasses: { slot: 'face', name: 'めがね', draw: () => glassesBase('#2a2a3a', 4.5) },
    crown: { slot: 'head', name: 'おうかん', draw: () => `<path d="${crownPath}" fill="#ffd23f" stroke="#c88a00" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="24" r="7" fill="#ff4f6d"/><circle cx="76" cy="30" r="5" fill="#4aa8ff"/><circle cx="124" cy="30" r="5" fill="#4fd16a"/>` },
    rainbowCrown: { slot: 'head', name: 'にじいろクラウン', limited: true, draw: (id) => `<defs><linearGradient id="rc${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".2" stop-color="#ff9f43"/><stop offset=".4" stop-color="#ffe14d"/><stop offset=".6" stop-color="#5ee06a"/><stop offset=".8" stop-color="#4ab3ff"/><stop offset="1" stop-color="#b06bff"/></linearGradient></defs>` +
      `<path d="${crownPath}" fill="url(#rc${id})" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="24" r="7" fill="#fff"/>` +
      [[58, -4], [144, -2], [100, -22]].map(([x, y], i) => `<path class="twinkle t${i}" d="M${x} ${y - 9} L${x + 3} ${y - 3} L${x + 9} ${y} L${x + 3} ${y + 3} L${x} ${y + 9} L${x - 3} ${y + 3} L${x - 9} ${y} L${x - 3} ${y - 3} Z" fill="#fff8b0"/>`).join('') },
    // 春
    sakura: { slot: 'head', name: 'さくらのかみかざり', draw: () => flower(132, 34, 9, '#ffb7d0', '#ff6f9c') + flower(112, 26, 7, '#ffd0e0', '#ff8fb0') },
    butterfly: { slot: 'neck', name: 'ちょうちょネクタイ', draw: () => `<path d="M100 138 Q76 112 70 136 Q76 160 100 138 Q124 160 130 136 Q124 112 100 138 Z" fill="#b48cff" stroke="#7a4fd8" stroke-width="3"/><circle cx="82" cy="134" r="5" fill="#ffe066"/><circle cx="118" cy="134" r="5" fill="#ffe066"/>` },
    flowerGlasses: { slot: 'face', name: 'おはなメガネ', draw: () => glassesBase('#ff6f9c', 5) + flower(62, 70, 5, '#ffd0e0', '#ffd23f') + flower(138, 70, 5, '#ffd0e0', '#ffd23f') },
    tulip: { slot: 'hand', name: 'チューリップ', draw: () => `<path d="M156 186 L156 140" stroke="#3cbf55" stroke-width="5"/><path d="M156 166 Q170 156 172 144" fill="none" stroke="#3cbf55" stroke-width="5"/><path d="M144 126 L150 142 Q156 148 162 142 L168 126 L160 134 L156 122 L152 134 Z" fill="#ff4f6d" stroke="#c41f3a" stroke-width="2"/>` },
    // 夏
    straw: { slot: 'head', name: 'むぎわらぼうし', draw: () => `<ellipse cx="100" cy="34" rx="80" ry="15" fill="#f2cf7a" stroke="#c49a3a" stroke-width="3"/><path d="M64 34 Q64 -4 100 -4 Q136 -4 136 34 Z" fill="#f7dc94" stroke="#c49a3a" stroke-width="3"/><rect x="64" y="20" width="72" height="10" fill="#ff4f6d"/>` },
    sunglass: { slot: 'face', name: 'サングラス', draw: () => glassesBase('#1d1d28', 5, '#262a3a') + `<path d="M70 78 l6 -4" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M114 78 l6 -4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` },
    lei: { slot: 'neck', name: 'アロハのレイ', draw: () => [...Array(9)].map((_, i) => { const a = Math.PI * (0.1 + i * 0.1); return flower(+(100 - Math.cos(a) * 44).toFixed(1), +(128 + Math.sin(a) * 18).toFixed(1), 5, ['#ff6f9c', '#ffd23f', '#ff9f43'][i % 3], '#fff'); }).join('') },
    icecream: { slot: 'hand', name: 'アイスクリーム', draw: () => `<path d="M146 146 L156 186 L166 146 Z" fill="#e8b46a" stroke="#b07a2a" stroke-width="2"/><circle cx="156" cy="140" r="12" fill="#ffc2d6"/><circle cx="156" cy="124" r="10" fill="#9ce0ff"/><circle cx="160" cy="114" r="3" fill="#ff4f6d"/>` },
    // 秋
    witch: { slot: 'head', name: 'ハロウィンのぼうし', draw: () => `<ellipse cx="100" cy="34" rx="70" ry="12" fill="#5b2a8a" stroke="#3a145e" stroke-width="3"/><path d="M66 34 L104 -40 L134 34 Z" fill="#7a3fb8" stroke="#3a145e" stroke-width="3" stroke-linejoin="round"/><rect x="70" y="20" width="62" height="10" fill="#ff9a1f"/>` },
    maple: { slot: 'neck', name: 'もみじのスカーフ', draw: () => `<path d="M58 132 Q100 152 142 132 L144 144 Q100 166 56 144 Z" fill="#ff8a3c" stroke="#c4561a" stroke-width="3"/><path d="M120 146 L116 176 L130 172 Z" fill="#ff8a3c" stroke="#c4561a" stroke-width="3"/><path d="M100 140 l3 6 6 -2 -3 6 5 3 -7 1 -1 6 -3 -5 -3 5 -1 -6 -7 -1 5 -3 -3 -6 6 2 z" fill="#e8303f"/>` },
    pumpkinGlasses: { slot: 'face', name: 'かぼちゃメガネ', draw: () => glassesBase('#ff8a1f', 6) + `<path d="M78 64 q2 -6 6 -6 M122 64 q2 -6 6 -6" stroke="#3cbf55" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    lantern: { slot: 'hand', name: 'かぼちゃランタン', draw: () => `<path d="M156 112 L156 124" stroke="#555" stroke-width="3"/><ellipse cx="156" cy="146" rx="20" ry="17" fill="#ff8a1f" stroke="#c4561a" stroke-width="3"/><path d="M146 140 l4 -5 4 5 z M158 140 l4 -5 4 5 z M146 152 q10 6 20 0" fill="#ffe066" stroke="#ffe066" stroke-width="2"/><rect x="152" y="124" width="8" height="8" rx="2" fill="#3cbf55"/>` },
    // 冬
    santa: { slot: 'head', name: 'サンタのぼうし', draw: () => `<path d="M62 34 Q70 -14 118 -10 Q150 -6 162 26" fill="#e8303f" stroke="#a81a2a" stroke-width="3"/><path d="M62 34 Q100 0 140 34 Z" fill="#e8303f"/><rect x="56" y="24" width="90" height="18" rx="9" fill="#fff" stroke="#ddd" stroke-width="2"/><circle cx="162" cy="28" r="11" fill="#fff" stroke="#ddd" stroke-width="2"/>` },
    muffler: { slot: 'neck', name: 'あったかマフラー', draw: () => `<path d="M56 130 Q100 152 144 130 L146 146 Q100 168 54 146 Z" fill="#e8303f" stroke="#a81a2a" stroke-width="3"/><path d="M74 140 l0 14 M92 144 l0 15 M110 144 l0 15 M128 140 l0 14" stroke="#fff" stroke-width="5"/><path d="M124 148 L120 184 L138 182 Z" fill="#e8303f" stroke="#a81a2a" stroke-width="3"/>` },
    snowGlasses: { slot: 'face', name: 'ゆきのメガネ', draw: () => glassesBase('#5aaee0', 5) + `<path d="M100 62 v-14 M94 51 l12 8 M94 59 l12 -8" stroke="#5aaee0" stroke-width="3" stroke-linecap="round"/>` },
    present: { slot: 'hand', name: 'プレゼント', draw: () => `<rect x="138" y="134" width="38" height="34" rx="4" fill="#4aa8ff" stroke="#1d5fa6" stroke-width="3"/><rect x="153" y="134" width="8" height="34" fill="#ffd23f"/><path d="M157 134 Q144 118 148 130 Q150 136 157 134 Q170 118 166 130 Q164 136 157 134" fill="#ffd23f" stroke="#c88a00" stroke-width="2"/>` },
  };

  // 絵を作る。equip = { head, face, neck, hand }（アイテムのid）。try = おためし中のアイテム（上書き）
  function svg(charId, equip = {}, expr = 'happy') {
    const c = CHARS[charId] ? charId : 'bear';
    const k = CHARS[c];
    uid++;
    const it = (slot) => { const id = equip[slot]; return id && ITEMS[id] && ITEMS[id].slot === slot ? `<g class="item ${slot} it-${id}">${ITEMS[id].draw(uid)}</g>` : ''; };
    return `<svg viewBox="-12 -48 224 280" class="charSvg" aria-hidden="true">` +
      `<g class="ch-all">${back(c, k)}<g class="ch-body">${bodyPart(c, k)}</g>${it('hand')}<g class="ch-head">${headPart(c, k, expr)}${it('face')}${it('head')}</g>${it('neck')}</g></svg>`;
  }
  // 要素にキャラクターを描く（動きは CSS の .char.<id> と .cheer で付ける）
  function render(el, charId, equip, expr) {
    el.innerHTML = svg(charId, equip, expr);
    el.classList.add('char');
    ORDER.forEach((c) => el.classList.toggle(c, c === charId));
  }
  // よろこぶ動き（1回）。ドラゴンは虹色のキラキラも出す
  function cheer(el, charId, expr = 'joy', equip) {
    if (!el) return;
    if (equip) render(el, charId, equip, expr);
    el.classList.remove('cheer'); void el.offsetWidth; el.classList.add('cheer');
    if (charId === 'dragon') {
      const cols = ['#ff4d6d', '#ff9f43', '#ffe14d', '#5ee06a', '#4ab3ff', '#b06bff'];
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('i');
        s.className = 'spark';
        s.style.background = cols[i];
        s.style.left = (10 + Math.random() * 80) + '%';
        s.style.top = (10 + Math.random() * 60) + '%';
        s.style.animationDelay = (i * 0.08) + 's';
        el.appendChild(s);
        setTimeout(() => s.remove(), 1400);
      }
    }
    clearTimeout(el._cheerT);
    el._cheerT = setTimeout(() => el.classList.remove('cheer'), 1500);
  }
  return { CHARS, ORDER, ITEMS, svg, render, cheer };
})();
