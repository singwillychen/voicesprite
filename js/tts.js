/* 文字轉語音頁 */
(function (VS) {
  'use strict';

  const $ = VS.$, C = VS.characters;
  const PHRASES = [
    '大家好，歡迎來到直播間！',
    '謝謝你的禮物，愛你喔！',
    '這波我先上了，大家跟緊！',
    '咦？剛剛發生了什麼事？',
    '今天的直播就到這裡，我們明天見～'
  ];
  const IDLE_BUBBLE = '按下播放，我就開始說話！';

  const state = {
    engineId: VS.prefs.get('engine', 'webspeech'),
    charId: VS.prefs.get('character', 'blazing-m'),
    profile: null,
    voiceURI: VS.prefs.get('voice', 'auto'),
    emotion: 'calm',
    tone: 'flat',
    speaking: false
  };
  if (!C.get(state.charId)) state.charId = 'blazing-m';
  const startChar = C.get(state.charId);
  state.emotion = VS.prefs.get('emotion', startChar.emotion);
  state.tone = VS.prefs.get('tone', startChar.tone);

  const talker = new C.Talker(() => $('#stageChar .char-svg'));

  function engine() {
    const e = VS.engines.get(state.engineId);
    return e && e.isAvailable() ? e : VS.engines.get('webspeech');
  }

  function options() {
    const c = C.get(state.charId);
    return {
      voiceURI: state.voiceURI,
      emotion: state.emotion,
      tone: state.tone,
      rate: Number($('#rate').value),
      pitchShift: Number($('#pitch').value),
      volume: Number($('#volume').value) / 100,
      genderHint: c.gender === 'f' ? 'female' : 'male'
    };
  }

  /* ---------- 引擎 ---------- */
  function renderEngines() {
    if (!engine() || engine().id !== state.engineId) state.engineId = 'webspeech';
    $('#engineList').innerHTML = VS.engines.list.map(e => {
      const ok = e.isAvailable();
      return `<label class="engine-opt${ok ? '' : ' is-disabled'}">
        <input type="radio" name="engine" value="${e.id}" ${e.id === state.engineId ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <span class="engine-name">${e.name}</span>
        <span>${e.description}</span>
        ${ok ? '' : '<span><span class="tag tag-soon">即將推出</span></span>'}
      </label>`;
    }).join('');
  }

  $('#engineList').addEventListener('change', e => {
    if (e.target.name !== 'engine') return;
    stop();
    state.engineId = e.target.value;
    VS.prefs.set('engine', state.engineId);
    updateCapabilities();
    loadVoices();
  });

  function updateCapabilities() {
    const caps = engine().capabilities;
    $('#btnDownload').disabled = !caps.download;
    $('#downloadNote').textContent = caps.download
      ? ''
      : '引擎 A 由作業系統直接播放，瀏覽器無法錄下合成語音，所以暫時不能下載。直播請用 OBS「桌面音訊」或虛擬音訊裝置收音；下載功能會在引擎 B／本地引擎推出時開放。';
  }

  /* ---------- 角色 ---------- */
  function renderStage() {
    const c = C.get(state.charId);
    const st = C.styleOf(c);
    $('#stage').style.setProperty('--stage-bg', st.bg);
    $('#stageChar').innerHTML = C.render(c.id, { emotion: state.emotion });
    $('#stageName').textContent = `${c.name}・${st.name}`;
  }

  function renderCharStrip() {
    $('#charStrip').innerHTML = C.CHARS.map(c => `
      <button type="button" class="char-mini" data-id="${c.id}" aria-pressed="${c.id === state.charId}"
        style="--mini-bg:${C.styleOf(c).bg}" title="${c.name}（${C.styleOf(c).name}・${c.gender === 'f' ? '女' : '男'}）">
        ${C.render(c.id)}
      </button>`).join('');
  }

  $('#charStrip').addEventListener('click', e => {
    const b = e.target.closest('.char-mini');
    if (!b || b.dataset.id === state.charId) return;
    const prev = C.get(state.charId);
    const c = C.get(b.dataset.id);
    state.charId = c.id;
    VS.prefs.set('character', c.id);
    // 換角色時套用角色預設的情緒與語氣
    setEmotion(c.emotion);
    setTone(c.tone);
    const text = $('#ttsText');
    if (!text.value.trim() || text.value === prev.line) { text.value = c.line; onTextInput(); }
    VS.$$('.char-mini').forEach(el => el.setAttribute('aria-pressed', el.dataset.id === c.id));
    renderStage();
    updateReadout();
    syncLive({ talking: false, text: '' });
  });

  /* ---------- 特徵檔與語音 ---------- */
  async function loadProfiles() {
    const list = await VS.profileStore.list().catch(() => []);
    const active = VS.prefs.get('profile', '');
    const sel = $('#profileSelect');
    sel.innerHTML = '<option value="">不使用（系統預設聲線）</option>' +
      list.map(p => `<option value="${p.id}">${VS.escapeHtml(p.name)}</option>`).join('');
    state.profile = list.find(p => p.id === active) || null;
    sel.value = state.profile ? state.profile.id : '';
    renderProfileSummary();
  }

  function renderProfileSummary() {
    const p = state.profile;
    if (!p) {
      $('#profileSummary').innerHTML = '<span class="small muted">未選擇特徵檔時，會依角色性別挑選語音。</span>';
      return;
    }
    const s = p.summary || VS.features.summarize(p.features);
    $('#profileSummary').innerHTML = [
      `音高 ${s.pitch}`, `語速 ${s.rate}`, `音色 ${s.timbre}`, `${Math.round(p.features.f0.median)} Hz`
    ].map(t => `<span class="tag">${VS.escapeHtml(t)}</span>`).join('');
  }

  $('#profileSelect').addEventListener('change', async e => {
    VS.prefs.set('profile', e.target.value);
    state.profile = e.target.value ? await VS.profileStore.get(e.target.value) : null;
    renderProfileSummary();
    updateReadout();
  });

  async function loadVoices() {
    const sel = $('#voiceSelect');
    const e = engine();
    await e.loadVoices();
    const voices = e.listVoices();
    if (!voices.length) {
      sel.innerHTML = '<option value="auto">找不到中文語音，將使用系統預設</option>';
    } else {
      sel.innerHTML = '<option value="auto">自動（依聲線特徵挑選）</option>' +
        voices.map(v => `<option value="${VS.escapeHtml(v.voiceURI)}">${VS.escapeHtml(v.name)}（${v.lang}）</option>`).join('');
    }
    if (!voices.some(v => v.voiceURI === state.voiceURI)) state.voiceURI = 'auto';
    sel.value = state.voiceURI;
    updateReadout();
  }

  $('#voiceSelect').addEventListener('change', e => {
    state.voiceURI = e.target.value;
    VS.prefs.set('voice', state.voiceURI);
    updateReadout();
  });

  /* ---------- 情緒／語氣／滑桿 ---------- */
  function renderSeg(el, items, current) {
    el.innerHTML = items.map(i => `<button type="button" class="chip" data-value="${i.id}" aria-pressed="${i.id === current}">${i.name}</button>`).join('');
  }

  function setEmotion(id) {
    state.emotion = id;
    VS.prefs.set('emotion', id);
    renderSeg($('#emotionSeg'), VS.EMOTIONS, id);
  }

  function setTone(id) {
    state.tone = id;
    VS.prefs.set('tone', id);
    renderSeg($('#toneSeg'), VS.TONES, id);
  }

  $('#emotionSeg').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setEmotion(b.dataset.value);
    renderStage();
    updateReadout();
    syncLive({ talking: false, text: '' });
  });

  $('#toneSeg').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setTone(b.dataset.value);
    updateReadout();
  });

  function updateSliders() {
    $('#rateVal').textContent = Number($('#rate').value).toFixed(2) + '×';
    const p = Number($('#pitch').value);
    $('#pitchVal').textContent = (p > 0 ? '+' : '') + p;
    $('#volumeVal').textContent = $('#volume').value + '%';
  }

  ['rate', 'pitch', 'volume'].forEach(id => {
    const el = $('#' + id);
    el.value = VS.prefs.get('slider.' + id, el.value);
    el.addEventListener('input', () => {
      VS.prefs.set('slider.' + id, el.value);
      updateSliders();
      updateReadout();
    });
  });

  function updateReadout() {
    const d = engine().describe(state.profile, options());
    if (!d) { $('#readout').textContent = ''; return; }
    const g = { female: '女聲', male: '男聲', unknown: '性別未知' }[d.voiceGender];
    $('#readout').textContent = `實際套用：${d.voiceName ? `${d.voiceName}（${g}）` : '系統預設語音'}｜音高 ×${d.pitch.toFixed(2)}｜語速 ×${d.rate.toFixed(2)}｜音量 ${Math.round(d.volume * 100)}%`;
  }

  /* ---------- 文字 ---------- */
  function onTextInput() {
    const v = $('#ttsText').value;
    $('#charCount').textContent = `${v.length} / 500`;
    VS.prefs.set('ttsText', v);
  }

  $('#ttsText').addEventListener('input', onTextInput);
  $('#ttsText').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); play(); }
  });

  $('#phrases').innerHTML = PHRASES.map(p => `<button type="button" class="chip">${p}</button>`).join('');
  $('#phrases').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $('#ttsText').value = b.textContent;
    onTextInput();
  });

  /* ---------- 播放 ---------- */
  function syncLive(extra) {
    if (!$('#syncLive').checked) return;
    VS.broadcast(Object.assign({ type: 'state', charId: state.charId, emotion: state.emotion }, extra));
  }

  function setSpeaking(on) {
    state.speaking = on;
    $('#btnStop').disabled = !on;
    $('#btnPlay').textContent = on ? '▶ 重新播放' : '▶ 播放';
    $('#stage').classList.toggle('talking', on);
  }

  function play() {
    const text = $('#ttsText').value.trim();
    if (!text) { VS.toast('請先輸入要說的話'); $('#ttsText').focus(); return; }
    const e = engine();
    setSpeaking(true);
    e.speak(text, state.profile, options(), {
      onSentence: s => {
        $('#bubble').textContent = s;
        talker.start();
        syncLive({ talking: true, text: s });
      },
      onPause: () => {
        talker.stop();
        syncLive({ talking: false, text: $('#bubble').textContent });
      },
      onEnd: () => {
        talker.stop();
        setSpeaking(false);
        $('#bubble').textContent = IDLE_BUBBLE;
        syncLive({ talking: false, text: '' });
      }
    }).catch(err => VS.toast('播放失敗：' + err.message, 'error'));
  }

  function stop() {
    const e = engine();
    if (e) e.stop();
  }

  $('#btnPlay').addEventListener('click', play);
  $('#btnStop').addEventListener('click', stop);
  $('#btnDownload').addEventListener('click', async () => {
    const e = engine();
    if (!e.capabilities.download || !e.synthesize) return;
    try {
      const blob = await e.synthesize($('#ttsText').value.trim(), state.profile, options());
      VS.downloadBlob(blob, 'voicesprite-' + Date.now() + '.wav');
    } catch (err) {
      VS.toast('下載失敗：' + err.message, 'error');
    }
  });

  $('#syncLive').checked = VS.prefs.get('syncLive', false);
  $('#syncLive').addEventListener('change', e => {
    VS.prefs.set('syncLive', e.target.checked);
    if (e.target.checked) syncLive({ talking: false, text: '' });
  });

  window.addEventListener('pagehide', stop);

  /* ---------- 初始化 ---------- */
  if (!VS.engines.get('webspeech').isAvailable()) {
    VS.toast('這個瀏覽器不支援語音合成，請改用 Chrome、Edge 或 Safari', 'error');
  }
  renderEngines();
  updateCapabilities();
  renderCharStrip();
  setEmotion(state.emotion);
  setTone(state.tone);
  renderStage();
  updateSliders();
  $('#ttsText').value = VS.prefs.get('ttsText', '') || startChar.line;
  onTextInput();
  loadProfiles().then(loadVoices);
})(window.VS);
