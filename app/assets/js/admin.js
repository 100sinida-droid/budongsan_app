/* =========================================================
   관리자 페이지 로직
   - GitHub Contents API로 원고 파일을 직접 커밋 (서버 불필요)
   - 토큰은 이 브라우저에만 저장(sessionStorage 기본, 선택 시 localStorage)
   - 업로드 후 GitHub Action이 자동으로 목록/검색/사이트맵 갱신
   ========================================================= */
(function () {
  KG.initTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    KG.toggleTheme();
    document.querySelectorAll('[data-theme-icon]').forEach(i => i.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙');
  }));
  document.querySelectorAll('[data-theme-icon]').forEach(i => i.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙');

  const CONTENT_BASE = 'app/content/novels';
  const $ = id => document.getElementById(id);
  const API = 'https://api.github.com';

  let cfg = loadCfg();
  let files = [];       // {name, text, num, title}
  let index = null;     // 파싱된 index.json (작품/회차)

  // ---------- 설정 저장/로드 ----------
  function loadCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem('kg-admin-cfg') || '{}'); } catch (e) {}
    let token = '';
    try { token = sessionStorage.getItem('kg-admin-token') || localStorage.getItem('kg-admin-token') || ''; } catch (e) {}
    return { owner: c.owner || '', repo: c.repo || '', branch: c.branch || 'main', token, remember: !!c.remember };
  }
  function saveCfg() {
    const remember = $('cfg-remember').checked;
    cfg = {
      owner: $('cfg-owner').value.trim(),
      repo: $('cfg-repo').value.trim(),
      branch: ($('cfg-branch').value.trim() || 'main'),
      token: $('cfg-token').value.trim(),
      remember
    };
    try {
      localStorage.setItem('kg-admin-cfg', JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, remember }));
      sessionStorage.setItem('kg-admin-token', cfg.token);
      if (remember) localStorage.setItem('kg-admin-token', cfg.token);
      else localStorage.removeItem('kg-admin-token');
    } catch (e) {}
  }
  function fillCfgForm() {
    $('cfg-owner').value = cfg.owner;
    $('cfg-repo').value = cfg.repo;
    $('cfg-branch').value = cfg.branch || 'main';
    $('cfg-token').value = cfg.token;
    $('cfg-remember').checked = cfg.remember;
  }

  // ---------- 로그 ----------
  function log(msg, cls) {
    const el = $('log');
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  // ---------- base64 (UTF-8 안전) ----------
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- GitHub API ----------
  async function gh(path, options = {}) {
    const res = await fetch(API + path, {
      ...options,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    return res;
  }
  const repoPath = () => `/repos/${cfg.owner}/${cfg.repo}`;

  async function getSha(path) {
    const res = await gh(`${repoPath()}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`);
    if (res.status === 200) { const j = await res.json(); return j.sha; }
    return null;
  }
  async function putFile(path, text, message) {
    const sha = await getSha(path);
    const body = { message, content: utf8ToB64(text), branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await gh(`${repoPath()}/contents/${encodeURI(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text(); throw new Error(`${path} 실패 (${res.status}): ${t.slice(0, 120)}`); }
    return res.json();
  }
  async function deleteFile(path, message) {
    const sha = await getSha(path);
    if (!sha) return false;
    const res = await gh(`${repoPath()}/contents/${encodeURI(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: cfg.branch })
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`${path} 삭제 실패 (${res.status}): ${t.slice(0, 120)}`); }
    return true;
  }
  async function listDir(path) {
    const res = await gh(`${repoPath()}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`);
    return res.json();
  }
  async function loadIndex() {
    // 생성된 index.json 을 API로 읽어 작품/회차 정보 확보
    const res = await gh(`${repoPath()}/contents/app/data/index.json?ref=${encodeURIComponent(cfg.branch)}`);
    if (res.status !== 200) return null;
    const j = await res.json();
    try { return JSON.parse(b64ToUtf8(j.content)); } catch (e) { return null; }
  }

  // ---------- 연결 ----------
  async function testConnection() {
    saveCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) { setConn(false, '입력 필요'); log('사용자명·저장소·토큰을 모두 입력하세요.', 'err'); return; }
    log('연결 확인 중…', 'info');
    try {
      const res = await gh(repoPath());
      if (!res.ok) { setConn(false, '실패'); log(`연결 실패 (${res.status}). 정보와 토큰 권한을 확인하세요.`, 'err'); return; }
      const repo = await res.json();
      setConn(true, '연결됨');
      log(`✔ 연결 성공: ${repo.full_name} (기본 브랜치: ${repo.default_branch})`, 'ok');
      document.querySelectorAll('.locked').forEach(el => el.classList.remove('locked'));
      $('link-actions').href = `https://github.com/${cfg.owner}/${cfg.repo}/actions`;
      await refreshLists();
    } catch (e) {
      setConn(false, '오류'); log('연결 오류: ' + e.message, 'err');
    }
  }
  function setConn(ok, text) {
    const el = $('conn-status');
    el.textContent = text;
    el.classList.toggle('on', ok);
    el.classList.toggle('off', !ok);
  }

  // ---------- 작품 목록 (select + 관리) ----------
  async function refreshLists() {
    index = await loadIndex();
    // 폴더 기준 목록(권위) — index.json 없을 때 대비
    let novelDirs = [];
    try { novelDirs = (await listDir(CONTENT_BASE)).filter(x => x.type === 'dir').map(x => x.name); } catch (e) {}

    const byIndex = {};
    if (index) for (const n of index.novels) byIndex[n.slug] = n;

    // select 채우기
    const sel = $('novel-select');
    const opts = ['<option value="">작품을 선택하세요</option>'];
    const slugs = Array.from(new Set([...(index ? index.novels.map(n => n.slug) : []), ...novelDirs]));
    for (const slug of slugs) {
      const title = byIndex[slug] ? byIndex[slug].title : slug;
      opts.push(`<option value="${KG.escapeHtml(slug)}">${KG.escapeHtml(title)} (${slug})</option>`);
    }
    opts.push('<option value="__new__">➕ 새 작품 만들기…</option>');
    sel.innerHTML = opts.join('');

    // 관리 목록
    renderManage(slugs, byIndex);
  }

  function renderManage(slugs, byIndex) {
    const box = $('manage-list');
    if (!slugs.length) { box.innerHTML = '<p class="sub">아직 등록된 작품이 없습니다. 위에서 새 작품을 업로드해 보세요.</p>'; return; }
    box.innerHTML = slugs.map(slug => {
      const n = byIndex[slug];
      const eps = n ? n.episodes : [];
      const epRows = eps.map(e => `
        <div class="mn-ep">
          <span class="fi-no">${e.num != null ? e.num + '화' : e.order + '화'}</span>
          <span class="mn-ep-title">${KG.escapeHtml(e.title)} <span style="color:var(--text-faint)">(${e.file})</span></span>
          <button data-del-ep="${KG.escapeHtml(slug)}|${KG.escapeHtml(e.file)}">삭제</button>
        </div>`).join('') || '<div class="mn-ep" style="color:var(--text-faint)">회차 정보 없음 (아직 인덱싱 전일 수 있음)</div>';
      return `
        <div class="manage-novel" data-slug="${KG.escapeHtml(slug)}">
          <div class="mn-head">
            <span class="mn-title">${KG.escapeHtml(n ? n.title : slug)}</span>
            <span class="mn-count">${n ? n.episodeCount + '화' : slug}</span>
            <span class="chev">▾</span>
          </div>
          <div class="mn-body">
            ${epRows}
            <button class="mn-del-novel" data-del-novel="${KG.escapeHtml(slug)}">이 작품 전체 삭제</button>
          </div>
        </div>`;
    }).join('');

    box.querySelectorAll('.mn-head').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    box.querySelectorAll('[data-del-ep]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); onDeleteEpisode(b.dataset.delEp); }));
    box.querySelectorAll('[data-del-novel]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); onDeleteNovel(b.dataset.delNovel); }));
  }

  // ---------- 파일 선택/드롭 ----------
  function parseFileMeta(name, text) {
    const stem = name.replace(/\.(md|txt)$/i, '');
    const numMatch = stem.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;
    let title = null;
    const fm = text.match(/^﻿?---\s*[\r\n]([\s\S]*?)[\r\n]---/);
    if (fm) { const t = fm[1].match(/title\s*:\s*(.+)/); if (t) title = t[1].trim().replace(/^["']|["']$/g, ''); }
    if (!title) { const h = text.match(/^﻿?#\s+(.+)$/m); if (h) title = h[1].trim(); }
    if (!title) title = num != null ? `${num}화` : stem;
    return { num, title };
  }
  function addFiles(fileList) {
    const arr = Array.from(fileList).filter(f => /\.(md|txt)$/i.test(f.name));
    if (!arr.length) { log('md 또는 txt 파일만 업로드할 수 있습니다.', 'err'); return; }
    let pending = arr.length;
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        const meta = parseFileMeta(f.name, text);
        if (!files.some(x => x.name === f.name)) files.push({ name: f.name, text, num: meta.num, title: meta.title });
        if (--pending === 0) renderFileList();
      };
      reader.readAsText(f);
    });
  }
  function renderFileList() {
    files.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9) || a.name.localeCompare(b.name));
    $('file-list').innerHTML = files.map((f, i) => `
      <div class="file-item">
        <span class="fi-no">${f.num != null ? f.num + '화' : '?'}</span>
        <span class="fi-main"><div class="fi-title">${KG.escapeHtml(f.title)}</div><div class="fi-name">${KG.escapeHtml(f.name)}</div></span>
        <button class="fi-del" data-i="${i}" title="빼기">✕</button>
      </div>`).join('');
    $('file-list').querySelectorAll('.fi-del').forEach(b => b.addEventListener('click', () => { files.splice(+b.dataset.i, 1); renderFileList(); }));
  }

  // ---------- 업로드 ----------
  async function doUpload() {
    if (!cfg.token) { log('먼저 GitHub 연결을 완료하세요.', 'err'); return; }
    let slug = $('novel-select').value;
    if (!slug) { log('작품을 선택하세요.', 'err'); return; }

    // 새 작품
    if (slug === '__new__') {
      slug = $('nn-slug').value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
      if (!slug) { log('새 작품의 폴더명을 입력하세요 (영문).', 'err'); return; }
      const meta = {
        title: $('nn-title').value.trim() || slug,
        genre: $('nn-genre').value.trim() || '미분류',
        status: $('nn-status').value,
        description: $('nn-desc').value.trim(),
        cover: '',
        featured: $('nn-featured').checked,
        popularity: 0,
        order: parseInt($('nn-order').value, 10) || 10
      };
      try {
        log(`새 작품 '${meta.title}' 등록 중…`, 'info');
        await putFile(`${CONTENT_BASE}/${slug}/meta.json`, JSON.stringify(meta, null, 2) + '\n', `admin: 새 작품 등록 (${meta.title})`);
        log('✔ meta.json 생성 완료', 'ok');
      } catch (e) { log('✖ ' + e.message, 'err'); return; }
    }

    if (!files.length) { log('업로드할 회차 파일을 추가하세요.', 'err'); return; }
    $('btn-upload').classList.add('locked');
    let done = 0;
    for (const f of files) {
      try {
        log(`업로드 중: ${f.name} …`, 'info');
        await putFile(`${CONTENT_BASE}/${slug}/${f.name}`, f.text, `admin: ${f.name} 업로드`);
        done++;
        log(`✔ ${f.name} 완료 (${done}/${files.length})`, 'ok');
      } catch (e) {
        log('✖ ' + e.message, 'err');
      }
    }
    $('btn-upload').classList.remove('locked');
    log(`🎉 업로드 완료: ${done}개 파일. 1~2분 뒤 사이트에 반영됩니다. (GitHub Actions에서 진행 상황 확인 가능)`, 'ok');
    files = []; renderFileList();
    setTimeout(refreshLists, 1500);
  }

  // ---------- 삭제 ----------
  async function onDeleteEpisode(payload) {
    const [slug, file] = payload.split('|');
    if (!confirm(`'${file}' 회차를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      log(`삭제 중: ${file} …`, 'info');
      await deleteFile(`${CONTENT_BASE}/${slug}/${file}`, `admin: ${file} 삭제`);
      log(`✔ ${file} 삭제 완료`, 'ok');
      setTimeout(refreshLists, 1200);
    } catch (e) { log('✖ ' + e.message, 'err'); }
  }
  async function onDeleteNovel(slug) {
    if (!confirm(`'${slug}' 작품 전체(모든 회차 포함)를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      log(`'${slug}' 작품 삭제 중…`, 'info');
      const items = await listDir(`${CONTENT_BASE}/${slug}`);
      for (const it of items) {
        if (it.type === 'file') { await deleteFile(`${CONTENT_BASE}/${slug}/${it.name}`, `admin: ${slug} 삭제`); log(`  - ${it.name} 삭제`, 'ok'); }
      }
      log(`✔ '${slug}' 작품 삭제 완료. 곧 사이트에 반영됩니다.`, 'ok');
      setTimeout(refreshLists, 1500);
    } catch (e) { log('✖ ' + e.message, 'err'); }
  }

  // ---------- 이벤트 바인딩 ----------
  fillCfgForm();
  if (cfg.owner && cfg.repo && cfg.token) testConnection();

  $('btn-test').addEventListener('click', testConnection);
  $('btn-clear').addEventListener('click', () => {
    try { localStorage.removeItem('kg-admin-cfg'); localStorage.removeItem('kg-admin-token'); sessionStorage.removeItem('kg-admin-token'); } catch (e) {}
    cfg = { owner: '', repo: '', branch: 'main', token: '', remember: false };
    fillCfgForm(); setConn(false, '미연결');
    document.querySelectorAll('#upload-section,#manage-section').forEach(el => el.classList.add('locked'));
    log('설정을 지웠습니다.', 'info');
  });

  $('novel-select').addEventListener('change', e => {
    $('new-novel-fields').hidden = e.target.value !== '__new__';
  });

  const dz = $('dropzone'), fi = $('file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
  fi.addEventListener('change', () => { addFiles(fi.files); fi.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

  $('btn-upload').addEventListener('click', doUpload);
  $('btn-clear-files').addEventListener('click', () => { files = []; renderFileList(); });
  $('btn-refresh').addEventListener('click', () => { log('목록 새로고침…', 'info'); refreshLists(); });
})();
