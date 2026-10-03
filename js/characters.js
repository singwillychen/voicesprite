/* 動漫角色：5 種風格 × 男女，共 10 位，全部以內嵌 SVG 繪製 */
(function (VS) {
  'use strict';

  const OUT = '#141414';
  const SKIN = '#ffe3cf';
  const SKIN_SHADE = '#f4c1a3';
  const MOUTH = '#8a1f2b';
  const TONGUE = '#ff7a8a';

  const STYLES = [
    { id: 'blazing', name: '熱血', en: 'BLAZING', color: '#ff3b30', bg: '#ffd23f', desc: '音量全開、永不放棄的熱血派' },
    { id: 'cool', name: '冷酷', en: 'COOL', color: '#2f6fff', bg: '#8fe0ff', desc: '話不多，但每句都很有份量' },
    { id: 'healing', name: '療癒', en: 'HEALING', color: '#2fbf71', bg: '#b8f2cf', desc: '溫柔慢語，聽了就想放鬆' },
    { id: 'chuuni', name: '中二', en: 'CHUUNI', color: '#8f5cff', bg: '#cdb8ff', desc: '封印之力即將覺醒……' },
    { id: 'genki', name: '元氣', en: 'GENKI', color: '#ff7a00', bg: '#ffb3d6', desc: '活力滿點，永遠在興奮' }
  ];

  const CHARS = [
    { id: 'blazing-m', style: 'blazing', gender: 'm', name: '赤城 烈', en: 'RETSU', line: '燃燒吧！我的聲音要傳到每一個人的心裡！', hair: '#ff4b2b', hairShade: '#c8161d', iris: '#ffb300', outfit: '#22223a', outfit2: '#ff4b2b', emotion: 'happy', tone: 'strong' },
    { id: 'blazing-f', style: 'blazing', gender: 'f', name: '緋村 焰', en: 'HOMURA', line: '熱血全開！今天也要拿下第一名！', hair: '#ff5a36', hairShade: '#c41f1f', iris: '#ffc21a', outfit: '#2a2238', outfit2: '#ff5a36', emotion: 'happy', tone: 'strong' },
    { id: 'cool-m', style: 'cool', gender: 'm', name: '冰室 蒼', en: 'AO', line: '安靜。接下來的話，我只說一次。', hair: '#c9d6ee', hairShade: '#8a9cc4', iris: '#2f6fff', outfit: '#26324d', outfit2: '#e8f0ff', emotion: 'calm', tone: 'flat' },
    { id: 'cool-f', style: 'cool', gender: 'f', name: '雪代 凜', en: 'RIN', line: '情緒波動？那種東西，我沒有。', hair: '#3c4a78', hairShade: '#232c4d', iris: '#38c6ff', outfit: '#1f2a44', outfit2: '#e8f0ff', emotion: 'calm', tone: 'flat' },
    { id: 'healing-m', style: 'healing', gender: 'm', name: '森野 柚', en: 'YUZU', line: '辛苦了，先喝口熱茶，慢慢來就好。', hair: '#e6b980', hairShade: '#b9834a', iris: '#3fae7f', outfit: '#fff1d6', outfit2: '#ffffff', emotion: 'calm', tone: 'gentle' },
    { id: 'healing-f', style: 'healing', gender: 'f', name: '桃瀨 蜜', en: 'MITSU', line: '今天也很努力了呢，給你一個大大的抱抱～', hair: '#ffb3d1', hairShade: '#ee7fa8', iris: '#e8558f', outfit: '#fff1d6', outfit2: '#ffffff', emotion: 'happy', tone: 'gentle' },
    { id: 'chuuni-m', style: 'chuuni', gender: 'm', name: '黑翼 冥', en: 'MEI', line: '吾之右眼……又在隱隱作痛了。', hair: '#2d1b4e', hairShade: '#150b2b', iris: '#b44dff', outfit: '#17151f', outfit2: '#7b3dff', emotion: 'calm', tone: 'strong' },
    { id: 'chuuni-f', style: 'chuuni', gender: 'f', name: '月詠 黯', en: 'KURO', line: '契約已經成立了，凡人，你逃不掉的。', hair: '#3a2466', hairShade: '#1c1036', iris: '#e0245e', iris2: '#ffd400', outfit: '#17151f', outfit2: '#7b3dff', emotion: 'calm', tone: 'strong' },
    { id: 'genki-m', style: 'genki', gender: 'm', name: '日向 陽太', en: 'HINATA', line: '衝衝衝！今天的直播也要元氣滿滿！', hair: '#ffa62b', hairShade: '#d97800', iris: '#1e9bff', outfit: '#2ec4b6', outfit2: '#ffffff', emotion: 'happy', tone: 'strong' },
    { id: 'genki-f', style: 'genki', gender: 'f', name: '星野 晴', en: 'HARE', line: '耶～大家早安安！今天也一起開心吧！', hair: '#ffc93c', hairShade: '#f08c00', iris: '#00b37a', outfit: '#ff5ca8', outfit2: '#ffffff', emotion: 'happy', tone: 'strong' }
  ];

  /* ---------- 頭髮 ---------- */
  const BACK_SHORT = '<path d="M46 120 L42 84 C44 56 66 36 100 36 C134 36 156 56 158 84 L154 120Z"/>';
  const BACK_BASE = '<path d="M44 98 C40 50 66 22 100 22 C134 22 160 50 156 98 L158 136 L42 136Z"/>';
  const LOCKS = '<path d="M50 80 C42 112 42 148 48 182 L62 166 C56 136 56 110 60 86Z"/>' +
    '<path d="M150 80 C158 112 158 148 152 182 L138 166 C144 136 144 110 140 86Z"/>';
  const AHOGE = '<path d="M98 24 C90 8 104 0 118 4 C106 8 102 14 104 24Z"/>';
  const SCALLOP = '<path d="M44 102 C34 50 66 18 100 18 C134 18 166 50 156 102 C152 92 146 84 138 82 C136 92 128 96 120 92 C118 82 110 78 100 80 C92 78 84 82 80 92 C72 96 64 92 62 82 C54 84 48 92 44 102Z"/>';
  const TWIN_TAILS = '<path d="M54 48 C12 46 4 120 18 170 C24 190 20 206 30 216 C42 182 36 142 50 112 C58 92 62 72 60 56Z"/>' +
    '<path d="M146 48 C188 46 196 120 182 170 C176 190 180 206 170 216 C158 182 164 142 150 112 C142 92 138 72 140 56Z"/>';

  const HAIR = {
    'blazing-m': {
      back: BACK_SHORT,
      front: '<path d="M44 100 L30 66 L50 68 L38 34 L66 46 L70 12 L92 36 L110 6 L120 38 L144 16 L140 48 L168 40 L152 70 L172 74 L156 100 L148 76 L138 92 L130 70 L118 90 L108 66 L98 88 L86 66 L76 90 L68 72 L58 94 L52 76Z"/>'
    },
    'blazing-f': {
      back: BACK_BASE + '<path d="M118 34 C164 6 200 52 188 112 C182 146 192 172 178 204 C170 168 160 146 156 114 C152 82 144 58 118 44Z"/>',
      front: '<path d="M44 100 C36 52 64 20 100 20 C136 20 164 52 156 100 L150 74 L140 90 L134 64 L120 86 L112 58 L100 84 L90 58 L80 86 L68 62 L60 90 L52 72Z"/>' + LOCKS
    },
    'cool-m': {
      back: BACK_SHORT,
      front: '<path d="M44 104 C36 50 66 18 104 18 C142 18 166 48 156 104 C152 88 148 78 142 70 C138 84 132 92 124 96 C128 84 128 72 124 62 C112 80 96 90 74 94 C84 84 90 74 92 66 C80 78 64 90 50 104Z"/>'
    },
    'cool-f': {
      back: '<path d="M40 92 C34 50 64 20 100 20 C136 20 166 50 160 92 L168 228 L32 228Z"/>',
      front: '<path d="M44 104 C38 50 66 20 100 20 C134 20 162 50 156 104 L154 84 L46 84Z"/>' +
        '<path d="M46 84 L42 180 L58 180 L60 84Z"/><path d="M154 84 L158 180 L142 180 L140 84Z"/>'
    },
    'healing-m': { back: BACK_SHORT, front: SCALLOP },
    'healing-f': {
      back: '<path d="M40 92 C30 50 64 18 100 18 C136 18 170 50 160 92 C172 120 158 140 172 166 C184 190 166 210 176 228 L24 228 C34 210 16 190 28 166 C42 140 28 120 40 92Z"/>',
      front: SCALLOP + LOCKS
    },
    'chuuni-m': {
      back: BACK_SHORT,
      front: '<path d="M42 104 L34 70 L50 66 L42 36 L70 42 L78 12 L96 34 L118 8 L124 40 L150 26 L146 54 L170 60 L156 100 L148 80 L136 92 L126 70 L112 90 L100 68 L84 92 L70 78 L66 122 L56 96 L50 112Z"/>'
    },
    'chuuni-f': {
      back: '<path d="M40 92 C34 50 64 20 100 20 C136 20 166 50 160 92 L172 228 L156 212 L144 230 L128 214 L114 230 L100 214 L86 230 L72 214 L56 230 L44 212 L28 228Z"/>',
      front: '<path d="M44 100 C38 50 66 20 100 20 C134 20 162 50 156 100 L150 78 L136 90 L130 70 L116 88 L104 66 L92 88 L80 70 L70 92 L62 76 L54 96Z"/>' + LOCKS
    },
    'genki-m': {
      back: BACK_SHORT,
      front: '<path d="M44 102 L36 72 L52 74 L46 44 L70 52 L78 24 L96 42 L112 20 L120 44 L144 32 L142 58 L164 58 L156 102 L150 82 L140 94 L132 74 L118 92 L108 72 L98 92 L86 74 L76 94 L66 76 L58 96 L50 82Z"/>' + AHOGE
    },
    'genki-f': {
      back: BACK_BASE + TWIN_TAILS,
      front: '<path d="M44 102 C36 52 64 22 100 22 C136 22 164 52 156 102 L148 80 L138 92 L130 72 L116 90 L106 70 L96 90 L86 70 L76 92 L66 74 L58 94 L52 80Z"/>' + LOCKS + AHOGE
    }
  };

  const stroke = (w = 3) => `stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

  function starPoints(cx, cy, R, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r : R;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  function flower(cx, cy) {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      s += `<circle cx="${(cx + 7 * Math.cos(a)).toFixed(1)}" cy="${(cy + 7 * Math.sin(a)).toFixed(1)}" r="6" fill="#fff" ${stroke(2.5)}/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#ffd23f" ${stroke(2)}/>`;
  }

  /* ---------- 眼睛 ---------- */
  function eye(cx, cy, side, emo, iris, female) {
    const o = side; // 外側方向：左眼 -1、右眼 +1
    let s = '';
    if (emo === 'happy') {
      s += `<path d="M${cx - 12} ${cy + 3} Q${cx} ${cy - 13} ${cx + 12} ${cy + 3}" fill="none" ${stroke(4.5)}/>`;
      if (female) s += `<path d="M${cx + o * 11} ${cy - 1} L${cx + o * 18} ${cy - 5}" fill="none" ${stroke(3.5)}/>`;
      return s;
    }
    const sur = emo === 'surprised';
    s += `<ellipse cx="${cx}" cy="${cy}" rx="${sur ? 13 : 12}" ry="${sur ? 15 : 14}" fill="#fff" ${stroke(2.5)}/>`;
    if (sur) {
      s += `<ellipse cx="${cx}" cy="${cy + 1}" rx="6" ry="7.5" fill="${iris}"/>` +
        `<circle cx="${cx}" cy="${cy + 1}" r="2.6" fill="${OUT}"/>` +
        `<circle cx="${cx - 2}" cy="${cy - 2}" r="1.8" fill="#fff"/>`;
    } else {
      s += `<ellipse cx="${cx}" cy="${cy + 2}" rx="9" ry="11.5" fill="${iris}"/>` +
        `<ellipse cx="${cx}" cy="${cy + 3}" rx="4.5" ry="6" fill="${OUT}"/>` +
        `<circle cx="${cx - 4}" cy="${cy - 3}" r="3.2" fill="#fff"/>` +
        `<circle cx="${cx + 4}" cy="${cy + 7}" r="1.6" fill="#fff"/>`;
    }
    if (emo === 'angry' || emo === 'sad') {
      const innerX = cx - o * 15, outerX = cx + o * 15;
      const innerY = emo === 'angry' ? cy - 3 : cy - 13;
      const outerY = emo === 'angry' ? cy - 13 : cy - 3;
      s += `<path d="M${innerX} ${innerY} L${outerX} ${outerY} L${outerX} ${cy - 22} L${innerX} ${cy - 22}Z" fill="${SKIN}"/>`;
      s += `<path d="M${innerX} ${innerY} L${outerX} ${outerY}" fill="none" ${stroke(4.5)}/>`;
      if (female) s += `<path d="M${outerX} ${outerY} L${outerX + o * 6} ${outerY - 4}" fill="none" ${stroke(3.5)}/>`;
      if (emo === 'sad' && side < 0) {
        s += `<path d="M${cx - 8} ${cy + 14} Q${cx - 13} ${cy + 22} ${cx - 8} ${cy + 26} Q${cx - 3} ${cy + 22} ${cx - 8} ${cy + 14}Z" fill="#7fd3ff" ${stroke(1.5)}/>`;
      }
    } else {
      s += `<path d="M${cx - 14} ${cy - 7} Q${cx} ${cy - (sur ? 23 : 20)} ${cx + 14} ${cy - 7}" fill="none" ${stroke(4.5)}/>`;
      if (female) s += `<path d="M${cx + o * 13} ${cy - 8} L${cx + o * 20} ${cy - 13}" fill="none" ${stroke(3.5)}/>`;
    }
    return s;
  }

  function brows(emo, color) {
    const d = {
      calm: ['M64 88 Q76 82 88 86', 'M112 86 Q124 82 136 88'],
      happy: ['M64 84 Q76 78 88 82', 'M112 82 Q124 78 136 84'],
      angry: ['M64 80 L90 90', 'M110 90 L136 80'],
      sad: ['M64 90 L88 81', 'M112 81 L136 90'],
      surprised: ['M64 80 Q76 71 88 77', 'M112 77 Q124 71 136 80']
    }[emo] || [];
    return d.map(p => `<path d="${p}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>`).join('');
  }

  /* ---------- 嘴巴 ---------- */
  function mouthClosed(emo) {
    switch (emo) {
      case 'happy': return `<path d="M89 142 Q100 156 111 142 Q100 146 89 142Z" fill="${MOUTH}" ${stroke(2.5)}/>`;
      case 'angry': return `<path d="M91 149 Q100 142 109 149" fill="none" ${stroke(3)}/>`;
      case 'sad': return `<path d="M92 150 Q100 144 108 150" fill="none" ${stroke(3)}/>`;
      case 'surprised': return `<ellipse cx="100" cy="148" rx="4" ry="5" fill="${MOUTH}" ${stroke(2.5)}/>`;
      default: return `<path d="M93 146 Q100 150 107 146" fill="none" ${stroke(3)}/>`;
    }
  }

  function mouthOpen(emo) {
    const tongue = `<path d="M93 156 Q100 150 107 156 Q100 162 93 156Z" fill="${TONGUE}"/>`;
    switch (emo) {
      case 'angry':
        return `<path d="M86 140 L114 140 Q112 162 100 162 Q88 162 86 140Z" fill="${MOUTH}" ${stroke(2.5)}/>` +
          `<path d="M88 141.5 L112 141.5 L111 146 L89 146Z" fill="#fff"/>`;
      case 'sad':
        return `<ellipse cx="100" cy="149" rx="7" ry="6" fill="${MOUTH}" ${stroke(2.5)}/>`;
      case 'surprised':
        return `<ellipse cx="100" cy="150" rx="8" ry="10" fill="${MOUTH}" ${stroke(2.5)}/>`;
      case 'happy':
        return `<path d="M86 141 Q100 143 114 141 Q112 163 100 163 Q88 163 86 141Z" fill="${MOUTH}" ${stroke(2.5)}/>` + tongue;
      default:
        return `<path d="M89 142 Q100 140 111 142 Q109 159 100 160 Q91 159 89 142Z" fill="${MOUTH}" ${stroke(2.5)}/>` + tongue;
    }
  }

  /* ---------- 身體與服裝 ---------- */
  function body(c) {
    const f = c.gender === 'f';
    const shoulders = f
      ? 'M36 240 C40 210 62 194 90 190 L110 190 C138 194 160 210 164 240Z'
      : 'M24 240 C28 208 56 192 88 188 L112 188 C144 192 172 208 176 240Z';
    let s = `<path d="M87 150 L87 194 L113 194 L113 150Z" fill="${SKIN_SHADE}" ${stroke()}/>`;
    s += `<path d="${shoulders}" fill="${c.outfit}" ${stroke()}/>`;
    switch (c.style) {
      case 'blazing':
        s += `<path d="M88 189 L100 218 L112 189Z" fill="${c.outfit2}" ${stroke()}/>` +
          `<path d="M80 192 L94 240 M120 192 L106 240" fill="none" ${stroke(2.5)}/>`;
        break;
      case 'cool':
        s += `<path d="M82 180 L118 180 L122 200 L100 206 L78 200Z" fill="${c.outfit2}" ${stroke()}/>`;
        break;
      case 'healing':
        s += `<ellipse cx="89" cy="195" rx="13" ry="8" fill="#fff" ${stroke(2.5)}/><ellipse cx="111" cy="195" rx="13" ry="8" fill="#fff" ${stroke(2.5)}/>`;
        if (f) s += `<path d="M100 202 L86 194 L86 210Z M100 202 L114 194 L114 210Z" fill="#ff8fb8" ${stroke(2.5)}/><circle cx="100" cy="202" r="3.5" fill="#ff8fb8" ${stroke(2)}/>`;
        break;
      case 'chuuni':
        s += `<path d="M58 200 L82 182 L100 204 L118 182 L142 200 L124 216 L100 208 L76 216Z" fill="${c.outfit2}" ${stroke()}/>` +
          `<circle cx="100" cy="208" r="4.5" fill="#e0245e" ${stroke(2)}/>`;
        break;
      case 'genki':
        s += `<path d="M92 194 L90 220 M108 194 L110 220" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` +
          `<circle cx="90" cy="222" r="3.5" fill="#fff" ${stroke(2)}/><circle cx="110" cy="222" r="3.5" fill="#fff" ${stroke(2)}/>`;
        break;
    }
    return s;
  }

  /* ---------- 配件 ---------- */
  function extras(c) {
    switch (c.id) {
      case 'blazing-m':
        return `<path d="M44 66 C70 52 130 52 156 66 L156 78 C130 64 70 64 44 78Z" fill="${c.outfit2}" ${stroke()}/>` +
          `<path d="M46 70 L16 62 L22 76 L8 86 L44 78Z" fill="${c.outfit2}" ${stroke()}/>`;
      case 'blazing-f':
        return `<circle cx="124" cy="34" r="9" fill="#ffd23f" ${stroke()}/>`;
      case 'cool-m':
        return `<g fill="rgba(255,255,255,.2)" ${stroke(2.5)}><rect x="58" y="95" width="36" height="27" rx="7"/><rect x="106" y="95" width="36" height="27" rx="7"/></g>` +
          `<path d="M94 104 L106 104" fill="none" ${stroke(2.5)}/>`;
      case 'cool-f':
        return `<path d="M56 60 L78 46" fill="none" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/>` +
          `<path d="M56 60 L78 46" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
      case 'healing-m':
        return `<path d="M102 20 C102 12 103 8 105 4" fill="none" ${stroke()}/>` +
          `<path d="M105 6 C113 -2 125 2 123 8 C117 12 109 12 105 6Z" fill="#5ccf7a" ${stroke(2.5)}/>`;
      case 'healing-f':
        return flower(146, 58);
      case 'chuuni-m':
        return `<path d="M48 82 L112 100 M136 100 L156 90" fill="none" ${stroke()}/>` +
          `<ellipse cx="124" cy="108" rx="16" ry="14" fill="#1d1d27" ${stroke()}/>` +
          `<circle cx="124" cy="108" r="5" fill="none" stroke="#b44dff" stroke-width="2"/>`;
      case 'chuuni-f':
        return `<path d="M137 30 h6 v8 h8 v6 h-8 v14 h-6 v-14 h-8 v-6 h8z" fill="#e0245e" ${stroke(2)}/>` +
          `<g transform="rotate(-20 134 136)"><rect x="122" y="131" width="24" height="9" rx="3" fill="#fff" ${stroke(2)}/><path d="M131 133 v5 M137 133 v5" stroke="#bbb" stroke-width="1.5"/></g>`;
      case 'genki-m':
        return `<rect x="89" y="119" width="22" height="8" rx="3" fill="#ffd9a8" ${stroke(2)}/>`;
      case 'genki-f':
        return `<circle cx="56" cy="52" r="7" fill="#ff5ca8" ${stroke(2.5)}/><circle cx="144" cy="52" r="7" fill="#ff5ca8" ${stroke(2.5)}/>` +
          `<polygon points="${starPoints(66, 62, 9, 4)}" fill="#fff36b" ${stroke(2)}/>`;
      default:
        return '';
    }
  }

  /* ---------- 漫畫情緒符號 ---------- */
  function fx(emo) {
    switch (emo) {
      case 'angry':
        return `<g transform="translate(160 44)" fill="none" stroke="#e8112d" stroke-width="3.5" stroke-linecap="round"><path d="M-9 -3 Q-3 -3 -3 -9 M3 -9 Q3 -3 9 -3 M9 3 Q3 3 3 9 M-3 9 Q-3 3 -9 3"/></g>`;
      case 'happy':
        return `<polygon points="${starPoints(168, 52, 9, 3)}" fill="#fff" ${stroke(2)}/><polygon points="${starPoints(32, 64, 6, 2)}" fill="#fff" ${stroke(2)}/>`;
      case 'sad':
        return `<path d="M78 44 L78 60 M90 40 L90 62 M102 40 L102 62 M114 44 L114 60" fill="none" stroke="#4b5bff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
      case 'surprised':
        return `<path d="M158 40 L170 28 M164 54 L180 50 M150 30 L153 16" fill="none" ${stroke(3.5)}/>`;
      default:
        return '';
    }
  }

  function blush(c, emo) {
    const strong = emo === 'happy' || c.style === 'healing' || c.style === 'genki';
    let s = `<g fill="#ff8fa3" opacity="${strong ? 0.6 : 0.35}"><ellipse cx="66" cy="132" rx="9" ry="5"/><ellipse cx="134" cy="132" rx="9" ry="5"/></g>`;
    if (strong) {
      s += `<path d="M61 134 L64 129 M66 134 L69 129 M71 134 L74 129 M126 134 L129 129 M131 134 L134 129 M136 134 L139 129" fill="none" stroke="#e8557a" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    return s;
  }

  function get(id) { return CHARS.find(c => c.id === id) || null; }
  function styleOf(c) { return STYLES.find(s => s.id === (c && c.style)) || STYLES[0]; }

  function render(id, opts) {
    opts = opts || {};
    const c = get(id) || CHARS[0];
    const emo = opts.emotion || c.emotion || 'calm';
    const st = styleOf(c);
    const female = c.gender === 'f';
    const h = HAIR[c.id];
    const irisR = c.iris2 || c.iris;
    return `<svg class="char-svg${opts.open ? ' is-open' : ''}" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${c.name}（${st.name}・${female ? '女' : '男'}）">` +
      `<g class="c-back" fill="${c.hairShade}" ${stroke()}>${h.back}</g>` +
      `<g class="c-body">${body(c)}</g>` +
      `<g class="c-head">` +
        `<ellipse cx="50" cy="108" rx="8" ry="12" fill="${SKIN}" ${stroke()}/><ellipse cx="150" cy="108" rx="8" ry="12" fill="${SKIN}" ${stroke()}/>` +
        `<path d="M50 84 C50 132 72 166 100 172 C128 166 150 132 150 84 C150 50 128 34 100 34 C72 34 50 50 50 84Z" fill="${SKIN}" ${stroke()}/>` +
        blush(c, emo) +
        `<path d="M101 122 Q99 126 97 127" fill="none" stroke="#d99a7c" stroke-width="2" stroke-linecap="round"/>` +
        `<g class="c-eyes">${eye(76, 108, -1, emo, c.iris, female)}${eye(124, 108, 1, emo, irisR, female)}</g>` +
        `<g class="m-closed">${mouthClosed(emo)}</g><g class="m-open">${mouthOpen(emo)}</g>` +
        `<g class="c-front" fill="${c.hair}" ${stroke()}>${h.front}</g>` +
        `<g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"><path d="M64 50 Q74 38 88 35"/><path d="M114 34 Q126 36 134 44"/></g>` +
        extras(c) +
        brows(emo, c.hairShade) +
        fx(emo) +
      `</g></svg>`;
  }

  // 說話時讓嘴巴隨機開合
  class Talker {
    constructor(getSvg) {
      this.getSvg = getSvg;
      this.timer = null;
    }
    start() {
      if (this.timer) return;
      const tick = () => {
        const svg = this.getSvg();
        if (svg) svg.classList.toggle('is-open');
        this.timer = setTimeout(tick, 70 + Math.random() * 110);
      };
      tick();
    }
    stop() {
      clearTimeout(this.timer);
      this.timer = null;
      const svg = this.getSvg();
      if (svg) svg.classList.remove('is-open');
    }
  }

  VS.characters = { STYLES, CHARS, get, styleOf, render, Talker };
})(window.VS);
