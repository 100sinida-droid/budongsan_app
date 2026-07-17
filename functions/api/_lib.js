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
function buildSitemap(index, today) {
  const base = (index.site.baseUrl || '').replace(/\/$/, ''); const urls = [];
  const add = (loc, lastmod, pr) => urls.push(`  <url><loc>${xmlEscape(base + loc)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<priority>${pr}</priority></url>`);
  add('/', today, '1.0'); add('/app/novels.html', today, '0.9'); add('/app/search.html', today, '0.3');
  for (const n of index.novels) { add(`/app/novel.html?slug=${encodeURIComponent(n.slug)}`, n.lastUpdated, '0.8'); for (const e of (n.episodes || [])) add(`/app/read.html?novel=${encodeURIComponent(n.slug)}&ep=${encodeURIComponent(e.id)}`, e.modified || e.date, '0.6'); }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
function stripPlain(index) {
  return { site: index.site, generatedAt: index.generatedAt, counts: index.counts, recentEpisodes: index.recentEpisodes, novels: index.novels.map(n => ({ ...n, episodes: (n.episodes || []).map(e => { const { plain, ...rest } = e; return rest; }) })) };
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

  const commit = await commitTree(CFG, blobs.map(b => ({ path: b.path, mode: '100644', _blob: b })), `admin: ${slug} 업로드 (원고 ${uploaded.length}개)`);
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
  }

  index.generatedAt = nowIso;
  recomputeIndexMeta(index, config);
  entries.push({ path: DATA_INDEX, mode: '100644', _blob: { content: JSON.stringify(stripPlain(index)), encoding: 'utf-8' } });
  entries.push({ path: DATA_SEARCH, mode: '100644', _blob: { content: JSON.stringify({ docs: search.docs }), encoding: 'utf-8' } });
  entries.push({ path: SITEMAP, mode: '100644', _blob: { content: buildSitemap(index, nowIso.slice(0, 10)), encoding: 'utf-8' } });

  const commit = await commitTree(CFG, entries, file ? `admin: ${file} 삭제` : `admin: ${slug} 작품 삭제`);
  return json({ ok: true, commit });
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
