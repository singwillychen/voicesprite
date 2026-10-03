/* 首頁：主視覺角色、角色選擇 */
(function (VS) {
  'use strict';

  const $ = VS.$, C = VS.characters;
  let selected = VS.prefs.get('character', 'blazing-m');
  if (!C.get(selected)) selected = 'blazing-m';
  let styleFilter = 'all', genderFilter = 'all';

  function speakAs(c, getSvg, onDone) {
    const engine = VS.engines.get('webspeech');
    if (!engine || !engine.isAvailable()) {
      VS.toast('這個瀏覽器不支援語音合成，請改用 Chrome、Edge 或 Safari', 'error');
      return;
    }
    const talker = new C.Talker(getSvg);
    Promise.all([engine.loadVoices(), VS.profileStore.getSelected().catch(() => null)]).then(([, profile]) => {
      engine.speak(c.line, profile, {
        emotion: c.emotion,
        tone: c.tone,
        genderHint: c.gender === 'f' ? 'female' : 'male',
        rate: 1,
        volume: 0.9
      }, {
        onSentence: () => talker.start(),
        onPause: () => talker.stop(),
        onEnd: () => { talker.stop(); if (onDone) onDone(); }
      }).catch(err => VS.toast('播放失敗：' + err.message, 'error'));
    });
  }

  function renderHero() {
    const c = C.get(selected);
    $('#heroChar').innerHTML = C.render(c.id);
    $('#heroBubble').textContent = c.line;
    $('#heroBurst').style.background = C.styleOf(c).color;
    $('#selectedName').textContent = `${c.name}（${C.styleOf(c).name}・${c.gender === 'f' ? '女' : '男'}）`;
  }

  function heroHello() {
    speakAs(C.get(selected), () => $('#heroChar .char-svg'));
  }

  function chip(label, pressed, value) {
    return `<button type="button" class="chip" data-value="${value}" aria-pressed="${pressed}">${label}</button>`;
  }

  function renderFilters() {
    $('#styleFilters').innerHTML = chip('全部風格', styleFilter === 'all', 'all') +
      C.STYLES.map(s => chip(s.name, styleFilter === s.id, s.id)).join('');
    $('#genderFilters').innerHTML = [['all', '男女都看'], ['m', '男生'], ['f', '女生']]
      .map(([v, l]) => chip(l, genderFilter === v, v)).join('');
  }

  function renderGrid() {
    const list = C.CHARS.filter(c =>
      (styleFilter === 'all' || c.style === styleFilter) && (genderFilter === 'all' || c.gender === genderFilter));
    $('#charGrid').innerHTML = list.map(c => {
      const st = C.styleOf(c);
      const sel = c.id === selected;
      return `<article class="char-card${sel ? ' is-selected' : ''}" data-id="${c.id}" style="--card-bg:${st.bg}">
        <button type="button" class="char-pick" aria-pressed="${sel}" aria-label="選擇 ${c.name}">
          <div class="char-art">${C.render(c.id)}</div>
          <div class="char-meta">
            <span class="tag" style="background:${st.color};color:#fff">${st.name}・${c.gender === 'f' ? '女' : '男'}</span>
            <h3>${c.name}</h3>
            <span class="en">${c.en}</span>
            <p>「${c.line}」</p>
          </div>
        </button>
        <button type="button" class="btn btn-sm btn-yellow char-hear">試聽 ▶</button>
      </article>`;
    }).join('');
  }

  function select(id) {
    selected = id;
    VS.prefs.set('character', id);
    VS.$$('.char-card').forEach(card => {
      const on = card.dataset.id === id;
      card.classList.toggle('is-selected', on);
      card.querySelector('.char-pick').setAttribute('aria-pressed', on);
    });
    renderHero();
  }

  $('#styleFilters').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    styleFilter = b.dataset.value;
    renderFilters();
    renderGrid();
  });
  $('#genderFilters').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    genderFilter = b.dataset.value;
    renderFilters();
    renderGrid();
  });
  $('#charGrid').addEventListener('click', e => {
    const card = e.target.closest('.char-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.char-hear')) {
      VS.$$('.char-card.talking').forEach(el => el.classList.remove('talking'));
      card.classList.add('talking');
      speakAs(C.get(id), () => card.querySelector('.char-svg'), () => card.classList.remove('talking'));
      return;
    }
    if (e.target.closest('.char-pick')) select(id);
  });
  $('#heroHello').addEventListener('click', heroHello);
  $('#heroChar').addEventListener('click', heroHello);
  window.addEventListener('pagehide', () => { const e = VS.engines.get('webspeech'); if (e) e.stop(); });

  renderHero();
  renderFilters();
  renderGrid();
})(window.VS);
