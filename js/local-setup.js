/* 本地引擎安裝與連線頁 */
(function (VS) {
  'use strict';

  const $ = VS.$;
  const engine = VS.engines.get('local');
  const player = new VS.AudioPlayer();

  /* ---------- 作業系統分頁 ---------- */
  function setOs(os) {
    VS.$$('.os-tabs .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.os === os));
    VS.$$('.os-pane').forEach(p => { p.hidden = p.dataset.os !== os; });
    VS.$$('[data-os-only]').forEach(a => { a.hidden = a.dataset.osOnly !== os; });
    VS.prefs.set('setupOs', os);
  }
  const guess = /Mac/i.test(navigator.platform || navigator.userAgent) ? 'mac' : 'win';
  setOs(VS.prefs.get('setupOs', guess));
  VS.$$('.os-tabs .chip').forEach(b => b.addEventListener('click', () => setOs(b.dataset.os)));

  /* ---------- 指令一鍵複製 ---------- */
  VS.$$('pre.cmd').forEach(pre => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm copy-btn';
    btn.textContent = '複製';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code').textContent);
        btn.textContent = '已複製';
        setTimeout(() => { btn.textContent = '複製'; }, 1500);
      } catch (e) {
        VS.toast('無法自動複製，請手動選取文字');
      }
    });
    pre.appendChild(btn);
  });

  /* ---------- 連線測試 ---------- */
  const mark = (step, state) => {
    const li = $(`#checkList [data-step="${step}"]`);
    li.className = state || '';
  };

  $('#bridgeUrl').value = engine.bridgeUrl();
  $('#bridgeUrl').addEventListener('change', e => {
    engine.setBridgeUrl(e.target.value);
    e.target.value = engine.bridgeUrl();
  });

  $('#btnCheck').addEventListener('click', async () => {
    engine.setBridgeUrl($('#bridgeUrl').value);
    ['bridge', 'sovits', 'gen'].forEach(s => mark(s, ''));
    mark('bridge', 'running');
    $('#checkMsg').textContent = '測試中…';
    $('#doneRow').hidden = true;
    const s = await engine.check();
    if (s.state === 'offline') {
      mark('bridge', 'fail');
      $('#checkMsg').textContent = '❌ ' + s.message;
      $('#btnTestGen').disabled = true;
      return;
    }
    mark('bridge', 'ok');
    if (s.state === 'bridge-only') {
      mark('sovits', 'fail');
      $('#checkMsg').textContent = '⚠️ ' + s.message;
      $('#btnTestGen').disabled = true;
      return;
    }
    mark('sovits', 'ok');
    $('#btnTestGen').disabled = false;
    $('#checkMsg').textContent = '✅ 已連線！最後按「試著生成一句」，確認能用你的聲線說話。';
  });

  $('#btnTestGen').addEventListener('click', async () => {
    const profile = await VS.profileStore.getSelected().catch(() => null);
    if (!profile || !profile.references || !profile.references.length) {
      mark('gen', 'fail');
      $('#checkMsg').innerHTML = '❌ 還沒有聲線特徵檔。請先到 <a href="record.html">錄製聲紋</a> 錄音，再回來測試。';
      return;
    }
    const btn = $('#btnTestGen');
    btn.disabled = true;
    mark('gen', 'running');
    $('#checkMsg').textContent = `用「${profile.name}」生成中…第一次會比較久。`;
    const t0 = performance.now();
    try {
      const out = await engine.synthesize('你好，這是本地引擎的測試聲音。', profile, { emotion: 'calm', tone: 'flat', rate: 1 });
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      mark('gen', 'ok');
      $('#checkMsg').textContent = `✅ 成功！生成花了 ${sec} 秒，正在播放。`;
      $('#doneRow').hidden = false;
      await player.play(out.samples, out.sampleRate, { volume: 0.9 });
    } catch (e) {
      mark('gen', 'fail');
      $('#checkMsg').textContent = '❌ 生成失敗：' + e.message;
    } finally {
      btn.disabled = false;
    }
  });

  // 從文字轉語音頁點過來時，直接捲到測試區
  if (location.hash === '#test') $('#test').scrollIntoView();
})(window.VS);
