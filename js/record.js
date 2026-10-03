/* 錄製聲紋頁 */
(function (VS) {
  'use strict';

  const $ = VS.$;
  const PROMPTS = [
    { id: 'p1', emotion: '平靜', text: '大家好，歡迎來到我的頻道。今天天氣很不錯，我們一起輕鬆地聊聊天吧。' },
    { id: 'p2', emotion: '開心', text: '哇！真的嗎？太棒了，謝謝你送的禮物，我超級開心的！' },
    { id: 'p3', emotion: '敘述', text: '七隻小貓在綠色的草地上追著蝴蝶，跑累了就躺在大樹下睡午覺。' },
    { id: 'p4', emotion: '激動', text: '衝啊！這一波一定要贏，大家把力量借給我，絕對不能放棄！' },
    { id: 'p5', emotion: '溫柔', text: '晚安囉，現在已經十一點半了，記得早點休息，我們明天見。' }
  ];
  const MAX_SEC = 15;
  const MIN_OK = 3;
  const STATUS_TEXT = { pass: '合格', warn: '可用', fail: '需重錄' };

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
      err.textContent = '麥克風需要在 https 或 localhost 網址下才能使用（放到 GitHub Pages 後就是 https）。';
      err.hidden = false;
      return;
    }
    try {
      await rec.init();
    } catch (e) {
      const msg = {
        NotAllowedError: '麥克風權限被拒絕。請點網址列旁的權限圖示，允許使用麥克風後重新整理。',
        NotFoundError: '找不到麥克風，請確認裝置已連接。',
        NotReadableError: '麥克風正被其他程式使用，請先關閉其他錄音程式。',
        NotSupportedError: '這個瀏覽器不支援錄音，請改用最新版 Chrome、Edge 或 Safari。'
      }[e.name] || ('無法開啟麥克風：' + e.message);
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
          <span class="tag">${p.emotion}</span>
          <span class="badge" data-role="badge">未錄音</span>
        </div>
        <p class="prompt-text">${p.text}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-pink" data-role="rec"><span class="rec-dot"></span><span data-role="recLabel">開始錄音</span></button>
          <button type="button" class="btn" data-role="play" disabled>播放</button>
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
    part(id, 'recLabel').textContent = '停止錄音';
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
    const samples = rec.stop();
    const prompt = PROMPTS.find(p => p.id === id);
    const analysis = VS.features.analyzeClip(samples, prompt.text);
    if (clips[id] && clips[id].url) URL.revokeObjectURL(clips[id].url);
    clips[id] = { samples, analysis, url: URL.createObjectURL(VS.audio.wavBlob(samples, VS.features.SR)) };

    const card = cardOf(id);
    card.classList.remove('is-recording');
    part(id, 'recLabel').textContent = '重新錄音';
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
      return `<span class="${c ? c.analysis.quality.status : ''}" title="第 ${i + 1} 句">${i + 1}</span>`;
    }).join('');
    const n = usable().length;
    $('#btnBuild').disabled = n < MIN_OK;
    $('#finishHint').textContent = n < MIN_OK
      ? `已完成 ${n} 句可用錄音，再 ${MIN_OK - n} 句就能產生特徵檔（5 句都錄效果最好）。`
      : `已完成 ${n} 句可用錄音，可以產生特徵檔了！`;
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
      $('#levelHint').textContent = db < -50 ? '目前很安靜，可以開始朗讀。'
        : db < -38 ? '音量偏小，可以再靠近麥克風一點。'
        : db > -6 ? '太大聲了，請離麥克風遠一點。'
        : '音量剛剛好！';
      requestAnimationFrame(draw);
    };
    draw();
  }

  /* ---------- 產生特徵檔 ---------- */
  $('#btnBuild').addEventListener('click', async () => {
    if (recordingId) finishRecording();
    const btn = $('#btnBuild');
    btn.disabled = true;
    btn.textContent = '分析中…';
    await new Promise(r => setTimeout(r, 30));
    try {
      const list = usable();
      const features = VS.features.combine(list.map(p => clips[p.id].analysis));
      const summary = VS.features.summarize(features);
      const name = $('#profileName').value.trim() || ('我的聲線 ' + new Date().toLocaleDateString('zh-TW'));
      const profile = {
        format: VS.profileStore.FORMAT,
        version: VS.profileStore.VERSION,
        id: VS.profileStore.newId(),
        name,
        createdAt: new Date().toISOString(),
        language: 'zh-TW',
        features,
        summary: { pitch: summary.pitch, rate: summary.rate, timbre: summary.timbre, dynamics: summary.dynamics },
        engineHints: { suggestedGender: summary.suggestedGender },
        // 給引擎 B／本地開源引擎做音色複製用的參考錄音
        references: list.map(p => ({
          promptId: p.id,
          text: p.text,
          emotion: p.emotion,
          sampleRate: VS.features.SR,
          durationSec: Math.round(clips[p.id].analysis.quality.durationSec * 10) / 10,
          audio: VS.audio.wavDataUrl(clips[p.id].samples, VS.features.SR)
        }))
      };
      await VS.profileStore.put(profile);
      VS.prefs.set('profile', profile.id);
      lastProfile = profile;
      showResult(profile);
      renderLibrary();
      VS.toast('聲線特徵檔已建立並設為使用中', 'success');
    } catch (e) {
      VS.toast('建立失敗：' + e.message, 'error');
    } finally {
      btn.textContent = '產生聲線特徵檔 ★';
      renderProgress();
    }
  });

  function summaryChips(p) {
    const s = p.summary || VS.features.summarize(p.features);
    const f = p.features;
    return [
      ['音高', `${s.pitch}（${Math.round(f.f0.median)} Hz）`],
      ['語速', `${s.rate}（每秒 ${f.speakingRate} 字）`],
      ['音色', s.timbre],
      ['起伏', s.dynamics]
    ].map(([k, v]) => `<div class="summary-chip"><small>${k}</small><b>${VS.escapeHtml(v)}</b></div>`).join('');
  }

  function showResult(p) {
    $('#resultCard').hidden = false;
    $('#resultTitle').textContent = `「${p.name}」已建立`;
    $('#resultSummary').innerHTML = summaryChips(p);
    $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#btnExportNew').addEventListener('click', () => { if (lastProfile) VS.profileStore.exportProfile(lastProfile); });

  /* ---------- 特徵檔管理 ---------- */
  async function renderLibrary() {
    const list = await VS.profileStore.list();
    const active = VS.prefs.get('profile', '');
    if (!list.length) {
      $('#profileList').innerHTML = '<div class="empty">還沒有聲線特徵檔，錄完 5 句台詞就會出現在這裡。</div>';
      return;
    }
    $('#profileList').innerHTML = list.map(p => {
      const s = p.summary || VS.features.summarize(p.features);
      const on = p.id === active;
      return `<article class="card profile-row${on ? ' is-active' : ''}" data-id="${p.id}">
        <div>
          <h3>${VS.escapeHtml(p.name)} ${on ? '<span class="tag">使用中</span>' : ''}</h3>
          <div class="meta">${new Date(p.createdAt).toLocaleString('zh-TW')}・音高 ${s.pitch}・語速 ${s.rate}・音色 ${s.timbre}・參考錄音 ${(p.references || []).length} 段</div>
        </div>
        <div class="btn-row">
          ${on ? '' : '<button type="button" class="btn btn-sm btn-yellow" data-act="use">設為使用中</button>'}
          <button type="button" class="btn btn-sm" data-act="export">匯出</button>
          <button type="button" class="btn btn-sm" data-act="rename">重新命名</button>
          <button type="button" class="btn btn-sm btn-red" data-act="delete">刪除</button>
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
        VS.toast(`已切換到「${p.name}」`);
        break;
      case 'export':
        VS.profileStore.exportProfile(p);
        break;
      case 'rename': {
        const name = prompt('新的名稱', p.name);
        if (name && name.trim()) { p.name = name.trim().slice(0, 24); await VS.profileStore.put(p); }
        break;
      }
      case 'delete':
        if (!confirm(`確定要刪除「${p.name}」嗎？刪除後無法復原（已匯出的檔案不受影響）。`)) return;
        await VS.profileStore.remove(id);
        VS.toast('已刪除');
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
      VS.toast(`已匯入「${p.name}」並設為使用中`, 'success');
      renderLibrary();
    } catch (err) {
      VS.toast('匯入失敗：' + err.message, 'error');
    }
  });

  window.addEventListener('pagehide', () => rec.destroy());

  renderLibrary();
})(window.VS);
