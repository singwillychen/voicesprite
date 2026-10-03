/* 文字轉語音頁 */
(function (VS) {
  'use strict';

  const $ = VS.$, C = VS.characters;
  const PHRASES = VS.lang === 'en' ? [
    'Hi everyone, welcome to the stream!',
    'Thank you so much for the gift!',
    "I'm going in first, stay close!",
    'Wait, what just happened?',
    "That's all for today, see you tomorrow!"
  ] : [
    '大家好，歡迎來到直播間！',
    '謝謝你的禮物，愛你喔！',
    '這波我先上了，大家跟緊！',
    '咦？剛剛發生了什麼事？',
    '今天的直播就到這裡，我們明天見～'
  ];
  const IDLE_BUBBLE = VS.t('按下播放，我就開始說話！');

  const state = {
    engineId: VS.prefs.get('engine', 'webspeech'),
    charId: VS.prefs.get('character', 'blazing-m'),
    profile: null,
    voiceURI: VS.prefs.get('voice', 'auto'),
    emotion: 'calm',
    tone: 'flat',
    speaking: false,
    boardBusy: false
  };
  if (!C.get(state.charId)) state.charId = 'blazing-m';
  const startChar = C.get(state.charId);
  state.emotion = VS.prefs.get('emotion', startChar.emotion);
  state.tone = VS.prefs.get('tone', startChar.tone);

  const talker = new C.Talker(() => $('#stageChar .char-svg'));
  const player = new VS.AudioPlayer();
  const engineB = VS.engines.get('zipvoice');

  function engine() {
    const e = VS.engines.get(state.engineId);
    return e && e.status !== 'planned' && e.isAvailable() ? e : VS.engines.get('webspeech');
  }

  function options(overrides) {
    const c = C.get(state.charId);
    return Object.assign({
      voiceURI: state.voiceURI,
      emotion: state.emotion,
      tone: state.tone,
      rate: Number($('#rate').value),
      pitchShift: Number($('#pitch').value),
      volume: Number($('#volume').value) / 100,
      steps: Number($('#zvSteps').value),
      textLang: VS.textLang($('#ttsText').value),
      genderHint: c.gender === 'f' ? 'female' : 'male'
    }, overrides || {});
  }

  /* ---------- 引擎 ---------- */
  function renderEngines() {
    if (engine().id !== state.engineId) state.engineId = engine().id;
    $('#engineList').innerHTML = VS.engines.list.map(e => {
      const planned = e.status === 'planned';
      const ok = !planned && e.isAvailable();
      const note = planned ? VS.t('即將推出') : (!ok && e.unavailableReason ? e.unavailableReason() : '');
      const beta = e.status === 'beta' ? ' <span class="tag tag-beta">BETA</span>' : '';
      return `<label class="engine-opt${ok ? '' : ' is-disabled'}">
        <input type="radio" name="engine" value="${e.id}" ${e.id === state.engineId ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <span class="engine-name">${e.name}${beta}</span>
        <span>${e.description}</span>
        ${note ? `<span><span class="tag tag-soon">${VS.escapeHtml(note)}</span></span>` : ''}
      </label>`;
    }).join('');
  }

  $('#engineList').addEventListener('change', e => {
    if (e.target.name !== 'engine') return;
    stop();
    state.engineId = e.target.value;
    VS.prefs.set('engine', state.engineId);
    updateEngineUI();
    loadVoices();
  });

  function updateEngineUI() {
    const caps = engine().capabilities;
    $('#btnDownload').disabled = !caps.download;
    $('#downloadNote').textContent = caps.download
      ? VS.t('下載的是 AI 生成的語音，分享時請註明。')
      : VS.t('引擎 A 由作業系統直接播放，無法下載。要下載 WAV 請切換到引擎 B；直播收音請用 OBS「桌面音訊」或虛擬音訊裝置。');
    $('#pitch').disabled = caps.pitch === false;
    $('#pitchNote').hidden = caps.pitch !== false;
    $('#voiceField').hidden = !caps.systemVoices;
    $('#modelPanel').hidden = !caps.needsModel;
    if (caps.needsModel) updateModelPanel();
    $('#localPanel').hidden = !caps.needsServer;
    if (caps.needsServer && engineLocal && engineLocal.getStatus().state === 'unknown') engineLocal.check();
    updateReadout();
    renderBoard();
  }

  /* ---------- 引擎 B 模型面板 ---------- */
  const mb = n => (n / 1048576).toFixed(0);

  async function updateModelPanel() {
    if (!engineB) return;
    const s = engineB.getStatus();
    const cached = s.state === 'idle' || s.state === 'error' ? await engineB.isCached() : true;
    const text = {
      idle: VS.t(cached ? '模型已下載，按「載入模型」即可使用（約 3 秒）。' : '尚未下載模型。'),
      downloading: s.cached ? VS.t('從快取讀取模型…') : VS.t('下載中：{a} / {b} MB', { a: mb(s.loaded), b: mb(s.total || engineB.modelSizeMB * 1048576) }),
      loading: VS.t('初始化模型中…'),
      ready: VS.t('✅ 模型就緒'),
      error: '❌ ' + s.message
    }[s.state];
    $('#modelStatus').textContent = text;
    const pct = s.state === 'ready' || s.state === 'loading' ? 100
      : s.state === 'downloading' && s.total ? s.loaded / s.total * 100 : 0;
    $('#modelBar').style.width = pct + '%';
    const btn = $('#btnModelLoad');
    btn.textContent = cached ? VS.t('載入模型') : VS.t('下載模型（約 {n} MB）', { n: engineB.modelSizeMB });
    btn.disabled = s.state === 'downloading' || s.state === 'loading' || s.state === 'ready';
  }

  async function ensureModel() {
    if (engineB.getStatus().state === 'ready') return true;
    if (!(await engineB.isCached()) &&
      !confirm(VS.t('第一次使用引擎 B 需要下載約 {n} MB 的 AI 模型（之後不用再下載）。要現在下載嗎？', { n: engineB.modelSizeMB }))) return false;
    return true;
  }

  if (engineB) {
    engineB.onStatus(() => updateModelPanel());
    $('#btnModelLoad').addEventListener('click', async () => {
      if (!(await ensureModel())) return;
      engineB.load().then(() => VS.toast(VS.t('AI 模型就緒'), 'success')).catch(err => VS.toast(VS.t('模型載入失敗：') + err.message, 'error'));
    });
    $('#btnModelClear').addEventListener('click', async () => {
      if (!confirm(VS.t('要清除已下載的 AI 模型嗎？下次使用需要重新下載約 210 MB。'))) return;
      await engineB.clearCache();
      VS.toast(VS.t('已清除模型'));
    });
  }
  /* ---------- 本地引擎（GPT-SoVITS）面板 ---------- */
  const engineLocal = VS.engines.get('local');

  function updateLocalPanel(s) {
    const text = {
      unknown: VS.t('尚未測試連線'),
      checking: VS.t('連線中…'),
      online: '✅ ' + (s.message || VS.t('已連線')),
      'bridge-only': '⚠️ ' + s.message,
      offline: '❌ ' + s.message
    }[s.state] || '';
    $('#localStatus').textContent = text;
  }

  // 本地引擎播放前先確認連線，沒連上就引導到教學頁
  async function ensureServer() {
    const s = engineLocal.getStatus().state === 'online' ? engineLocal.getStatus() : await engineLocal.check();
    if (s.state === 'online') return true;
    if (confirm(s.message + '\n\n' + VS.t('要打開「本地引擎安裝與連線教學」嗎？'))) location.href = 'local-setup.html#test';
    return false;
  }

  if (engineLocal) {
    $('#localUrl').value = engineLocal.bridgeUrl();
    engineLocal.onStatus(updateLocalPanel);
    $('#localUrl').addEventListener('change', e => {
      engineLocal.setBridgeUrl(e.target.value);
      e.target.value = engineLocal.bridgeUrl();
      updateReadout();
    });
    $('#btnLocalCheck').addEventListener('click', () => engineLocal.check());
  }

  $('#zvSteps').value = VS.prefs.get('zvSteps', '4');
  $('#zvSteps').addEventListener('change', e => { VS.prefs.set('zvSteps', e.target.value); updateReadout(); });

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
        style="--mini-bg:${C.styleOf(c).bg}" title="${C.fullLabel(c)}">
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
    sel.innerHTML = `<option value="">${VS.t('不使用（系統預設聲線）')}</option>` +
      list.map(p => `<option value="${p.id}">${VS.escapeHtml(p.name)}</option>`).join('');
    state.profile = list.find(p => p.id === active) || null;
    sel.value = state.profile ? state.profile.id : '';
    renderProfileSummary();
  }

  function renderProfileSummary() {
    const p = state.profile;
    if (!p) {
      $('#profileSummary').innerHTML = `<span class="small muted">${VS.t('未選擇特徵檔時，引擎 A 會依角色性別挑選語音；引擎 B 必須選擇特徵檔。')}</span>`;
      return;
    }
    const s = p.summary || VS.features.summarize(p.features);
    $('#profileSummary').innerHTML = [
      VS.t('音高 {v}', { v: VS.t(s.pitch) }), VS.t('語速 {v}', { v: VS.t(s.rate) }), VS.t('音色 {v}', { v: VS.t(s.timbre) }),
      `${Math.round(p.features.f0.median)} Hz`, VS.t('參考錄音 {n} 段', { n: (p.references || []).length })
    ].map(t => `<span class="tag">${VS.escapeHtml(t)}</span>`).join('');
  }

  $('#profileSelect').addEventListener('change', async e => {
    VS.prefs.set('profile', e.target.value);
    state.profile = e.target.value ? await VS.profileStore.get(e.target.value) : null;
    renderProfileSummary();
    updateReadout();
    renderBoard();
  });

  async function loadVoices() {
    const sel = $('#voiceSelect');
    const a = VS.engines.get('webspeech');
    await a.loadVoices();
    const voices = a.listVoices();
    if (!voices.length) {
      sel.innerHTML = `<option value="auto">${VS.t('找不到中文語音，將使用系統預設')}</option>`;
    } else {
      sel.innerHTML = `<option value="auto">${VS.t('自動（依聲線特徵挑選）')}</option>` +
        voices.map(v => `<option value="${VS.escapeHtml(v.voiceURI)}">${VS.escapeHtml(VS.t('{name}（{gender}）', { name: v.name, gender: v.lang }))}</option>`).join('');
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
    if (d.summary) { $('#readout').textContent = d.summary; return; }
    const g = VS.t({ female: '女聲', male: '男聲', unknown: '性別未知' }[d.voiceGender]);
    $('#readout').textContent = VS.t('實際套用：{voice}｜音高 ×{pitch}｜語速 ×{rate}｜音量 {vol}%', {
      voice: d.voiceName ? VS.t('{name}（{gender}）', { name: d.voiceName, gender: g }) : VS.t('系統預設語音'),
      pitch: d.pitch.toFixed(2), rate: d.rate.toFixed(2), vol: Math.round(d.volume * 100)
    });
  }

  /* ---------- 文字 ---------- */
  let lastTextLang = null;
  function onTextInput() {
    const v = $('#ttsText').value;
    $('#charCount').textContent = `${v.length} / 500`;
    VS.prefs.set('ttsText', v);
    // 中英文改變時，引擎 A 會換成對應語言的語音
    const tl = VS.textLang(v);
    if (tl !== lastTextLang) { lastTextLang = tl; updateReadout(); }
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
    $('#btnPlay').textContent = VS.t(on ? '▶ 重新播放' : '▶ 播放');
    $('#stage').classList.toggle('talking', on);
  }

  function playHooks(e) {
    const levelMode = e.capabilities.lipsync === 'level';
    return {
      onStatusText: t => { $('#bubble').textContent = t; },
      onSentence: s => {
        $('#bubble').textContent = s;
        if (!levelMode) talker.start();
        syncLive({ talking: true, text: s });
      },
      onLevel: v => talker.level(v),
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
    };
  }

  async function speakWith(e, text, opts) {
    if (e.capabilities.needsProfile && !state.profile) {
      VS.toast(VS.t('這個引擎需要聲線特徵檔，請先選擇或到「錄製聲紋」錄音'), 'error');
      return;
    }
    if (e.capabilities.needsModel && !(await ensureModel())) return;
    if (e.capabilities.needsServer && !(await ensureServer())) return;
    setSpeaking(true);
    e.speak(text, state.profile, opts, playHooks(e)).catch(err => VS.toast(VS.t('播放失敗：') + err.message, 'error'));
  }

  function play() {
    const text = $('#ttsText').value.trim();
    if (!text) { VS.toast(VS.t('請先輸入要說的話')); $('#ttsText').focus(); return; }
    stop();
    speakWith(engine(), text, options());
  }

  function stop() {
    VS.engines.list.forEach(e => { if (e.stop) e.stop(); });
    player.stop();
  }

  $('#btnPlay').addEventListener('click', play);
  $('#btnStop').addEventListener('click', stop);

  $('#btnDownload').addEventListener('click', async () => {
    const e = engine();
    const text = $('#ttsText').value.trim();
    if (!e.capabilities.download || !text) return;
    if (e.capabilities.needsProfile && !state.profile) {
      VS.toast(VS.t('這個引擎需要聲線特徵檔，請先選擇或到「錄製聲紋」錄音'), 'error');
      return;
    }
    if (e.capabilities.needsModel && !(await ensureModel())) return;
    if (e.capabilities.needsServer && !(await ensureServer())) return;
    const btn = $('#btnDownload');
    btn.disabled = true;
    try {
      const out = await e.synthesize(text, state.profile, options(), {
        onProgress: p => { btn.textContent = VS.t('生成中 {pct}%', { pct: Math.round(p * 100) }); }
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      VS.downloadBlob(VS.audio.wavBlob(out.samples, out.sampleRate), `voicesprite-ai-${stamp}.wav`);
    } catch (err) {
      VS.toast(VS.t('下載失敗：') + err.message, 'error');
    } finally {
      btn.textContent = VS.t('下載 WAV');
      btn.disabled = false;
    }
  });

  $('#syncLive').checked = VS.prefs.get('syncLive', false);
  $('#syncLive').addEventListener('change', e => {
    VS.prefs.set('syncLive', e.target.checked);
    if (e.target.checked) syncLive({ talking: false, text: '' });
  });

  /* ---------- 直播台詞板 ---------- */
  const emotionName = id => (VS.EMOTIONS.find(e => e.id === id) || VS.EMOTIONS[0]).name;
  const profileId = () => (state.profile ? state.profile.id : '');

  // 台詞板用目前選的 AI 引擎生成（引擎 B 或本地引擎）；選引擎 A 時改用引擎 B
  function boardEngine() {
    const e = engine();
    return e.capabilities.download ? e : engineB;
  }

  function renderBoard() {
    const list = VS.board.list();
    const ge = boardEngine();
    const canGen = !!ge && ge.isAvailable();
    $('#btnBoardGen').disabled = state.boardBusy || !canGen || !list.length;
    $('#btnBoardGen').textContent = VS.t(ge && ge.id === 'local' ? '全部預先生成（本地引擎）' : '全部預先生成（引擎 B）');
    $('#btnBoardGen').title = canGen ? '' : (ge ? ge.unavailableReason() : '');
    if (!list.length) {
      $('#boardList').innerHTML = `<li class="empty">${VS.t('還沒有台詞。在上方輸入文字、選好情緒後，按「＋ 加入台詞板」。')}</li>`;
      return;
    }
    $('#boardList').innerHTML = list.map((p, i) => {
      const ready = VS.board.isReady(p, profileId());
      return `<li class="board-row" data-id="${p.id}">
        <span class="board-key">${i < 9 ? i + 1 : '·'}</span>
        <span class="board-text">${VS.escapeHtml(p.text)}</span>
        <span class="tag">${emotionName(p.emotion)}</span>
        <span class="board-state ${ready ? 'ok' : ''}">${VS.t(ready ? '已生成' : '未生成')}</span>
        <span class="btn-row">
          <button type="button" class="btn btn-sm btn-yellow" data-act="play">▶</button>
          <button type="button" class="btn btn-sm" data-act="del">${VS.t('刪除')}</button>
        </span>
      </li>`;
    }).join('');
  }

  $('#btnBoardAdd').addEventListener('click', () => {
    const text = $('#ttsText').value.trim();
    if (!text) { VS.toast(VS.t('請先輸入要加入的台詞')); return; }
    try {
      VS.board.add(text, state.emotion);
      renderBoard();
      VS.toast(VS.t('已加入台詞板'));
    } catch (err) {
      VS.toast(err.message, 'error');
    }
  });

  async function playPhrase(p) {
    stop();
    const ready = VS.board.isReady(p, profileId());
    const clip = ready ? await VS.clipStore.get(p.clip.key).catch(() => null) : null;
    if (!clip) {
      speakWith(engine(), p.text, options({ emotion: p.emotion }));
      return;
    }
    setSpeaking(true);
    $('#bubble').textContent = p.text;
    syncLive({ talking: true, text: p.text, emotion: p.emotion });
    await player.play(clip.samples, clip.sampleRate, { volume: options().volume, onLevel: v => talker.level(v) });
    playHooks(engineB).onEnd();
  }

  $('#boardList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.board-row').dataset.id;
    const p = VS.board.list().find(x => x.id === id);
    if (!p) return;
    if (btn.dataset.act === 'play') playPhrase(p);
    if (btn.dataset.act === 'del') { VS.board.remove(id); renderBoard(); }
  });

  $('#btnBoardGen').addEventListener('click', async () => {
    if (!state.profile) { VS.toast(VS.t('請先選擇聲線特徵檔'), 'error'); return; }
    const ge = boardEngine();
    if (ge.capabilities.needsModel && !(await ensureModel())) return;
    if (ge.capabilities.needsServer && !(await ensureServer())) return;
    const todo = VS.board.list().filter(p => !VS.board.isReady(p, profileId()));
    if (!todo.length) { VS.toast(VS.t('全部台詞都已生成')); return; }
    state.boardBusy = true;
    renderBoard();
    const t0 = performance.now();
    try {
      for (let i = 0; i < todo.length; i++) {
        const p = todo[i];
        const base = VS.t('生成第 {i} / {n} 句：「{text}」', { i: i + 1, n: todo.length, text: p.text.slice(0, 16) });
        $('#boardStatus').textContent = base;
        const out = await ge.synthesize(p.text, state.profile, options({ emotion: p.emotion }), {
          onProgress: v => { $('#boardStatus').textContent = `${base} ${Math.round(v * 100)}%`; }
        });
        const key = 'board:' + p.id + ':' + state.profile.id;
        await VS.clipStore.put(key, out.samples, out.sampleRate);
        VS.board.setClip(p.id, { key, profileId: state.profile.id, at: Date.now() });
        renderBoard();
      }
      $('#boardStatus').textContent = VS.t('✅ 完成 {n} 句，耗時 {sec} 秒。打開直播模式頁就能用按鈕或數字鍵播放。', { n: todo.length, sec: ((performance.now() - t0) / 1000).toFixed(0) });
    } catch (err) {
      $('#boardStatus').textContent = VS.t('❌ 生成失敗：') + err.message;
    } finally {
      state.boardBusy = false;
      renderBoard();
    }
  });

  $('#btnClipsClear').addEventListener('click', async () => {
    if (!confirm(VS.t('要清除所有已生成的語音嗎？台詞文字會保留。'))) return;
    await VS.clipStore.clear();
    VS.board.clearClips();
    renderBoard();
    VS.toast(VS.t('已清除已生成語音'));
  });

  window.addEventListener('pagehide', stop);

  /* ---------- 初始化 ---------- */
  if (!VS.engines.get('webspeech').isAvailable()) {
    VS.toast(VS.t('這個瀏覽器不支援語音合成，請改用 Chrome、Edge 或 Safari'), 'error');
  }
  renderEngines();
  renderCharStrip();
  setEmotion(state.emotion);
  setTone(state.tone);
  renderStage();
  updateSliders();
  $('#ttsText').value = VS.prefs.get('ttsText', '') || startChar.line;
  onTextInput();
  loadProfiles().then(() => { updateEngineUI(); return loadVoices(); });
})(window.VS);
