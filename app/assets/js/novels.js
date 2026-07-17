/* 작품 목록 페이지 */
(async function () {
  await KG.boot('novels');
  KG.setMeta({ title: '작품 목록', path: '/app/novels.html' });

  let data;
  try { data = await KG.fetchJSON('/app/data/index.json'); }
  catch (e) {
    document.getElementById('novels-grid').innerHTML = errorBox();
    return;
  }

  const novels = (data.novels || []).slice().sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || ''));
  });

  document.getElementById('count-line').textContent =
    `총 ${data.counts.novels}개 작품 · ${data.counts.episodes}개 회차`;

  // 장르 칩
  const genres = ['전체', ...Array.from(new Set(novels.map(n => n.genre).filter(Boolean)))];
  let activeGenre = '전체';
  const chipsEl = document.getElementById('genre-chips');
  chipsEl.innerHTML = genres.map(g => `<button class="chip ${g === '전체' ? 'active' : ''}" data-genre="${KG.escapeHtml(g)}">${KG.escapeHtml(g)}</button>`).join('');
  chipsEl.addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    activeGenre = btn.dataset.genre;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === btn));
    render();
  });

  function render() {
    const list = activeGenre === '전체' ? novels : novels.filter(n => n.genre === activeGenre);
    document.getElementById('novels-grid').innerHTML = list.length
      ? list.map(novelCard).join('')
      : emptyBox('해당 장르의 작품이 없습니다', '');
  }
  render();

  KG.setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '작품 목록',
    hasPart: novels.map(n => ({ '@type': 'Book', name: n.title, genre: n.genre }))
  });

  function novelCard(n) {
    const cover = n.cover
      ? `<img src="${KG.escapeHtml(n.cover)}" alt="${KG.escapeHtml(n.title)} 표지" loading="lazy">`
      : `<div class="cover-title">${KG.escapeHtml(n.title)}</div>`;
    return `
      <a class="card" href="/app/novel.html?slug=${encodeURIComponent(n.slug)}">
        <div class="novel-cover">
          <span class="cover-badge badge status-${KG.escapeHtml(n.status)}">${KG.escapeHtml(n.status)}</span>
          ${cover}
        </div>
        <div class="card-body">
          <div class="genre">${KG.escapeHtml(n.genre)}</div>
          <h3>${KG.escapeHtml(n.title)}</h3>
          <p class="desc">${KG.escapeHtml(n.description || '소개가 준비 중입니다.')}</p>
          <div class="card-meta">
            <span>${n.episodeCount}화</span><span class="dot"></span>
            <span>${KG.formatRelative(n.lastUpdated)}</span>
          </div>
        </div>
      </a>`;
  }
  function emptyBox(t, s) { return `<div class="empty" style="grid-column:1/-1"><div class="big">📚</div><p>${t}</p><p style="font-size:13px">${s}</p></div>`; }
  function errorBox() { return `<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div><p>데이터를 불러오지 못했습니다.</p></div>`; }
})();
