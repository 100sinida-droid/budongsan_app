/* 메인 페이지 로직 */
(async function () {
  await KG.boot('home');
  const cfg = await KG.getConfig();

  KG.setMeta({ path: '/', type: 'website' });

  // 히어로 & 작가 소개 텍스트
  document.getElementById('hero-tagline').textContent = cfg.tagline || '';
  document.getElementById('author-name').textContent = cfg.author?.name || '작가';
  document.getElementById('author-intro').textContent = cfg.author?.intro || cfg.author?.bio || '';

  let data;
  try {
    data = await KG.fetchJSON('/app/data/index.json');
  } catch (e) {
    document.getElementById('latest-grid').innerHTML = errorBox();
    return;
  }

  // 통계
  document.getElementById('hero-stats').innerHTML = `
    <div><div class="num">${data.counts.novels}</div><div class="lbl">작품</div></div>
    <div><div class="num">${data.counts.episodes}</div><div class="lbl">회차</div></div>`;

  // JSON-LD (조직/사이트)
  KG.setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: cfg.siteName,
    url: cfg.baseUrl,
    description: cfg.description,
    author: { '@type': 'Person', name: cfg.author?.name }
  });

  const novels = data.novels || [];

  // 대표작
  const featured = novels.filter(n => n.featured);
  if (featured.length) {
    document.getElementById('featured-section').hidden = false;
    document.getElementById('featured-grid').innerHTML = featured.map(novelCard).join('');
  }

  // 최신 업데이트 (lastUpdated 내림차순)
  const latest = [...novels].sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || ''))).slice(0, 8);
  document.getElementById('latest-grid').innerHTML = latest.length
    ? latest.map(novelCard).join('')
    : emptyBox('아직 등록된 작품이 없습니다', 'content/novels 폴더에 작품을 추가해 주세요.');

  // 인기작 (popularity 내림차순, popularity>0 있을 때만)
  const popular = [...novels].filter(n => n.popularity > 0).sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  if (popular.length) {
    document.getElementById('popular-section').hidden = false;
    document.getElementById('popular-grid').innerHTML = popular.map(novelCard).join('');
  }

  // 최근 추가된 회차
  const recent = (data.recentEpisodes || []).slice(0, 8);
  document.getElementById('recent-list').innerHTML = recent.length
    ? recent.map(recentRow).join('')
    : emptyBox('최근 추가된 회차가 없습니다', '');

  // ---------- 렌더 헬퍼 ----------
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

  function recentRow(e) {
    return `
      <a class="list-row" href="/app/read.html?novel=${encodeURIComponent(e.novelSlug)}&ep=${encodeURIComponent(e.id)}">
        <div class="ep-no">${e.num != null ? e.num + '화' : e.order + '화'}</div>
        <div class="row-main">
          <div class="row-title">${KG.escapeHtml(e.title)}</div>
          <div class="row-sub"><span class="novel-tag">${KG.escapeHtml(e.novelTitle)}</span> · ${KG.formatRelative(e.date)}</div>
        </div>
        <div class="chev">›</div>
      </a>`;
  }

  function emptyBox(t, s) { return `<div class="empty" style="grid-column:1/-1"><div class="big">📚</div><p>${t}</p><p style="font-size:13px">${s}</p></div>`; }
  function errorBox() { return `<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div><p>데이터를 불러오지 못했습니다.</p><p style="font-size:13px">data/index.json 이 생성되었는지 확인해 주세요.</p></div>`; }

  // ---------- 방명록 ----------
  initGuestbook();
  async function initGuestbook() {
    const listEl = document.getElementById('gb-list');
    const form = document.getElementById('gb-form');
    const hint = document.getElementById('gb-hint');
    if (!form) return;

    async function load() {
      try {
        const res = await fetch('/api/guestbook', { cache: 'no-store' });
        const data = await res.json();
        if (!data.configured) {
          listEl.innerHTML = `<div class="gb-note">방명록 저장소(Cloudflare KV)가 아직 연결되지 않았습니다. 설정 후 방명록이 활성화됩니다. 그동안 위 이메일로 남겨주세요.</div>`;
          return;
        }
        renderList(data.entries || []);
      } catch (e) {
        listEl.innerHTML = `<div class="gb-note">방명록을 불러오지 못했습니다.</div>`;
      }
    }
    function renderList(entries) {
      if (!entries.length) { listEl.innerHTML = `<div class="gb-note">첫 방명록을 남겨보세요! 🌱</div>`; return; }
      listEl.innerHTML = entries.map(e => `
        <div class="gb-item">
          <div class="gb-item-top"><span class="gb-name">${KG.escapeHtml(e.name || '익명')}</span><span class="gb-date">${KG.formatRelative(e.date)}</span></div>
          <div class="gb-msg">${KG.escapeHtml(e.message)}</div>
        </div>`).join('');
    }

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const name = document.getElementById('gb-name').value;
      const message = document.getElementById('gb-message').value.trim();
      const hp = document.getElementById('gb-hp').value;
      if (!message) { hint.textContent = '내용을 입력해 주세요.'; return; }
      const btn = document.getElementById('gb-submit');
      btn.classList.add('locked'); hint.textContent = '';
      try {
        const res = await fetch('/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message, hp }) });
        const data = await res.json();
        if (!res.ok) { hint.textContent = data.error || '등록에 실패했습니다.'; }
        else {
          document.getElementById('gb-message').value = '';
          hint.textContent = '남겨주셔서 감사합니다! 💜';
          load();
        }
      } catch (e) { hint.textContent = '오류가 발생했습니다.'; }
      finally { btn.classList.remove('locked'); }
    });

    load();
  }
})();
