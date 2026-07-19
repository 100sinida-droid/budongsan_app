/* =========================================================
   관리자 페이지 로직 (백엔드 API 연동 버전)
   - 아이디/비밀번호 로그인 → 세션 토큰 (sessionStorage)
   - 업로드/삭제는 Cloudflare Functions(/api/*)가 처리
   - GitHub 토큰은 서버에만 있으며 브라우저로 오지 않습니다.
   ========================================================= */
(function () {
  KG.initTheme();
  const syncIcon = () => document.querySelectorAll('[data-theme-icon]').forEach(i => i.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙');
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => { KG.toggleTheme(); syncIcon(); }));
  syncIcon();

  const $ = id => document.getElementById(id);
  const SKEY = 'kg-admin-session';
  let token = '';
  try { token = sessionStorage.getItem(SKEY) || ''; } catch (e) {}

  let files = [];        // {name, text, num, title}
  let cover = null;      // {name, base64}

  // ---------- API ----------
  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (auth && token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) { showLogin(); throw new Error(data.error || '로그인이 필요합니다.'); }
    if (!res.ok) throw new Error(data.error || ('요청 실패 (' + res.status + ')'));
    return data;
  }

  // ---------- 화면 전환 ----------
  function showLogin() {
    $('login-view').hidden = false;
    $('app-view').hidden = true;
    $('btn-logout').hidden = true;
  }
  function showApp() {
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    $('btn-logout').hidden = false;
  }

  // ---------- 로그인 ----------
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('login-error').textContent = '';
    $('btn-login').classList.add('locked');
    try {
      const data = await api('login', { method: 'POST', auth: false, body: { username: $('login-user').value, password: $('login-pass').value } });
      token = data.token;
      try { sessionStorage.setItem(SKEY, token); } catch (e) {}
      showApp();
      await refresh();
    } catch (err) {
      $('login-error').textContent = err.message;
    } finally {
      $('btn-login').classList.remove('locked');
    }
  });
  $('btn-logout').addEventListener('click', () => {
    token = '';
    try { sessionStorage.removeItem(SKEY); } catch (e) {}
    $('login-user').value = ''; $('login-pass').value = '';
    showLogin();
  });

  // ---------- 로그 ----------
  function log(msg, cls) {
    const el = $('log'); const line = document.createElement('div');
    if (cls) line.className = cls; line.textContent = msg;
    el.appendChild(line); el.scrollTop = el.scrollHeight;
  }

  // ---------- 목록 ----------
  let novels = [];
  async function refresh() {
    try {
      const data = await api('list');
      novels = data.novels || [];
      const byslug = {}; novels.forEach(n => byslug[n.slug] = n);
      // select
      const sel = $('novel-select');
      const opts = ['<option value="">작품을 선택하세요</option>'];
      novels.forEach(n => opts.push(`<option value="${KG.escapeHtml(n.slug)}">${KG.escapeHtml(n.title || n.slug)} (${n.slug})</option>`));
      opts.push('<option value="__new__">➕ 새 작품 만들기…</option>');
      sel.innerHTML = opts.join('');
      renderManage();
    } catch (e) { log('목록 불러오기 실패: ' + e.message, 'err'); }
    loadGuestbook();
  }

  async function loadGuestbook() {
    const box = $('gb-admin-list'); if (!box) return;
    try {
      const data = await api('guestbook', { auth: false });
      if (!data.configured) { box.innerHTML = '<p class="sub">방명록 저장소(Cloudflare KV)가 아직 연결되지 않았습니다. README의 KV 설정을 마치면 활성화됩니다.</p>'; return; }
      const entries = data.entries || [];
      if (!entries.length) { box.innerHTML = '<p class="sub">아직 방명록이 없습니다.</p>'; return; }
      box.innerHTML = entries.map(e => `
        <div class="gb-admin-item">
          <div class="ga-main">
            <div><span class="ga-name">${KG.escapeHtml(e.name || '익명')}</span><span class="ga-date">${KG.formatDate(e.date)}</span></div>
            <div class="ga-msg">${KG.escapeHtml(e.message)}</div>
          </div>
          <button class="ga-del" data-gid="${KG.escapeHtml(e.id)}">삭제</button>
        </div>`).join('');
      box.querySelectorAll('.ga-del').forEach(b => b.addEventListener('click', () => delGuestbook(b.dataset.gid)));
    } catch (e) { box.innerHTML = '<p class="sub">방명록을 불러오지 못했습니다.</p>'; }
  }
  async function delGuestbook(id) {
    if (!confirm('이 방명록을 삭제할까요?')) return;
    try { await api('guestbook', { method: 'POST', body: { action: 'delete', id } }); log('✔ 방명록 삭제 완료', 'ok'); loadGuestbook(); }
    catch (e) { log('✖ ' + e.message, 'err'); }
  }

  function renderManage() {
    const box = $('manage-list');
    if (!novels.length) { box.innerHTML = '<p class="sub">아직 등록된 작품이 없습니다. 위에서 새 작품을 업로드해 보세요.</p>'; return; }
    box.innerHTML = novels.map(n => {
      const eps = n.episodes || [];
      const rows = eps.map(e => `
        <div class="mn-ep">
          <span class="fi-no">${e.num != null ? e.num + '화' : (e.order || '') + '화'}</span>
          <span class="mn-ep-title">${KG.escapeHtml(e.title || '')} <span style="color:var(--text-faint)">(${KG.escapeHtml(e.file || '')})</span></span>
          <button data-del-ep="${KG.escapeHtml(n.slug)}|${KG.escapeHtml(e.file || '')}">삭제</button>
        </div>`).join('') || '<div class="mn-ep" style="color:var(--text-faint)">회차 정보 없음 (인덱싱 전일 수 있음)</div>';
      const st = n.status || '연재중';
      const statusOpt = ['연재중', '완결', '휴재'].map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('');
      const av = s => KG.escapeHtml(s == null ? '' : String(s));
      return `
        <div class="manage-novel" data-slug="${KG.escapeHtml(n.slug)}">
          <div class="mn-head">
            <span class="mn-title">${KG.escapeHtml(n.title || n.slug)}</span>
            ${n.featured ? '<span class="badge" style="margin-right:6px">⭐대표</span>' : ''}
            <span class="mn-count">${n.episodeCount != null ? n.episodeCount + '화' : ''}</span>
            <span class="chev">▾</span>
          </div>
          <div class="mn-body">
            <div class="mn-edit">
              <div class="mn-edit-title">✏️ 작품 정보 수정</div>
              <div class="field"><label>제목</label><input class="e-title" value="${av(n.title)}"></div>
              <div class="field-row">
                <div class="field"><label>장르</label><input class="e-genre" value="${av(n.genre)}"></div>
                <div class="field" style="max-width:130px"><label>상태</label><select class="e-status">${statusOpt}</select></div>
              </div>
              <div class="field"><label>작품 소개</label><textarea class="e-desc">${av(n.description)}</textarea></div>
              <div class="field-row" style="align-items:flex-end">
                <label class="check"><input type="checkbox" class="e-featured" ${n.featured ? 'checked' : ''}> 메인 대표 작품</label>
                <div class="field" style="max-width:150px"><label>인기도 (클수록 상단)</label><input type="number" class="e-pop" value="${av(n.popularity || 0)}"></div>
                <div class="field" style="max-width:110px"><label>정렬 순서</label><input type="number" class="e-order" value="${av(n.order != null ? n.order : 999)}"></div>
              </div>
              <button class="btn btn-primary btn-sm e-save" data-slug="${KG.escapeHtml(n.slug)}">정보 저장</button>
              <p class="hint" style="margin-top:8px">대표 작품 = 메인 상단 "⭐대표 작품"에 노출 · 인기도 1 이상 = 메인 "🔥인기 작품"에 노출(숫자 클수록 위)</p>
            </div>
            <div class="mn-edit-title" style="margin-top:16px">📄 회차 목록</div>
            ${rows}
            <button class="mn-del-novel" data-del-novel="${KG.escapeHtml(n.slug)}">이 작품 전체 삭제</button>
          </div>
        </div>`;
    }).join('');
    box.querySelectorAll('.mn-head').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    box.querySelectorAll('.mn-edit').forEach(f => f.addEventListener('click', ev => ev.stopPropagation()));
    box.querySelectorAll('[data-del-ep]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); delEpisode(b.dataset.delEp); }));
    box.querySelectorAll('[data-del-novel]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); delNovel(b.dataset.delNovel); }));
    box.querySelectorAll('.e-save').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); saveNovelInfo(b); }));
  }

  async function saveNovelInfo(btn) {
    const card = btn.closest('.manage-novel');
    const slug = btn.dataset.slug;
    const meta = {
      title: card.querySelector('.e-title').value.trim(),
      genre: card.querySelector('.e-genre').value.trim(),
      status: card.querySelector('.e-status').value,
      description: card.querySelector('.e-desc').value.trim(),
      featured: card.querySelector('.e-featured').checked,
      popularity: parseInt(card.querySelector('.e-pop').value, 10) || 0,
      order: parseInt(card.querySelector('.e-order').value, 10) || 999
    };
    btn.classList.add('locked');
    try {
      log(`'${meta.title || slug}' 정보 저장 중…`, 'info');
      await api('update', { method: 'POST', body: { slug, meta } });
      log(`✔ 정보 저장 완료. 30초~1분 뒤 사이트에 반영됩니다.`, 'ok');
      setTimeout(refresh, 1400);
    } catch (e) { log('✖ ' + e.message, 'err'); }
    finally { btn.classList.remove('locked'); }
  }

  // ---------- 원고 파일 ----------
  function parseMeta(name, text) {
    const stem = name.replace(/\.(md|txt)$/i, '');
    const m = stem.match(/(\d+)/); const num = m ? parseInt(m[1], 10) : null;
    let title = null;
    const fm = text.match(/^﻿?---\s*[\r\n]([\s\S]*?)[\r\n]---/);
    if (fm) { const t = fm[1].match(/title\s*:\s*(.+)/); if (t) title = t[1].trim().replace(/^["']|["']$/g, ''); }
    if (!title) { const h = text.match(/^﻿?#\s+(.+)$/m); if (h) title = h[1].trim(); }
    if (!title) title = num != null ? `${num}화` : stem;
    return { num, title };
  }
  function addFiles(fileList) {
    const arr = Array.from(fileList).filter(f => /\.(md|txt)$/i.test(f.name));
    if (!arr.length) { log('md 또는 txt 파일만 가능합니다.', 'err'); return; }
    let pending = arr.length;
    arr.forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        const text = r.result; const meta = parseMeta(f.name, text);
        if (!files.some(x => x.name === f.name)) files.push({ name: f.name, text, num: meta.num, title: meta.title });
        if (--pending === 0) renderFiles();
      };
      r.readAsText(f);
    });
  }
  function renderFiles() {
    files.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9) || a.name.localeCompare(b.name));
    $('file-list').innerHTML = files.map((f, i) => `
      <div class="file-item">
        <span class="fi-no">${f.num != null ? f.num + '화' : '?'}</span>
        <span class="fi-main"><div class="fi-title">${KG.escapeHtml(f.title)}</div><div class="fi-name">${KG.escapeHtml(f.name)}</div></span>
        <button class="fi-del" data-i="${i}" title="빼기">✕</button>
      </div>`).join('');
    $('file-list').querySelectorAll('.fi-del').forEach(b => b.addEventListener('click', () => { files.splice(+b.dataset.i, 1); renderFiles(); }));
  }

  // ---------- 표지 ----------
  function setCover(file) {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      const base64 = String(dataUrl).split(',')[1] || '';
      cover = { name: file.name, base64 };
      $('cover-preview').innerHTML = `<img src="${dataUrl}" alt="표지 미리보기">`;
      $('btn-cover-clear').hidden = false;
    };
    r.readAsDataURL(file);
  }
  function clearCover() {
    cover = null;
    $('cover-preview').innerHTML = '표지<br>미리보기';
    $('btn-cover-clear').hidden = true;
    $('cover-input').value = '';
  }

  // ---------- 업로드 ----------
  async function doUpload() {
    let slug = $('novel-select').value;
    if (!slug) { log('작품을 선택하세요.', 'err'); return; }
    const isNew = slug === '__new__';
    let meta = null;
    if (isNew) {
      slug = $('nn-slug').value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/^-+|-+$/g, '');
      if (!slug) { log('새 작품의 폴더명을 입력하세요 (영문).', 'err'); return; }
      meta = { title: $('nn-title').value.trim() || slug, genre: $('nn-genre').value.trim(), status: $('nn-status').value, description: $('nn-desc').value.trim(), featured: $('nn-featured').checked, order: parseInt($('nn-order').value, 10) || 10 };
    }
    if (!files.length && !cover) { log('업로드할 원고나 표지를 추가하세요.', 'err'); return; }

    $('btn-upload').classList.add('locked');
    log(`업로드 중… (원고 ${files.length}개${cover ? ' + 표지' : ''})`, 'info');
    try {
      const data = await api('upload', { method: 'POST', body: { slug, isNew, meta, files: files.map(f => ({ name: f.name, text: f.text })), cover } });
      log(`✔ 업로드 완료: ${data.committed.length}개 파일. 1~2분 뒤 사이트에 반영됩니다.`, 'ok');
      files = []; renderFiles(); clearCover();
      setTimeout(refresh, 1500);
    } catch (e) {
      log('✖ ' + e.message, 'err');
    } finally {
      $('btn-upload').classList.remove('locked');
    }
  }

  // ---------- 삭제 ----------
  async function delEpisode(payload) {
    const [slug, file] = payload.split('|');
    if (!confirm(`'${file}' 회차를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try { log(`삭제 중: ${file}`, 'info'); await api('delete', { method: 'POST', body: { slug, file } }); log(`✔ ${file} 삭제 완료`, 'ok'); setTimeout(refresh, 1200); }
    catch (e) { log('✖ ' + e.message, 'err'); }
  }
  async function delNovel(slug) {
    if (!confirm(`'${slug}' 작품 전체(모든 회차·표지 포함)를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try { log(`'${slug}' 작품 삭제 중…`, 'info'); await api('delete', { method: 'POST', body: { slug } }); log(`✔ '${slug}' 삭제 완료`, 'ok'); setTimeout(refresh, 1500); }
    catch (e) { log('✖ ' + e.message, 'err'); }
  }

  // ---------- 이벤트 ----------
  $('novel-select').addEventListener('change', e => { $('new-novel-fields').hidden = e.target.value !== '__new__'; });

  const dz = $('dropzone'), fi = $('file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', () => { addFiles(fi.files); fi.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

  $('btn-cover').addEventListener('click', () => $('cover-input').click());
  $('cover-input').addEventListener('change', () => { if ($('cover-input').files[0]) setCover($('cover-input').files[0]); });
  $('btn-cover-clear').addEventListener('click', clearCover);

  $('btn-upload').addEventListener('click', doUpload);
  $('btn-clear-files').addEventListener('click', () => { files = []; renderFiles(); });
  $('btn-refresh').addEventListener('click', () => { log('목록 새로고침…', 'info'); refresh(); });
  { const g = $('btn-gb-refresh'); if (g) g.addEventListener('click', loadGuestbook); }

  // ---------- 시작: 세션 있으면 자동 진입 ----------
  (async function init() {
    if (token) {
      try { await api('list').then(d => { novels = d.novels || []; }); showApp(); await refresh(); return; }
      catch (e) { /* 토큰 만료 → 로그인 */ }
    }
    showLogin();
  })();
})();
