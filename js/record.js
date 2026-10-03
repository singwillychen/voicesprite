/* 錄製聲紋頁 */
(function (VS) {
  'use strict';

  const $ = VS.$;
  // 每句約 3～4 秒：引擎 B 的參考錄音越短生成越快；emotionId 用來依情緒挑參考錄音
  // emotion 存中文原文（特徵檔共用格式），畫面上再翻譯
  const PROMPTS_ZH = [
    { id: 'p1', emotionId: 'calm', emotion: '平靜', text: '大家好，歡迎來到我的頻道，今天輕鬆聊聊天。' },
    { id: 'p2', emotionId: 'happy', emotion: '開心', text: '哇！太棒了，謝謝你的禮物，我超開心的！' },
    { id: 'p3', emotionId: 'neutral', emotion: '敘述', text: '七隻小貓在綠色的草地上追著蝴蝶。' },
    { id: 'p4', emotionId: 'excited', emotion: '激動', text: '衝啊！這一波一定要贏，絕對不能放棄！' },
    { id: 'p5', emotionId: 'gentle', emotion: '溫柔', text: '晚安囉，記得早點休息，我們明天見。' }
  ];
  const PROMPTS_EN = [
    { id: 'p1', emotionId: 'calm', emotion: '平靜', text: "Hi everyone, welcome to my channel. Let's relax and chat today." },
    { id: 'p2', emotionId: 'happy', emotion: '開心', text: "Wow, that's amazing! Thank you for the gift, I'm so happy!" },
    { id: 'p3', emotionId: 'neutral', emotion: '敘述', text: 'Seven little cats chased a yellow butterfly across the field.' },
    { id: 'p4', emotionId: 'excited', emotion: '激動', text: "Let's go! We have to win this round, never give up!" },
    { id: 'p5', emotionId: 'gentle', emotion: '溫柔', text: "Good night, everyone. Get some rest, and I'll see you tomorrow." }
  ];
  const PROMPTS = VS.lang === 'en' ? PROMPTS_EN : PROMPTS_ZH;
  const MAX_SEC = 10;
  const REF_RATE = 24000;
  const MIN_OK = 3;
  const STATUS_TEXT = { pass: VS.t('合格'), warn: VS.t('可用'), fail: VS.t('需重錄') };

  const rec = new VS.Recorder();
  const clips = {}; // promptId -> { samples, analysis, url }
  let recordingId = null;
  let autoStop = null, tick = null, startedAt = 0;
  let player = null;
  let lastProfile = null;

  /* ---------- 同意與麥克風 ---------- */
  $('#consent').addEventListener('change', e => { $('#btnMic').disabled = !e.target.checked; });

  $('#btnMic').addEventListener('click', async () => {
    const err = $('#micError');
    err.hidden = true;
    if (!window.isSecureContext) {
      err.textContent = VS.t('麥克風需要在 https 或 localhost 網址下才能使用（放到 GitHub Pages 後就是 https）。');
      err.hidden = false;
      return;
    }
    try {
      await rec.init();
    } catch (e) {
      const msg = {
        NotAllowedError: VS.t('麥克風權限被拒絕。請點網址列旁的權限圖示，允許使用麥克風後重新整理。'),
        NotFoundError: VS.t('找不到麥克風，請確認裝置已連接。'),
        NotReadableError: VS.t('麥克風正被其他程式使用，請先關閉其他錄音程式。'),
        NotSupportedError: VS.t('這個瀏覽器不支援錄音，請改用最新版 Chrome、Edge 或 Safari。'),
        // 被包在預覽平台的框架裡、或 App 內建瀏覽器（LINE、Messenger 等）時常見
        SecurityError: VS.t('目前的開啟方式不允許使用麥克風。請直接用電腦版 Chrome 打開正式網址：{url}（不要在預覽平台或通訊軟體內建的瀏覽器裡開）。', { url: VS.SITE_URL + 'record.html' })
      }[e.name] || VS.t('無法開啟麥克風：{msg}（建議改用電腦版 Chrome 打開 {url}）', { msg: e.message, url: VS.SITE_URL + 'record.html' });
      err.textContent = msg;
      err.hidden = false;
      return;
    }
    $('#consentCard').hidden = true;
    $('#studio').hidden = false;
    renderPrompts();
    drawLoop();
  });

  /* ---------- 題目卡片 ---------- */
  function renderPrompts() {
    $('#promptList').innerHTML = PROMPTS.map((p, i) => `
      <article class="card prompt-card" data-id="${p.id}">
        <div class="prompt-head">
          <span class="prompt-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="tag">${VS.t(p.emotion)}</span>
          <span class="badge" data-role="badge">${VS.t('未錄音')}</span>
        </div>
        <p class="prompt-text">${p.text}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-pink" data-role="rec"><span class="rec-dot"></span><span data-role="recLabel">${VS.t('開始錄音')}</span></button>
          <button type="button" class="btn" data-role="play" disabled>${VS.t('播放')}</button>
          <span class="timer" data-role="timer">0.0s</span>
        </div>
        <ul class="quality-list" data-role="msgs"></ul>
      </article>`).join('');
    renderProgress();
  }

  const cardOf = id => $(`.prompt-card[data-id="${id}"]`);
  const part = (id, role) => cardOf(id).querySelector(`[data-role="${role}"]`);

  $('#promptList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-role]');
    if (!btn) return;
    const id = btn.closest('.prompt-card').dataset.id;
    if (btn.dataset.role === 'rec') toggleRecord(id);
    if (btn.dataset.role === 'play') playClip(id);
  });

  async function toggleRecord(id) {
    if (recordingId === id) { finishRecording(); return; }
    if (recordingId) finishRecording();
    stopPlayer();
    recordingId = id;
    await rec.start();
    startedAt = performance.now();
    const card = cardOf(id);
    card.classList.add('is-recording');
    part(id, 'recLabel').textContent = VS.t('停止錄音');
    part(id, 'play').disabled = true;
    tick = setInterval(() => {
      part(id, 'timer').textContent = ((performance.now() - startedAt) / 1000).toFixed(1) + 's';
    }, 100);
    autoStop = setTimeout(() => { if (recordingId === id) finishRecording(); }, MAX_SEC * 1000);
  }

  function finishRecording() {
    const id = recordingId;
    if (!id) return;
    recordingId = null;
    clearInterval(tick);
    clearTimeout(autoStop);
    const out = rec.stop();
    const samples = out.s16;
    const prompt = PROMPTS.find(p => p.id === id);
    const analysis = VS.features.analyzeClip(samples, prompt.text);
    if (analysis.quality.status !== 'fail' && analysis.activeSec > 7) {
      analysis.quality.status = 'warn';
      analysis.quality.messages = analysis.quality.messages.filter(m => m !== VS.t('錄音品質良好'))
        .concat(VS.t('這句講得比較久，會讓 AI 音色複製變慢，可以試著講快一點'));
    }
    // 參考錄音：裁掉頭尾靜音，前後各留一點空間
    const a = Math.max(0, Math.floor((analysis.startSec - 0.15) * REF_RATE));
    const b = Math.min(out.s24.length, Math.ceil((analysis.endSec + 0.2) * REF_RATE));
    const ref24 = b > a ? out.s24.slice(a, b) : out.s24;
    if (clips[id] && clips[id].url) URL.revokeObjectURL(clips[id].url);
    clips[id] = { samples, ref24, analysis, url: URL.createObjectURL(VS.audio.wavBlob(ref24, REF_RATE)) };

    const card = cardOf(id);
    card.classList.remove('is-recording');
    part(id, 'recLabel').textContent = VS.t('重新錄音');
    part(id, 'play').disabled = false;
    part(id, 'timer').textContent = analysis.quality.durationSec.toFixed(1) + 's';
    const q = analysis.quality;
    const badge = part(id, 'badge');
    badge.className = 'badge ' + q.status;
    badge.textContent = STATUS_TEXT[q.status];
    part(id, 'msgs').innerHTML = q.messages.map(m => `<li>${VS.escapeHtml(m)}</li>`).join('');
    renderProgress();
  }

  function stopPlayer() {
    if (player) { player.pause(); player = null; }
  }

  function playClip(id) {
    stopPlayer();
    if (!clips[id]) return;
    player = new Audio(clips[id].url);
    player.play();
  }

  function usable() {
    return PROMPTS.filter(p => clips[p.id] && clips[p.id].analysis.quality.status !== 'fail');
  }

  function renderProgress() {
    $('#progressDots').innerHTML = PROMPTS.map((p, i) => {
      const c = clips[p.id];
      return `<span class="${c ? c.analysis.quality.status : ''}" title="${VS.t('第 {n} 句', { n: i + 1 })}">${i + 1}</span>`;
    }).join('');
    const n = usable().length;
    $('#btnBuild').disabled = n < MIN_OK;
    $('#finishHint').textContent = n < MIN_OK
      ? VS.t('已完成 {n} 句可用錄音，再 {m} 句就能產生特徵檔（5 句都錄效果最好）。', { n, m: MIN_OK - n })
      : VS.t('已完成 {n} 句可用錄音，可以產生特徵檔了！', { n });
  }

  /* ---------- 波形與音量 ---------- */
  function drawLoop() {
    const canvas = $('#wave');
    const g = canvas.getContext('2d');
    const draw = () => {
      if (!rec.ready) return;
      const data = rec.timeDomain();
      const w = canvas.width, h = canvas.height;
      g.fillStyle = '#141414';
      g.fillRect(0, 0, w, h);
      g.lineWidth = 4;
      g.strokeStyle = recordingId ? '#ff3b30' : '#ffe14d';
      g.beginPath();
      const step = data.length / w;
      for (let x = 0; x < w; x++) {
        const v = data[Math.floor(x * step)];
        const y = h / 2 + v * h * 1.4;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();

      let s = 0;
      for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      const db = 10 * Math.log10(s / data.length + 1e-12);
      const pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
      $('#levelBar').style.width = pct + '%';
      $('#levelHint').textContent = VS.t(db < -50 ? '目前很安靜，可以開始朗讀。'
        : db < -38 ? '音量偏小，可以再靠近麥克風一點。'
        : db > -6 ? '太大聲了，請離麥克風遠一點。'
        : '音量剛剛好！');
      requestAnimationFrame(draw);
    };
    draw();
  }

  /* ---------- 產生特徵檔 ---------- */
  $('#btnBuild').addEventListener('click', async () => {
    if (recordingId) finishRecording();
    const btn = $('#btnBuild');
    btn.disabled = true;
    btn.textContent = VS.t('分析中…');
    await new Promise(r => setTimeout(r, 30));
    try {
      const list = usable();
      const features = VS.features.combine(list.map(p => clips[p.id].analysis));
      const summary = VS.features.summarize(features);
      const name = $('#profileName').value.trim() || (VS.t('我的聲線') + ' ' + new Date().toLocaleDateString(VS.locale));
      const profile = {
        format: VS.profileStore.FORMAT,
        version: VS.profileStore.VERSION,
        id: VS.profileStore.newId(),
        name,
        createdAt: new Date().toISOString(),
        language: VS.lang === 'en' ? 'en-US' : 'zh-TW',
        features,
        summary: { pitch: summary.pitch, rate: summary.rate, timbre: summary.timbre, dynamics: summary.dynamics },
        engineHints: { suggestedGender: summary.suggestedGender },
        // 給引擎 B／本地開源引擎做音色複製用的參考錄音
        references: list.map(p => ({
          promptId: p.id,
          emotionId: p.emotionId,
          text: p.text,
          emotion: p.emotion,
          sampleRate: REF_RATE,
          durationSec: Math.round(clips[p.id].ref24.length / REF_RATE * 10) / 10,
          audio: VS.audio.wavDataUrl(clips[p.id].ref24, REF_RATE)
        }))
      };
      await VS.profileStore.put(profile);
      VS.prefs.set('profile', profile.id);
      lastProfile = profile;
      showResult(profile);
      renderLibrary();
      VS.toast(VS.t('聲線特徵檔已建立並設為使用中'), 'success');
    } catch (e) {
      VS.toast(VS.t('建立失敗：') + e.message, 'error');
    } finally {
      btn.textContent = VS.t('產生聲線特徵檔 ★');
      renderProgress();
    }
  });

  function summaryChips(p) {
    const s = p.summary || VS.features.summarize(p.features);
    const f = p.features;
    return [
      [VS.t('音高'), `${VS.t(s.pitch)}（${Math.round(f.f0.median)} Hz）`],
      [VS.t('語速'), VS.t('{label}（每秒 {n} 字）', { label: VS.t(s.rate), n: f.speakingRate })],
      [VS.t('音色'), VS.t(s.timbre)],
      [VS.t('起伏'), VS.t(s.dynamics)]
    ].map(([k, v]) => `<div class="summary-chip"><small>${k}</small><b>${VS.escapeHtml(v)}</b></div>`).join('');
  }

  function showResult(p) {
    $('#resultCard').hidden = false;
    $('#resultTitle').textContent = VS.t('「{name}」已建立', { name: p.name });
    $('#resultSummary').innerHTML = summaryChips(p);
    $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#btnExportNew').addEventListener('click', () => { if (lastProfile) VS.profileStore.exportProfile(lastProfile); });

  /* ---------- 特徵檔管理 ---------- */
  async function renderLibrary() {
    const list = await VS.profileStore.list();
    const active = VS.prefs.get('profile', '');
    if (!list.length) {
      $('#profileList').innerHTML = `<div class="empty">${VS.t('還沒有聲線特徵檔，錄完 5 句台詞就會出現在這裡。')}</div>`;
      return;
    }
    $('#profileList').innerHTML = list.map(p => {
      const s = p.summary || VS.features.summarize(p.features);
      const on = p.id === active;
      return `<article class="card profile-row${on ? ' is-active' : ''}" data-id="${p.id}">
        <div>
          <h3>${VS.escapeHtml(p.name)} ${on ? `<span class="tag">${VS.t('使用中')}</span>` : ''}</h3>
          <div class="meta">${new Date(p.createdAt).toLocaleString(VS.locale)}・${VS.t('音高 {pitch}・語速 {rate}・音色 {timbre}・參考錄音 {n} 段', { pitch: VS.t(s.pitch), rate: VS.t(s.rate), timbre: VS.t(s.timbre), n: (p.references || []).length })}</div>
        </div>
        <div class="btn-row">
          ${on ? '' : `<button type="button" class="btn btn-sm btn-yellow" data-act="use">${VS.t('設為使用中')}</button>`}
          <button type="button" class="btn btn-sm" data-act="export">${VS.t('匯出')}</button>
          <button type="button" class="btn btn-sm" data-act="rename">${VS.t('重新命名')}</button>
          <button type="button" class="btn btn-sm btn-red" data-act="delete">${VS.t('刪除')}</button>
        </div>
      </article>`;
    }).join('');
  }

  $('#profileList').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.profile-row').dataset.id;
    const p = await VS.profileStore.get(id);
    if (!p) return;
    switch (btn.dataset.act) {
      case 'use':
        VS.prefs.set('profile', id);
        VS.toast(VS.t('已切換到「{name}」', { name: p.name }));
        break;
      case 'export':
        VS.profileStore.exportProfile(p);
        break;
      case 'rename': {
        const name = prompt(VS.t('新的名稱'), p.name);
        if (name && name.trim()) { p.name = name.trim().slice(0, 24); await VS.profileStore.put(p); }
        break;
      }
      case 'delete':
        if (!confirm(VS.t('確定要刪除「{name}」嗎？刪除後無法復原（已匯出的檔案不受影響）。', { name: p.name }))) return;
        await VS.profileStore.remove(id);
        VS.toast(VS.t('已刪除'));
        break;
    }
    renderLibrary();
  });

  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const p = await VS.profileStore.importFile(file);
      VS.prefs.set('profile', p.id);
      VS.toast(VS.t('已匯入「{name}」並設為使用中', { name: p.name }), 'success');
      renderLibrary();
    } catch (err) {
      VS.toast(VS.t('匯入失敗：') + err.message, 'error');
    }
  });

  window.addEventListener('pagehide', () => rec.destroy());

  renderLibrary();
})(window.VS);
