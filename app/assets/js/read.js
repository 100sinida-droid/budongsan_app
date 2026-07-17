/* 소설 읽기 페이지 */
(async function () {
  KG.initTheme();
  // 테마 토글 버튼들 연결
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', KG.toggleTheme));
  syncThemeIcon();

  const slug = KG.qs('novel');
  const epId = KG.qs('ep');
  const reader = document.getElementById('reader');
  const nav = document.getElementById('reader-nav');

  if (!slug || !epId) { showError('잘못된 접근입니다.'); return; }

  // 글자 크기 설정 복원
  const FONT_KEY = 'kg-reader-font';
  let fontSize = 18;
  try { const v = parseInt(localStorage.getItem(FONT_KEY), 10); if (v >= 14 && v <= 30) fontSize = v; } catch (e) {}
  applyFont();

  let data;
  try { data = await KG.fetchJSON('/app/data/index.json'); }
  catch (e) { showError('데이터를 불러오지 못했습니다.'); return; }

  const n = (data.novels || []).find(x => x.slug === slug);
  if (!n) { showError('작품을 찾을 수 없습니다.'); return; }
  const eps = n.episodes || [];
  const idx = eps.findIndex(e => e.id === epId);
  if (idx === -1) { showError('회차를 찾을 수 없습니다.'); return; }
  const ep = eps[idx];
  const prev = eps[idx - 1] || null;
  const next = eps[idx + 1] || null;

  // 이어보기 저장
  try { localStorage.setItem('kg-last-' + slug, epId); } catch (e) {}

  // 본문 로드
  let md;
  try { md = await KG.fetchText(`/app/content/novels/${encodeURIComponent(slug)}/${encodeURIComponent(ep.file)}`); }
  catch (e) { showError('본문을 불러오지 못했습니다.'); return; }

  // SEO
  const cfg = await KG.getConfig();
  KG.setMeta({
    title: `${ep.title} - ${n.title}`,
    description: (ep.snippet || n.description || '').slice(0, 120),
    path: `/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(epId)}`,
    type: 'article'
  });
  KG.setJsonLd({
    '@context': 'https://schema.org', '@type': 'Chapter',
    name: ep.title, isPartOf: { '@type': 'Book', name: n.title },
    author: { '@type': 'Person', name: cfg.author?.name }, datePublished: ep.date
  });

  // 상단바 제목
  document.getElementById('top-title').innerHTML =
    `${KG.escapeHtml(ep.title)}<small>${KG.escapeHtml(n.title)}</small>`;
  document.getElementById('btn-list').href = `/app/novel.html?slug=${encodeURIComponent(slug)}`;

  // 본문 렌더 (상단 제목과 중복되는 맨 앞 헤딩 한 줄은 제거)
  let bodyMd = String(md).replace(/^﻿/, '');
  bodyMd = bodyMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');   // 프론트매터 제거
  bodyMd = bodyMd.replace(/^\s*#{1,6}\s+.*(?:\n|$)/, '');        // 맨 앞 제목 줄 제거
  const epNum = ep.num != null ? `${ep.num}화` : `${ep.order}화`;
  reader.innerHTML = `
    <div class="ep-head">
      <a class="novel-name" href="/app/novel.html?slug=${encodeURIComponent(slug)}">${KG.escapeHtml(n.title)}</a>
      <h1>${KG.escapeHtml(ep.title)}</h1>
      <div class="ep-info">${epNum} · ${KG.formatDate(ep.date)} · ${ep.words.toLocaleString()}자</div>
    </div>
    <div class="reader-body" id="reader-body">${KG.renderMarkdown(bodyMd)}</div>
  `;

  // 상/하단 내비게이션
  const navHtml = `
    ${prev ? `<a class="btn btn-ghost" href="/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(prev.id)}">‹ 이전화</a>` : `<span class="btn btn-ghost" disabled>‹ 이전화</span>`}
    <a class="btn btn-ghost" href="/app/novel.html?slug=${encodeURIComponent(slug)}">목록</a>
    ${next ? `<a class="btn btn-primary" href="/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(next.id)}">다음화 ›</a>` : `<span class="btn btn-primary" disabled>다음화 ›</span>`}
  `;
  nav.innerHTML = navHtml;

  // 하단 FAB
  const fab = document.getElementById('reader-fab');
  fab.hidden = false;
  syncThemeIcon();
  document.getElementById('fab-prev').onclick = () => { if (prev) location.href = `/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(prev.id)}`; };
  document.getElementById('fab-next').onclick = () => { if (next) location.href = `/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(next.id)}`; };
  if (!prev) document.getElementById('fab-prev').style.opacity = '.35';
  if (!next) document.getElementById('fab-next').style.opacity = '.35';
  document.getElementById('fab-font-up').onclick = () => { fontSize = Math.min(30, fontSize + 1); applyFont(); saveFont(); };
  document.getElementById('fab-font-down').onclick = () => { fontSize = Math.max(14, fontSize - 1); applyFont(); saveFont(); };

  // 키보드 좌우 방향키로 이동
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && prev) location.href = `/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(prev.id)}`;
    if (e.key === 'ArrowRight' && next) location.href = `/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(next.id)}`;
  });

  window.scrollTo(0, 0);

  // ---------- 헬퍼 ----------
  function applyFont() {
    document.documentElement.style.setProperty('--reader-font', fontSize + 'px');
    document.documentElement.style.setProperty('--reader-lh', (fontSize >= 22 ? 2.0 : 1.9).toString());
  }
  function saveFont() { try { localStorage.setItem(FONT_KEY, String(fontSize)); } catch (e) {} }
  function syncThemeIcon() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-icon]').forEach(i => i.textContent = dark ? '☀️' : '🌙');
  }
  function showError(msg) {
    reader.innerHTML = `<div class="empty" style="padding:70px 20px"><div class="big">🔍</div><p>${msg}</p><p style="font-size:13px"><a href="/" style="color:var(--brand);font-weight:700">홈으로 돌아가기</a></p></div>`;
    nav.innerHTML = '';
  }
})();
