/* 直播模式頁：只顯示角色與字幕，可接收文字轉語音頁的同步訊號 */
(function (VS) {
  'use strict';

  const $ = VS.$, C = VS.characters;
  const params = new URLSearchParams(location.search);
  const BGS = ['green', 'blue', 'transparent', 'pop'];

  const state = {
    charId: params.get('char') || VS.prefs.get('character', 'blazing-m'),
    bg: params.get('bg') || VS.prefs.get('liveBg', 'green'),
    sub: params.has('sub') ? params.get('sub') !== '0' : VS.prefs.get('liveSub', true),
    controls: params.get('controls') !== '0',
    emotion: null
  };
  if (!C.get(state.charId)) state.charId = 'blazing-m';
  if (!BGS.includes(state.bg)) state.bg = 'green';
  state.emotion = C.get(state.charId).emotion;

  const talker = new C.Talker(() => $('#liveChar .char-svg'));
  let renderedKey = '';
  let subTimer = null;

  function applyBody() {
    document.body.className = `live bg-${state.bg}${state.controls ? '' : ' no-controls'}`;
    $('#toggleControls').setAttribute('aria-expanded', state.controls);
  }

  function renderChar() {
    const key = state.charId + '|' + state.emotion;
    if (key === renderedKey) return;
    renderedKey = key;
    const wasTalking = !!talker.timer;
    $('#liveChar').innerHTML = C.render(state.charId, { emotion: state.emotion });
    if (wasTalking) { talker.stop(); talker.start(); }
  }

  function setSub(text) {
    clearTimeout(subTimer);
    $('#liveSub').textContent = state.sub ? text : '';
  }

  function clearSubLater() {
    clearTimeout(subTimer);
    subTimer = setTimeout(() => { $('#liveSub').textContent = ''; }, 2500);
  }

  /* ---------- 控制面板 ---------- */
  $('#ctlChar').innerHTML = C.STYLES.map(s => `<optgroup label="${s.name}">` +
    C.CHARS.filter(c => c.style === s.id)
      .map(c => `<option value="${c.id}">${c.name}（${c.gender === 'f' ? '女' : '男'}）</option>`).join('') +
    '</optgroup>').join('');
  $('#ctlEmotion').innerHTML = VS.EMOTIONS.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  function syncControls() {
    $('#ctlChar').value = state.charId;
    $('#ctlBg').value = state.bg;
    $('#ctlSub').checked = state.sub;
    $('#ctlEmotion').value = state.emotion;
  }

  $('#ctlChar').addEventListener('change', e => {
    state.charId = e.target.value;
    state.emotion = C.get(state.charId).emotion;
    VS.prefs.set('character', state.charId);
    syncControls();
    renderChar();
  });
  $('#ctlBg').addEventListener('change', e => {
    state.bg = e.target.value;
    VS.prefs.set('liveBg', state.bg);
    applyBody();
  });
  $('#ctlSub').addEventListener('change', e => {
    state.sub = e.target.checked;
    VS.prefs.set('liveSub', state.sub);
    if (!state.sub) setSub('');
  });
  $('#ctlEmotion').addEventListener('change', e => {
    state.emotion = e.target.value;
    renderChar();
  });

  function toggleControls() {
    state.controls = !state.controls;
    applyBody();
  }
  $('#toggleControls').addEventListener('click', toggleControls);
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input, select, textarea')) return;
    if (e.key === 'h' || e.key === 'H') toggleControls();
  });

  $('#ctlCopy').addEventListener('click', async () => {
    const base = location.href.split('?')[0].split('#')[0];
    const url = `${base}?char=${state.charId}&bg=${state.bg}&sub=${state.sub ? 1 : 0}&controls=0`;
    try {
      await navigator.clipboard.writeText(url);
      VS.toast('已複製直播用網址');
    } catch (e) {
      prompt('請手動複製這個網址', url);
    }
  });

  /* ---------- 直接在直播頁說話 ---------- */
  async function speakHere() {
    const text = $('#ctlText').value.trim();
    if (!text) return;
    const engine = VS.engines.get('webspeech');
    if (!engine.isAvailable()) { VS.toast('這個瀏覽器不支援語音合成', 'error'); return; }
    const c = C.get(state.charId);
    const [, profile] = await Promise.all([engine.loadVoices(), VS.profileStore.getSelected().catch(() => null)]);
    engine.speak(text, profile, {
      voiceURI: VS.prefs.get('voice', 'auto'),
      emotion: state.emotion,
      tone: c.tone,
      rate: Number(VS.prefs.get('slider.rate', 1)),
      pitchShift: Number(VS.prefs.get('slider.pitch', 0)),
      volume: Number(VS.prefs.get('slider.volume', 90)) / 100,
      genderHint: c.gender === 'f' ? 'female' : 'male'
    }, {
      onSentence: s => { setSub(s); talker.start(); },
      onPause: () => talker.stop(),
      onEnd: () => { talker.stop(); clearSubLater(); }
    }).catch(err => VS.toast('播放失敗：' + err.message, 'error'));
    $('#ctlText').value = '';
  }

  $('#ctlSpeak').addEventListener('click', speakHere);
  $('#ctlText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) speakHere(); });

  function stopAll() {
    VS.engines.get('webspeech').stop();
    player.stop();
  }
  $('#ctlStop').addEventListener('click', stopAll);

  /* ---------- 直播台詞板：已生成的播放 AI 語音，未生成的用引擎 A 即時說 ---------- */
  const player = new VS.AudioPlayer();
  let profileId = VS.prefs.get('profile', '');
  const emotionName = id => (VS.EMOTIONS.find(e => e.id === id) || VS.EMOTIONS[0]).name;

  function renderBoard() {
    profileId = VS.prefs.get('profile', '');
    const list = VS.board.list();
    $('#liveBoard').innerHTML = list.length
      ? list.map((p, i) => {
        const ready = VS.board.isReady(p, profileId);
        return `<button type="button" data-id="${p.id}" title="${VS.escapeHtml(p.text)}">
          <span class="k">${i < 9 ? i + 1 : '·'}</span><span class="t">${VS.escapeHtml(p.text)}</span>
          <span class="s${ready ? ' ok' : ''}">${ready ? 'AI' : '即時'}・${emotionName(p.emotion)}</span></button>`;
      }).join('')
      : '<p class="small muted" style="margin:0">還沒有台詞，請到「文字轉語音」頁的台詞板新增。</p>';
  }

  async function playPhrase(p) {
    stopAll();
    if (p.emotion && p.emotion !== state.emotion) { state.emotion = p.emotion; syncControls(); renderChar(); }
    const clip = VS.board.isReady(p, profileId) ? await VS.clipStore.get(p.clip.key).catch(() => null) : null;
    if (!clip) {
      $('#ctlText').value = p.text;
      speakHere();
      return;
    }
    setSub(p.text);
    await player.play(clip.samples, clip.sampleRate, {
      volume: Number(VS.prefs.get('slider.volume', 90)) / 100,
      onLevel: v => talker.level(v)
    });
    talker.stop();
    clearSubLater();
  }

  $('#liveBoard').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    const p = b && VS.board.list().find(x => x.id === b.dataset.id);
    if (p) playPhrase(p);
  });

  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input, select, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const p = VS.board.list()[Number(e.key) - 1];
    if (p) { e.preventDefault(); playPhrase(p); }
  });

  // 文字轉語音頁修改台詞板時即時更新
  window.addEventListener('storage', e => {
    if (e.key === 'vs.' + VS.board.KEY || e.key === 'vs.profile') renderBoard();
  });

  /* ---------- 接收文字轉語音頁的同步 ---------- */
  if (VS.channel) {
    VS.channel.addEventListener('message', e => {
      const m = e.data;
      if (!m || m.type !== 'state') return;
      if (m.charId && C.get(m.charId)) state.charId = m.charId;
      if (m.emotion) state.emotion = m.emotion;
      syncControls();
      renderChar();
      if (m.talking) { talker.start(); setSub(m.text || ''); }
      else {
        talker.stop();
        if (m.text) setSub(m.text); else clearSubLater();
      }
      $('#syncStatus').textContent = '已連線：正在接收文字轉語音頁的訊號';
    });
  } else {
    $('#syncStatus').textContent = '這個瀏覽器不支援頁面同步，請直接在下方輸入文字。';
  }

  window.addEventListener('pagehide', () => VS.engines.get('webspeech').stop());

  applyBody();
  syncControls();
  renderChar();
  renderBoard();
})(window.VS);
