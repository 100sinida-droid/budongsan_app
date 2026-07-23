/* =========================================================
   관리자 백엔드 공통 로직 (Cloudflare Pages Functions)
   - 라우트 파일(login.js/list.js/upload.js/delete.js)이 이 파일을 가져다 씁니다.
   - 파일명이 '_' 로 시작하면 라우트가 되지 않고 import 전용입니다.
   ========================================================= */

const CONTENT_BASE = 'app/content/novels';
const DATA_INDEX = 'app/data/index.json';
const DATA_SEARCH = 'app/data/search.json';
const SITEMAP = 'app/sitemap.xml';
const CONFIG_PATH = 'app/site.config.json';
const SEARCH_BODY_LIMIT = 1500;
const SNIPPET_LIMIT = 90;

export function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function getCFG(env) {
  return {
    user: env.ADMIN_USERNAME || 'sinida',
    pass: env.ADMIN_PASSWORD || 'shin6464^^',
    owner: env.GITHUB_OWNER || '',
    repo: env.GITHUB_REPO || '',
    branch: env.GITHUB_BRANCH || 'main',
    token: env.GITHUB_TOKEN || '',
    secret: env.SESSION_SECRET || ((env.ADMIN_PASSWORD || 'shin6464^^') + '::kg-session-v1')
  };
}

/* ---------- 라우트 핸들러 (라우트 파일이 호출) ---------- */
export async function onLogin(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const CFG = getCFG(env);
  const { username, password } = await request.json();
  if (username === CFG.user && password === CFG.pass) return json({ ok: true, token: await makeToken(CFG.user, CFG.secret) });
  return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
}
export async function onList(request, env) {
  const g = await guard(request, env); if (g.res) return g.res;
  return listNovels(g.CFG);
}
export async function onUpload(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const g = await guard(request, env); if (g.res) return g.res;
  return upload(request, g.CFG);
}
export async function onDelete(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const g = await guard(request, env); if (g.res) return g.res;
  return del(request, g.CFG);
}
export async function onUpdate(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const g = await guard(request, env); if (g.res) return g.res;
  return updateNovel(request, g.CFG);
}
/* ---------- 방문자 카운터 ---------- */
export async function onVisit(request, env) {
  const kv = env.KG_KV;
  const kstDay = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!kv) return json({ configured: false, today: 0, total: 0, date: kstDay });
  const dayKey = 'counter:day:' + kstDay;
  const readNum = async k => parseInt((await kv.get(k)) || '0', 10) || 0;
  if (request.method === 'POST') {
    const total = (await readNum('counter:total')) + 1;
    const day = (await readNum(dayKey)) + 1;
    await kv.put('counter:total', String(total));
    await kv.put(dayKey, String(day), { expirationTtl: 60 * 60 * 24 * 7 });
    return json({ configured: true, today: day, total, date: kstDay });
  }
  return json({ configured: true, today: await readNum(dayKey), total: await readNum('counter:total'), date: kstDay });
}

/* ---------- 방명록 ---------- */
export async function onGuestbook(request, env) {
  const kv = env.KG_KV;
  if (!kv) return json({ configured: false, entries: [] });
  const readAll = async () => { try { return JSON.parse((await kv.get('guestbook')) || '[]'); } catch (e) { return []; } };
  if (request.method === 'GET') return json({ configured: true, entries: (await readAll()).slice(0, 100) });
  if (request.method === 'POST') {
    let body = {}; try { body = await request.json(); } catch (e) {}
    if (body.action === 'delete') {
      if (!(await isAdmin(request, env))) return json({ error: '인증이 필요합니다.' }, 401);
      const arr = (await readAll()).filter(e => e.id !== body.id);
      await kv.put('guestbook', JSON.stringify(arr));
      return json({ ok: true });
    }
    if (body.hp) return json({ ok: true });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = 'gb:rl:' + ip;
    if (await kv.get(rlKey)) return json({ error: '잠시 후 다시 남겨주세요.' }, 429);
    const name = (String(body.name || '').trim().slice(0, 20)) || '익명';
    const message = String(body.message || '').trim().slice(0, 500);
    if (message.length < 1) return json({ error: '내용을 입력해 주세요.' }, 400);
    const arr = await readAll();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const entry = { id, name, message, date: new Date().toISOString() };
    arr.unshift(entry);
    if (arr.length > 300) arr.length = 300;
    await kv.put('guestbook', JSON.stringify(arr));
    await kv.put(rlKey, '1', { expirationTtl: 30 });
    return json({ ok: true, entry });
  }
  return json({ error: 'method' }, 405);
}

export async function isAdmin(request, env) {
  const CFG = getCFG(env);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return verifyToken(token, CFG.secret);
}
async function guard(request, env) {
  const CFG = getCFG(env);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyToken(token, CFG.secret))) return { res: json({ error: '로그인이 필요합니다.' }, 401) };
  if (!CFG.token || !CFG.owner || !CFG.repo) return { res: json({ error: '서버 설정 누락: 환경변수 GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO 를 확인하세요.' }, 500) };
  return { CFG };
}

/* ---------- 토큰 ---------- */
const enc = s => new TextEncoder().encode(s);
function b64url(bytes) { let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(str) { return b64url(enc(str)); }
function fromB64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
async function hmac(data, secret) { const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(data)))); }
async function makeToken(user, secret) { const p = b64urlStr(JSON.stringify({ u: user, exp: Date.now() + 432e5 })); return p + '.' + await hmac(p, secret); }
async function verifyToken(token, secret) { if (!token || token.indexOf('.') < 0) return false; const [p, sig] = token.split('.'); if (sig !== await hmac(p, secret)) return false; try { return JSON.parse(fromB64url(p)).exp > Date.now(); } catch (e) { return false; } }

/* ---------- GitHub ---------- */
async function gh(CFG, path, options = {}) {
  return fetch('https://api.github.com' + path, {
    ...options,
    headers: { 'Authorization': 'Bearer ' + CFG.token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'kanggreen-webnovel-admin', 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
  });
}
function b64decodeUtf8(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
function sanitizeSlug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/^-+|-+$/g, ''); }
async function ghGetJson(CFG, path) { const r = await gh(CFG, `/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${encodeURIComponent(CFG.branch)}`); if (r.status !== 200) return null; try { return JSON.parse(b64decodeUtf8((await r.json()).content)); } catch (e) { return null; } }

async function listNovels(CFG) {
  const R = `/repos/${CFG.owner}/${CFG.repo}`;
  let novels = [];
  const idx = await ghGetJson(CFG, DATA_INDEX);
  if (idx && idx.novels) novels = idx.novels;
  const dres = await gh(CFG, `${R}/contents/${CONTENT_BASE}?ref=${encodeURIComponent(CFG.branch)}`);
  if (dres.status === 200) {
    const arr = await dres.json(); const known = new Set(novels.map(n => n.slug));
    for (const d of arr) if (d.type === 'dir' && !known.has(d.name)) novels.push({ slug: d.name, title: d.name, genre: '', status: '', episodeCount: 0, episodes: [], cover: '' });
  }
  return json({ novels });
}

/* ---------- 콘텐츠 분석 (generate.mjs 와 동일 규칙) ---------- */
function stripFrontmatter(raw) { return String(raw).replace(/^﻿/, '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, ''); }
function frontmatterTitle(raw) { const m = String(raw).match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/); if (!m) return null; const t = m[1].match(/^\s*title\s*:\s*(.+)\s*$/m); return t ? t[1].trim().replace(/^["']|["']$/g, '') : null; }
function toPlainText(md) { return String(md).replace(/^#{1,6}\s+/gm, '').replace(/[*_~`>#]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\r/g, '').replace(/\n{2,}/g, ' ').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
function countWords(p) { return p ? p.replace(/\s/g, '').length : 0; }
function epNumber(filename) { const stem = filename.replace(/\.(md|txt)$/i, ''); const m = stem.match(/(\d+)/); return m ? parseInt(m[1], 10) : null; }
function analyzeEpisode(name, text, existingDate, nowIso) {
  const body = stripFrontmatter(text);
  let title = frontmatterTitle(text);
  if (!title) { const h = body.match(/^﻿?#\s+(.+)$/m); if (h) title = h[1].trim(); }
  const num = epNumber(name);
  if (!title) title = num != null ? `${num}화` : name.replace(/\.(md|txt)$/i, '');
  const plain = toPlainText(body);
  return { id: name.replace(/\.(md|txt)$/i, ''), file: name, num, title, date: existingDate || nowIso, modified: nowIso, words: countWords(plain), snippet: plain.slice(0, SNIPPET_LIMIT), plain };
}
function sortEpisodes(eps) {
  eps.sort((a, b) => { const an = a.num == null ? Number.MAX_SAFE_INTEGER : a.num; const bn = b.num == null ? Number.MAX_SAFE_INTEGER : b.num; return an !== bn ? an - bn : String(a.id).localeCompare(String(b.id)); });
  eps.forEach((e, i) => e.order = i + 1);
}
function recomputeIndexMeta(index, config) {
  index.site = { name: config.siteName || '웹소설 아카이브', tagline: config.tagline || '', baseUrl: config.baseUrl || '' };
  index.counts = { novels: index.novels.length, episodes: index.novels.reduce((s, n) => s + (n.episodes ? n.episodes.length : 0), 0) };
  const recent = [];
  for (const n of index.novels) for (const e of (n.episodes || [])) recent.push({ novelSlug: n.slug, novelTitle: n.title, id: e.id, num: e.num, order: e.order, title: e.title, date: e.date });
  recent.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  index.recentEpisodes = recent.slice(0, 30);
}
function xmlEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function htmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function buildSitemap(index, today) {
  const base = (index.site.baseUrl || '').replace(/\/$/, ''); const urls = [];
  const add = (loc, lastmod, pr) => urls.push(`  <url><loc>${xmlEscape(base + loc)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<priority>${pr}</priority></url>`);
  add('/', today, '1.0'); add('/app/novels.html', today, '0.9'); add('/app/search.html', today, '0.3');
  for (const n of index.novels) { add(`/novel/${encodeURIComponent(n.slug)}`, n.lastUpdated, '0.9'); for (const e of (n.episodes || [])) add(`/app/read.html?novel=${encodeURIComponent(n.slug)}&ep=${encodeURIComponent(e.id)}`, e.modified || e.date, '0.6'); }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
function stripPlain(index) {
  return { site: index.site, generatedAt: index.generatedAt, counts: index.counts, recentEpisodes: index.recentEpisodes, novels: index.novels.map(n => ({ ...n, episodes: (n.episodes || []).map(e => { const { plain, ...rest } = e; return rest; }) })) };
}

/* ---------- 작품별 정적 SEO 랜딩 페이지 ---------- */
export function novelLandingHtml(n, config) {
  const siteName = config.siteName || '강그린 웹소설';
  const brand = (config.seo && config.seo.brand) || '강그린 웹소설';
  const base = (config.baseUrl || '').replace(/\/$/, '');
  const url = base + '/novel/' + n.slug;
  const title = `${n.title} - ${brand}`;
  const descRaw = (n.description || `${n.title} · ${n.genre || ''} 웹소설. 총 ${n.episodeCount || 0}화 ${n.status || ''}.`).replace(/\s+/g, ' ').trim();
  const desc = descRaw.slice(0, 160);
  const coverAbs = n.cover ? (/^https?:/.test(n.cover) ? n.cover : base + n.cover) : (base + ((config.ogImage) || '/app/assets/og-default.svg'));
  const eps = n.episodes || [];
  const firstEp = n.firstEpisodeId || (eps[0] && eps[0].id);
  const epLinks = eps.map(e => `        <li><a href="/app/read.html?novel=${encodeURIComponent(n.slug)}&amp;ep=${encodeURIComponent(e.id)}">${htmlEsc(e.num != null ? e.num + '화' : (e.order || '') + '화')} ${htmlEsc(e.title || '')}</a></li>`).join('\n');
  const adClient = (config.adsense && config.adsense.enabled && config.adsense.client) ? config.adsense.client : '';
  const adHead = adClient ? `\n  <meta name="google-adsense-account" content="${htmlEsc(adClient)}">\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${htmlEsc(adClient)}" crossorigin="anonymous"></script>` : '';
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Book', name: n.title, genre: n.genre,
    author: { '@type': 'Person', name: (config.author && config.author.name) || brand },
    numberOfPages: n.episodeCount, bookFormat: 'https://schema.org/EBook', inLanguage: 'ko',
    description: descRaw, url, ...(n.cover ? { image: coverAbs } : {})
  });
  const cover = n.cover ? `<img src="${htmlEsc(n.cover)}" alt="${htmlEsc(n.title)} 표지">` : `<div class="cover-title">${htmlEsc(n.title)}</div>`;
  return `<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${htmlEsc(title)}</title>
  <meta name="description" content="${htmlEsc(desc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${htmlEsc(url)}">
  <meta property="og:type" content="book">
  <meta property="og:title" content="${htmlEsc(title)}">
  <meta property="og:description" content="${htmlEsc(desc)}">
  <meta property="og:url" content="${htmlEsc(url)}">
  <meta property="og:image" content="${htmlEsc(coverAbs)}">
  <meta property="og:site_name" content="${htmlEsc(siteName)}">
  <meta name="theme-color" content="#5b4bff">
  <link rel="icon" href="/app/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="/app/assets/css/style.css">${adHead}
  <script type="application/ld+json">${jsonld}</script>
</head>
<body>
  <header class="site-header" data-site-header></header>
  <main>
    <div class="container" style="max-width:840px">
      <nav style="margin:18px 0 4px;font-size:13.5px;color:var(--text-faint);font-weight:600">
        <a href="/app/novels.html" style="color:var(--text-faint)">작품 목록</a> › <span>${htmlEsc(n.title)}</span>
      </nav>
      <article class="novel-hero" style="margin-top:14px">
        <div class="cover-lg">${cover}</div>
        <div class="info">
          <span class="badge status-${htmlEsc(n.status)}">${htmlEsc(n.status)}</span>
          <h1>${htmlEsc(n.title)}</h1>
          <div class="meta-row"><span>📚 ${htmlEsc(n.genre)}</span><span>📄 총 ${n.episodeCount}화</span></div>
          <div class="desc">${htmlEsc(n.description || '')}</div>
          <div class="actions">
            ${firstEp ? `<a class="btn btn-primary" href="/app/read.html?novel=${encodeURIComponent(n.slug)}&amp;ep=${encodeURIComponent(firstEp)}">무료 1화 보기</a>` : ''}
          </div>
        </div>
      </article>
      <div class="ad-slot"></div>
      <h2 style="margin-top:34px;font-size:18px">회차 목록 <span style="color:var(--text-faint);font-weight:600;font-size:14px">(${eps.length})</span></h2>
      <ul class="seo-eplist">
${epLinks}
      </ul>
    </div>
  </main>
  <footer class="site-footer" data-site-footer></footer>
  <script src="/app/assets/js/common.js"></script>
  <script>KG.boot('novels');</script>
</body>
</html>
`;
}
/* 현재 모든 작품의 랜딩페이지 커밋 엔트리 (+ 삭제된 slug 제거) */
function landingEntries(index, config, removedSlugs) {
  const entries = [];
  for (const n of index.novels) entries.push({ path: `novel/${n.slug}.html`, mode: '100644', _blob: { content: novelLandingHtml(n, config), encoding: 'utf-8' } });
  for (const s of (removedSlugs || [])) entries.push({ path: `novel/${s}.html`, mode: '100644', sha: null });
  return entries;
}

/* ---------- 업로드 ---------- */
async function upload(request, CFG) {
  const body = await request.json();
  const slug = sanitizeSlug(body.slug);
  if (!slug) return json({ error: '작품을 선택하거나 새 작품 폴더명을 입력하세요.' }, 400);
  const base = `${CONTENT_BASE}/${slug}`;
  const nowIso = new Date().toISOString();
  const blobs = [];

  const index = (await ghGetJson(CFG, DATA_INDEX)) || { novels: [] }; if (!index.novels) index.novels = [];
  const search = (await ghGetJson(CFG, DATA_SEARCH)) || { docs: [] }; if (!search.docs) search.docs = [];
  const config = (await ghGetJson(CFG, CONFIG_PATH)) || {};

  let coverPath = null;
  if (body.cover && body.cover.base64) {
    const ext = ((body.cover.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    coverPath = `${base}/cover.${ext}`;
    blobs.push({ path: coverPath, content: body.cover.base64, encoding: 'base64' });
  }

  let novel = index.novels.find(n => n.slug === slug);
  if (!novel) { novel = { slug, title: slug, genre: '미분류', status: '연재중', description: '', cover: '', featured: false, popularity: 0, order: 999, episodes: [] }; index.novels.push(novel); }
  if (!novel.episodes) novel.episodes = [];

  let meta = null;
  if (body.isNew) {
    const m = body.meta || {};
    novel.title = m.title || slug; novel.genre = m.genre || '미분류'; novel.status = m.status || '연재중';
    novel.description = m.description || ''; novel.featured = !!m.featured; novel.order = parseInt(m.order, 10) || 10;
    if (coverPath) novel.cover = '/' + coverPath;
    meta = { title: novel.title, genre: novel.genre, status: novel.status, description: novel.description, cover: novel.cover || '', featured: novel.featured, popularity: novel.popularity || 0, order: novel.order };
  } else if (coverPath) {
    novel.cover = '/' + coverPath;
    let existMeta = await ghGetJson(CFG, `${base}/meta.json`) || {};
    existMeta.cover = '/' + coverPath; meta = existMeta;
  }
  if (meta) blobs.push({ path: `${base}/meta.json`, content: JSON.stringify(meta, null, 2) + '\n', encoding: 'utf-8' });

  const uploaded = [];
  for (const f of (body.files || [])) {
    const name = String(f.name || '').replace(/[\/\\]/g, '_');
    if (!/\.(md|txt)$/i.test(name)) continue;
    const existing = novel.episodes.find(e => e.file === name);
    const ep = analyzeEpisode(name, String(f.text || ''), existing ? existing.date : null, nowIso);
    const i = novel.episodes.findIndex(e => e.id === ep.id);
    if (i >= 0) novel.episodes[i] = ep; else novel.episodes.push(ep);
    uploaded.push(ep);
    blobs.push({ path: `${base}/${name}`, content: String(f.text || ''), encoding: 'utf-8' });
  }
  if (!blobs.length) return json({ error: '업로드할 파일이 없습니다.' }, 400);

  sortEpisodes(novel.episodes);
  novel.episodeCount = novel.episodes.length;
  const dates = novel.episodes.map(e => e.date).filter(Boolean).sort();
  novel.lastUpdated = dates.length ? dates[dates.length - 1] : nowIso;
  novel.firstEpisodeId = novel.episodes[0] ? novel.episodes[0].id : null;

  const uploadedIds = new Set(uploaded.map(e => e.id));
  search.docs = search.docs.filter(d => !(d.slug === slug && (d.type === 'novel' || (d.type === 'episode' && uploadedIds.has(d.id)))));
  search.docs.push({ type: 'novel', slug, title: novel.title, genre: novel.genre, description: novel.description });
  for (const e of uploaded) search.docs.push({ type: 'episode', slug, novelTitle: novel.title, id: e.id, num: e.num, order: e.order, title: e.title, body: (e.plain || '').slice(0, SEARCH_BODY_LIMIT) });

  index.generatedAt = nowIso;
  recomputeIndexMeta(index, config);
  blobs.push({ path: DATA_INDEX, content: JSON.stringify(stripPlain(index)), encoding: 'utf-8' });
  blobs.push({ path: DATA_SEARCH, content: JSON.stringify({ docs: search.docs }), encoding: 'utf-8' });
  blobs.push({ path: SITEMAP, content: buildSitemap(index, nowIso.slice(0, 10)), encoding: 'utf-8' });

  const entries = blobs.map(b => ({ path: b.path, mode: '100644', _blob: b })).concat(landingEntries(index, config));
  const commit = await commitTree(CFG, entries, `admin: ${slug} 업로드 (원고 ${uploaded.length}개)`);
  return json({ ok: true, committed: uploaded.length, commit });
}

/* ---------- 삭제 ---------- */
async function del(request, CFG) {
  const { slug: rawSlug, file } = await request.json();
  const slug = sanitizeSlug(rawSlug);
  if (!slug) return json({ error: '작품이 지정되지 않았습니다.' }, 400);
  const base = `${CONTENT_BASE}/${slug}`; const R = `/repos/${CFG.owner}/${CFG.repo}`; const nowIso = new Date().toISOString();

  const index = (await ghGetJson(CFG, DATA_INDEX)) || { novels: [] }; if (!index.novels) index.novels = [];
  const search = (await ghGetJson(CFG, DATA_SEARCH)) || { docs: [] }; if (!search.docs) search.docs = [];
  const config = (await ghGetJson(CFG, CONFIG_PATH)) || {};

  const entries = [];
  const removedSlugs = [];
  if (file) {
    const name = String(file).replace(/[\/\\]/g, '_');
    entries.push({ path: `${base}/${name}`, mode: '100644', sha: null });
    const novel = index.novels.find(n => n.slug === slug);
    if (novel && novel.episodes) {
      const id = name.replace(/\.(md|txt)$/i, '');
      novel.episodes = novel.episodes.filter(e => e.id !== id && e.file !== name);
      sortEpisodes(novel.episodes); novel.episodeCount = novel.episodes.length;
      const dates = novel.episodes.map(e => e.date).filter(Boolean).sort();
      novel.lastUpdated = dates.length ? dates[dates.length - 1] : nowIso;
      novel.firstEpisodeId = novel.episodes[0] ? novel.episodes[0].id : null;
      search.docs = search.docs.filter(d => !(d.type === 'episode' && d.slug === slug && d.id === id));
    }
  } else {
    const lr = await gh(CFG, `${R}/contents/${base}?ref=${encodeURIComponent(CFG.branch)}`);
    if (lr.status === 200) for (const it of await lr.json()) if (it.type === 'file') entries.push({ path: `${base}/${it.name}`, mode: '100644', sha: null });
    if (!entries.length) return json({ error: '삭제할 파일이 없습니다.' }, 400);
    index.novels = index.novels.filter(n => n.slug !== slug);
    search.docs = search.docs.filter(d => d.slug !== slug);
    removedSlugs.push(slug);
  }

  index.generatedAt = nowIso;
  recomputeIndexMeta(index, config);
  entries.push({ path: DATA_INDEX, mode: '100644', _blob: { content: JSON.stringify(stripPlain(index)), encoding: 'utf-8' } });
  entries.push({ path: DATA_SEARCH, mode: '100644', _blob: { content: JSON.stringify({ docs: search.docs }), encoding: 'utf-8' } });
  entries.push({ path: SITEMAP, mode: '100644', _blob: { content: buildSitemap(index, nowIso.slice(0, 10)), encoding: 'utf-8' } });
  for (const e of landingEntries(index, config, removedSlugs)) entries.push(e);

  const commit = await commitTree(CFG, entries, file ? `admin: ${file} 삭제` : `admin: ${slug} 작품 삭제`);
  return json({ ok: true, commit });
}

/* ---------- 작품 정보 수정 (제목·장르·상태·소개·대표·인기·정렬) ---------- */
async function updateNovel(request, CFG) {
  const body = await request.json();
  const slug = sanitizeSlug(body.slug);
  if (!slug) return json({ error: '작품이 지정되지 않았습니다.' }, 400);
  const m = body.meta || {};
  const base = `${CONTENT_BASE}/${slug}`;
  const nowIso = new Date().toISOString();

  const index = (await ghGetJson(CFG, DATA_INDEX)) || { novels: [] }; if (!index.novels) index.novels = [];
  const search = (await ghGetJson(CFG, DATA_SEARCH)) || { docs: [] }; if (!search.docs) search.docs = [];
  const config = (await ghGetJson(CFG, CONFIG_PATH)) || {};
  const existMeta = (await ghGetJson(CFG, `${base}/meta.json`)) || {};

  let novel = index.novels.find(n => n.slug === slug);
  if (!novel) { novel = { slug, episodes: [], episodeCount: 0, cover: existMeta.cover || '', lastUpdated: nowIso, firstEpisodeId: null }; index.novels.push(novel); }

  if (m.title !== undefined) novel.title = m.title || slug;
  if (m.genre !== undefined) novel.genre = m.genre || '미분류';
  if (m.status !== undefined) novel.status = m.status || '연재중';
  if (m.description !== undefined) novel.description = m.description || '';
  if (m.featured !== undefined) novel.featured = !!m.featured;
  if (m.popularity !== undefined) novel.popularity = parseInt(m.popularity, 10) || 0;
  if (m.order !== undefined) novel.order = parseInt(m.order, 10) || 999;
  if (!novel.cover) novel.cover = existMeta.cover || '';

  const meta = {
    title: novel.title || slug, genre: novel.genre || '미분류', status: novel.status || '연재중',
    description: novel.description || '', cover: novel.cover || '', featured: !!novel.featured,
    popularity: novel.popularity || 0, order: novel.order != null ? novel.order : 999
  };

  search.docs = search.docs.filter(d => !(d.type === 'novel' && d.slug === slug));
  search.docs.push({ type: 'novel', slug, title: novel.title, genre: novel.genre, description: novel.description });
  for (const d of search.docs) if (d.type === 'episode' && d.slug === slug) d.novelTitle = novel.title;

  index.generatedAt = nowIso;
  recomputeIndexMeta(index, config);

  const entries = [
    { path: `${base}/meta.json`, mode: '100644', _blob: { content: JSON.stringify(meta, null, 2) + '\n', encoding: 'utf-8' } },
    { path: DATA_INDEX, mode: '100644', _blob: { content: JSON.stringify(stripPlain(index)), encoding: 'utf-8' } },
    { path: DATA_SEARCH, mode: '100644', _blob: { content: JSON.stringify({ docs: search.docs }), encoding: 'utf-8' } },
    { path: SITEMAP, mode: '100644', _blob: { content: buildSitemap(index, nowIso.slice(0, 10)), encoding: 'utf-8' } }
  ].concat(landingEntries(index, config));
  const commit = await commitTree(CFG, entries, `admin: ${slug} 정보 수정`);
  return json({ ok: true, commit });
}

/* ---------- SEO 랜딩페이지 전체 재생성 (관리자) ---------- */
export async function onRebuildSeo(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const g = await guard(request, env); if (g.res) return g.res;
  const CFG = g.CFG;
  const nowIso = new Date().toISOString();
  const index = (await ghGetJson(CFG, DATA_INDEX)) || { novels: [] }; if (!index.novels) index.novels = [];
  const config = (await ghGetJson(CFG, CONFIG_PATH)) || {};
  index.generatedAt = nowIso;
  recomputeIndexMeta(index, config);
  const entries = [
    { path: SITEMAP, mode: '100644', _blob: { content: buildSitemap(index, nowIso.slice(0, 10)), encoding: 'utf-8' } }
  ].concat(landingEntries(index, config));
  const commit = await commitTree(CFG, entries, `admin: SEO 랜딩페이지 재생성 (${index.novels.length}개)`);
  return json({ ok: true, count: index.novels.length, commit });
}

/* ---------- Git Data API: 한 커밋으로 ---------- */
async function commitTree(CFG, entries, message) {
  const R = `/repos/${CFG.owner}/${CFG.repo}`;
  const refRes = await gh(CFG, `${R}/git/ref/heads/${encodeURIComponent(CFG.branch)}`);
  if (!refRes.ok) throw new Error('브랜치 조회 실패: ' + (await refRes.text()).slice(0, 150));
  const latest = (await refRes.json()).object.sha;
  const baseTree = (await (await gh(CFG, `${R}/git/commits/${latest}`)).json()).tree.sha;
  const tree = [];
  for (const e of entries) {
    if (e._blob) {
      if (e._blob.encoding === 'base64') {
        const br = await gh(CFG, `${R}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: e._blob.content, encoding: 'base64' }) });
        if (!br.ok) throw new Error('이미지 blob 실패: ' + (await br.text()).slice(0, 150));
        tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: (await br.json()).sha });
      } else tree.push({ path: e.path, mode: e.mode, type: 'blob', content: e._blob.content });
    } else tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha });
  }
  const tr = await gh(CFG, `${R}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
  if (!tr.ok) throw new Error('트리 생성 실패: ' + (await tr.text()).slice(0, 150));
  const newTree = (await tr.json()).sha;
  const cr = await gh(CFG, `${R}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree, parents: [latest] }) });
  if (!cr.ok) throw new Error('커밋 생성 실패: ' + (await cr.text()).slice(0, 150));
  const newCommit = (await cr.json()).sha;
  const ur = await gh(CFG, `${R}/git/refs/heads/${encodeURIComponent(CFG.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit }) });
  if (!ur.ok) throw new Error('브랜치 갱신 실패: ' + (await ur.text()).slice(0, 150));
  return newCommit;
}
