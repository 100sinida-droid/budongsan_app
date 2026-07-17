/* =========================================================
   강그린 웹소설 아카이브 - 관리자 백엔드 (Cloudflare Pages Functions)
   ---------------------------------------------------------
   /api/login   POST  {username,password}            → {token}
   /api/list    GET   (auth)                          → {novels:[...]}
   /api/upload  POST  (auth) {slug,isNew,meta,files,cover} → {ok, committed}
   /api/delete  POST  (auth) {slug, file?}            → {ok, deleted}

   GitHub 토큰은 서버 환경변수에만 있고 브라우저로 전송되지 않습니다.
   업로드는 Git Data API로 "한 번의 커밋"으로 처리합니다.

   필요한 Cloudflare Pages 환경변수:
     GITHUB_TOKEN   (필수, 비밀) - Contents Read/Write 권한 토큰
     GITHUB_OWNER   (필수) - GitHub 사용자명
     GITHUB_REPO    (필수) - 저장소 이름
     GITHUB_BRANCH  (선택, 기본 main)
     ADMIN_USERNAME (선택, 기본 sinida)
     ADMIN_PASSWORD (선택, 기본 shin6464^^)
     SESSION_SECRET (선택, 없으면 비밀번호 기반으로 자동 생성)
   ========================================================= */

export async function onRequest(context) {
  const { request, env, params } = context;
  const sub = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

  const CFG = {
    user: env.ADMIN_USERNAME || 'sinida',
    pass: env.ADMIN_PASSWORD || 'shin6464^^',
    owner: env.GITHUB_OWNER || '',
    repo: env.GITHUB_REPO || '',
    branch: env.GITHUB_BRANCH || 'main',
    token: env.GITHUB_TOKEN || ''
  };
  const secret = env.SESSION_SECRET || (CFG.pass + '::kg-session-v1');

  try {
    // ---- 로그인 ----
    if (sub === 'login') {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      const { username, password } = await request.json();
      if (username === CFG.user && password === CFG.pass) {
        return json({ ok: true, token: await makeToken(CFG.user, secret) });
      }
      return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    // ---- 이하 인증 필요 ----
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!(await verifyToken(token, secret))) return json({ error: '로그인이 필요합니다.' }, 401);

    if (!CFG.token || !CFG.owner || !CFG.repo) {
      return json({ error: '서버 설정 누락: Cloudflare Pages 환경변수 GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO 를 설정하세요.' }, 500);
    }

    if (sub === 'list' && request.method === 'GET') return await listNovels(CFG, json);
    if (sub === 'upload' && request.method === 'POST') return await upload(request, CFG, json);
    if (sub === 'delete' && request.method === 'POST') return await del(request, CFG, json);
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: (e && e.message) || String(e) }, 500);
  }
}

/* ---------------- 토큰(세션) ---------------- */
const enc = s => new TextEncoder().encode(s);
function b64url(bytes) { let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(str) { return b64url(enc(str)); }
function fromB64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(data));
  return b64url(new Uint8Array(sig));
}
async function makeToken(user, secret) {
  const payload = b64urlStr(JSON.stringify({ u: user, exp: Date.now() + 1000 * 60 * 60 * 12 }));
  return payload + '.' + await hmac(payload, secret);
}
async function verifyToken(token, secret) {
  if (!token || token.indexOf('.') < 0) return false;
  const [payload, sig] = token.split('.');
  if (sig !== await hmac(payload, secret)) return false;
  try { return JSON.parse(fromB64url(payload)).exp > Date.now(); } catch (e) { return false; }
}

/* ---------------- GitHub API ---------------- */
async function gh(CFG, path, options = {}) {
  return fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + CFG.token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'kanggreen-webnovel-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
}
function b64decodeUtf8(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
function sanitizeSlug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/^-+|-+$/g, ''); }

async function listNovels(CFG, json) {
  const R = `/repos/${CFG.owner}/${CFG.repo}`;
  let novels = [];
  const res = await gh(CFG, `${R}/contents/app/data/index.json?ref=${encodeURIComponent(CFG.branch)}`);
  if (res.status === 200) {
    try { const idx = JSON.parse(b64decodeUtf8((await res.json()).content)); novels = idx.novels || []; } catch (e) {}
  }
  // 아직 인덱싱 안 된 폴더도 포함
  const dres = await gh(CFG, `${R}/contents/app/content/novels?ref=${encodeURIComponent(CFG.branch)}`);
  if (dres.status === 200) {
    const arr = await dres.json();
    const known = new Set(novels.map(n => n.slug));
    for (const d of arr) if (d.type === 'dir' && !known.has(d.name)) novels.push({ slug: d.name, title: d.name, genre: '', status: '', episodeCount: 0, episodes: [], cover: '' });
  }
  return json({ novels });
}

async function upload(request, CFG, json) {
  const body = await request.json();
  const slug = sanitizeSlug(body.slug);
  if (!slug) return json({ error: '작품을 선택하거나 새 작품 폴더명을 입력하세요.' }, 400);
  const base = `app/content/novels/${slug}`;
  const blobs = [];

  // 표지 이미지
  let coverPath = null;
  if (body.cover && body.cover.base64) {
    const ext = ((body.cover.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    coverPath = `${base}/cover.${ext}`;
    blobs.push({ path: coverPath, content: body.cover.base64, encoding: 'base64' });
  }

  // meta.json (신규 작품이거나 표지 변경 시)
  if (body.isNew) {
    const m = body.meta || {};
    const meta = {
      title: m.title || slug,
      genre: m.genre || '미분류',
      status: m.status || '연재중',
      description: m.description || '',
      cover: coverPath ? '/' + coverPath : '',
      featured: !!m.featured,
      popularity: 0,
      order: parseInt(m.order, 10) || 10
    };
    blobs.push({ path: `${base}/meta.json`, content: JSON.stringify(meta, null, 2) + '\n', encoding: 'utf-8' });
  } else if (coverPath) {
    let meta = {};
    const mres = await gh(CFG, `/repos/${CFG.owner}/${CFG.repo}/contents/${base}/meta.json?ref=${encodeURIComponent(CFG.branch)}`);
    if (mres.status === 200) { try { meta = JSON.parse(b64decodeUtf8((await mres.json()).content)); } catch (e) {} }
    meta.cover = '/' + coverPath;
    blobs.push({ path: `${base}/meta.json`, content: JSON.stringify(meta, null, 2) + '\n', encoding: 'utf-8' });
  }

  // 원고 파일
  for (const f of (body.files || [])) {
    const name = String(f.name || '').replace(/[\/\\]/g, '_');
    if (!/\.(md|txt)$/i.test(name)) continue;
    blobs.push({ path: `${base}/${name}`, content: String(f.text || ''), encoding: 'utf-8' });
  }

  if (!blobs.length) return json({ error: '업로드할 파일이 없습니다.' }, 400);

  const commit = await commitTree(CFG, blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', _blob: b })), `admin: ${slug} 업로드 (${blobs.length}개)`);
  return json({ ok: true, committed: blobs.map(b => b.path), commit });
}

async function del(request, CFG, json) {
  const { slug, file } = await request.json();
  const s = sanitizeSlug(slug);
  if (!s) return json({ error: '작품이 지정되지 않았습니다.' }, 400);
  const base = `app/content/novels/${s}`;
  const R = `/repos/${CFG.owner}/${CFG.repo}`;
  let paths = [];
  if (file) paths = [`${base}/${String(file).replace(/[\/\\]/g, '_')}`];
  else {
    const lr = await gh(CFG, `${R}/contents/${base}?ref=${encodeURIComponent(CFG.branch)}`);
    if (lr.status === 200) paths = (await lr.json()).filter(x => x.type === 'file').map(x => `${base}/${x.name}`);
  }
  if (!paths.length) return json({ error: '삭제할 파일이 없습니다.' }, 400);
  const commit = await commitTree(CFG, paths.map(p => ({ path: p, mode: '100644', type: 'blob', sha: null })), file ? `admin: ${file} 삭제` : `admin: ${s} 작품 삭제`);
  return json({ ok: true, deleted: paths, commit });
}

/* Git Data API: 여러 파일을 한 커밋으로 (추가/삭제 공용) */
async function commitTree(CFG, entries, message) {
  const R = `/repos/${CFG.owner}/${CFG.repo}`;
  const refRes = await gh(CFG, `${R}/git/ref/heads/${encodeURIComponent(CFG.branch)}`);
  if (!refRes.ok) throw new Error('브랜치 조회 실패: ' + (await refRes.text()).slice(0, 150));
  const latest = (await refRes.json()).object.sha;
  const baseTree = (await (await gh(CFG, `${R}/git/commits/${latest}`)).json()).tree.sha;

  // 추가 파일은 blob 생성
  const tree = [];
  for (const e of entries) {
    if (e._blob) {
      const br = await gh(CFG, `${R}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: e._blob.content, encoding: e._blob.encoding }) });
      if (!br.ok) throw new Error('blob 생성 실패: ' + (await br.text()).slice(0, 150));
      tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: (await br.json()).sha });
    } else {
      tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha }); // sha:null → 삭제
    }
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
