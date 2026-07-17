/* 작품 상세 페이지 */
(async function () {
  await KG.boot('novels');
  const slug = KG.qs('slug');
  const root = document.getElementById('novel-root');

  if (!slug) { root.innerHTML = notFound('작품을 찾을 수 없습니다.'); return; }

  let data;
  try { data = await KG.fetchJSON('/app/data/index.json'); }
  catch (e) { root.innerHTML = notFound('데이터를 불러오지 못했습니다.'); return; }

  const n = (data.novels || []).find(x => x.slug === slug);
  if (!n) { root.innerHTML = notFound('작품을 찾을 수 없습니다.'); return; }

  const cfg = await KG.getConfig();
  KG.setMeta({
    title: n.title,
    description: n.description || `${n.title} - ${n.genre} · ${n.episodeCount}화`,
    path: `/app/novel.html?slug=${encodeURIComponent(n.slug)}`,
    type: 'book'
  });
  KG.setJsonLd({
    '@context': 'https://schema.org', '@type': 'Book',
    name: n.title, genre: n.genre, author: { '@type': 'Person', name: cfg.author?.name },
    numberOfPages: n.episodeCount, description: n.description
  });

  const eps = n.episodes || [];
  const firstId = eps[0] ? eps[0].id : null;

  // "이어보기" - localStorage에 저장된 마지막 회차
  let resumeId = null;
  try { resumeId = localStorage.getItem('kg-last-' + slug); } catch (e) {}
  if (!eps.some(e => e.id === resumeId)) resumeId = null;

  const cover = n.cover
    ? `<img src="${KG.escapeHtml(n.cover)}" alt="${KG.escapeHtml(n.title)} 표지">`
    : `<div class="cover-title">${KG.escapeHtml(n.title)}</div>`;

  root.innerHTML = `
    <nav style="margin:18px 0 4px;font-size:13.5px;color:var(--text-faint);font-weight:600">
      <a href="/app/novels.html" style="color:var(--text-faint)">작품 목록</a> › <span>${KG.escapeHtml(n.title)}</span>
    </nav>
    <div class="novel-hero">
      <div class="cover-lg">${cover}</div>
      <div class="info">
        <span class="badge status-${KG.escapeHtml(n.status)}">${KG.escapeHtml(n.status)}</span>
        <h1>${KG.escapeHtml(n.title)}</h1>
        <div class="meta-row">
          <span>📚 ${KG.escapeHtml(n.genre)}</span>
          <span>📄 총 ${n.episodeCount}화</span>
          <span>🕒 ${KG.formatDate(n.lastUpdated)} 업데이트</span>
        </div>
        <div class="desc">${KG.escapeHtml(n.description || '작품 소개가 준비 중입니다.')}</div>
        <div class="actions">
          ${firstId ? `<a class="btn btn-primary" href="/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(firstId)}">1화 보기</a>` : ''}
          ${resumeId ? `<a class="btn btn-ghost" href="/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(resumeId)}">이어보기</a>` : ''}
        </div>
      </div>
    </div>

    <div class="ep-toolbar">
      <h2>회차 목록 <span style="color:var(--text-faint);font-weight:600;font-size:14px">(${eps.length})</span></h2>
      <button class="sort-btn" id="sort-btn">↓ 최신순</button>
    </div>
    <div class="list" id="ep-list"></div>
    <div class="ad-slot"></div>
  `;
  if (KG.renderAds) KG.renderAds();

  let desc = false; // false=오름차순(1화부터)
  const listEl = document.getElementById('ep-list');
  const sortBtn = document.getElementById('sort-btn');
  sortBtn.addEventListener('click', () => { desc = !desc; sortBtn.textContent = desc ? '↑ 오래된순' : '↓ 최신순'; renderEps(); });

  function renderEps() {
    const list = desc ? [...eps].reverse() : eps;
    listEl.innerHTML = list.map(e => `
      <a class="list-row" href="/app/read.html?novel=${encodeURIComponent(slug)}&ep=${encodeURIComponent(e.id)}">
        <div class="ep-no">${e.num != null ? e.num + '화' : e.order + '화'}</div>
        <div class="row-main">
          <div class="row-title">${KG.escapeHtml(e.title)}</div>
          <div class="row-sub">${KG.formatDate(e.date)} · ${e.words.toLocaleString()}자</div>
        </div>
        <div class="chev">›</div>
      </a>`).join('') || `<div class="empty"><p>등록된 회차가 없습니다.</p></div>`;
  }
  renderEps();

  function notFound(msg) {
    return `<div class="empty" style="padding:80px 20px"><div class="big">🔍</div><p>${msg}</p><p style="font-size:13px"><a href="/app/novels.html" style="color:var(--brand);font-weight:700">작품 목록으로 돌아가기</a></p></div>`;
  }
})();
