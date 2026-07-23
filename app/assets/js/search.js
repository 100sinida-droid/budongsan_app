/* 검색 페이지 - 작품명 / 회차 제목 / 본문 일부 검색 */
(async function () {
  await KG.boot('search');
  KG.setMeta({ title: '검색', path: '/app/search.html' });

  const input = document.getElementById('q');
  const metaEl = document.getElementById('search-meta');
  const resultsEl = document.getElementById('results');

  let docs = [];
  try {
    const d = await KG.fetchJSON('/app/data/search.json');
    docs = d.docs || [];
  } catch (e) {
    metaEl.textContent = '검색 색인을 불러오지 못했습니다.';
    return;
  }

  // URL ?q= 지원
  const initial = KG.qs('q');
  if (initial) { input.value = initial; }

  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  run();

  function run() {
    const q = input.value.trim();
    // URL 갱신(뒤로가기/공유 지원)
    const url = q ? `/app/search.html?q=${encodeURIComponent(q)}` : '/app/search.html';
    history.replaceState(null, '', url);

    if (q.length < 1) {
      metaEl.textContent = '';
      resultsEl.innerHTML = tips();
      return;
    }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const doc of docs) {
      const hay = (doc.type === 'novel'
        ? [doc.title, doc.genre, doc.description]
        : [doc.novelTitle, doc.title, doc.body]).join(' ').toLowerCase();
      // 모든 단어 포함 시 매칭
      if (!terms.every(t => hay.includes(t))) continue;
      let score = 0;
      const titleHay = (doc.title || '').toLowerCase();
      const novelHay = (doc.novelTitle || doc.title || '').toLowerCase();
      for (const t of terms) {
        if (titleHay.includes(t)) score += 10;
        if (novelHay.includes(t)) score += 6;
        if (doc.type === 'novel') score += 4;
      }
      scored.push({ doc, score });
    }
    scored.sort((a, b) => b.score - a.score);

    metaEl.textContent = `"${q}" 검색 결과 ${scored.length}건`;
    if (!scored.length) {
      resultsEl.innerHTML = `<div class="empty"><div class="big">🔍</div><p>검색 결과가 없습니다.</p><p style="font-size:13px">다른 검색어로 시도해 보세요.</p></div>`;
      return;
    }
    resultsEl.innerHTML = scored.slice(0, 60).map(({ doc }) => row(doc, terms)).join('');
  }

  function row(doc, terms) {
    if (doc.type === 'novel') {
      return `
        <a class="search-result" href="/novel/${encodeURIComponent(doc.slug)}">
          <div class="sr-top"><span class="badge">작품</span> <span>${KG.escapeHtml(doc.genre || '')}</span></div>
          <div class="sr-title">${hl(doc.title, terms)}</div>
          <div class="sr-body">${hl(doc.description || '', terms)}</div>
        </a>`;
    }
    const bodySnippet = makeSnippet(doc.body || '', terms);
    return `
      <a class="search-result" href="/app/read.html?novel=${encodeURIComponent(doc.slug)}&ep=${encodeURIComponent(doc.id)}">
        <div class="sr-top"><span class="badge">회차</span> <span>${hl(doc.novelTitle, terms)}</span> · ${doc.num != null ? doc.num + '화' : (doc.order + '화')}</div>
        <div class="sr-title">${hl(doc.title, terms)}</div>
        <div class="sr-body">${bodySnippet}</div>
      </a>`;
  }

  function makeSnippet(body, terms) {
    const low = body.toLowerCase();
    let pos = -1;
    for (const t of terms) { const p = low.indexOf(t); if (p !== -1 && (pos === -1 || p < pos)) pos = p; }
    if (pos === -1) return hl(body.slice(0, 120), terms);
    const start = Math.max(0, pos - 40);
    const snip = (start > 0 ? '…' : '') + body.slice(start, start + 140) + '…';
    return hl(snip, terms);
  }

  function hl(text, terms) {
    let s = KG.escapeHtml(text || '');
    for (const t of terms) {
      if (!t) continue;
      const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      s = s.replace(re, '<mark>$1</mark>');
    }
    return s;
  }

  function tips() {
    return `<div class="empty"><div class="big">✍️</div><p>검색어를 입력해 보세요.</p><p style="font-size:13px">작품명, 회차 제목, 본문 내용 모두 검색됩니다.</p></div>`;
  }
})();
