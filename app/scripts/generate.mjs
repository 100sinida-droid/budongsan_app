#!/usr/bin/env node
/**
 * 강그린 웹소설 아카이브 - 콘텐츠 인덱스 생성기
 * --------------------------------------------------
 * content/novels/{slug}/meta.json + {NNN}.md 파일들을 스캔하여
 *   - data/index.json   : 작품/회차 목록 (독자 페이지가 읽는 데이터)
 *   - data/search.json  : 검색용 색인 (작품명/회차제목/본문 일부)
 *   - sitemap.xml       : SEO용 사이트맵
 * 를 자동으로 생성합니다.
 *
 * 이 스크립트는 GitHub Action이 push 때마다 자동 실행하므로
 * 관리자는 md 파일만 올리면 됩니다. (로컬에서 `npm run build`로도 실행 가능)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'novels');
const DATA_DIR = path.join(ROOT, 'data');

const SEARCH_BODY_LIMIT = 1500; // 검색 색인에 담을 본문 최대 글자수(용량 관리)
const SNIPPET_LIMIT = 90;       // 미리보기 스니펫 길이

// ---------- 유틸 ----------
const config = readJSON(path.join(ROOT, 'site.config.json')) || {};

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** 간단한 YAML 프론트매터 파서 (key: value 형태만) */
function parseFrontmatter(raw) {
  const m = raw.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!m) return { data: {}, body: raw.replace(/^﻿/, '') };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^\s*([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
    if (mm) {
      let v = mm[2].trim();
      v = v.replace(/^["']|["']$/g, '');
      data[mm[1]] = v;
    }
  }
  return { data, body: raw.slice(m[0].length) };
}

/** 마크다운/텍스트에서 순수 텍스트 추출 (검색·스니펫용) */
function toPlainText(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '')       // 헤딩 기호
    .replace(/[*_~`>#]/g, '')           // 강조/인용 기호
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 -> 텍스트
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function countWords(plain) {
  if (!plain) return 0;
  // 한글은 공백이 적으므로 글자수 기준(공백 제외)으로 카운트
  return plain.replace(/\s/g, '').length;
}

/** git 로그에서 파일의 최초/최종 커밋 날짜 얻기 (실패하면 파일시스템 mtime) */
function fileDates(absPath) {
  let added = null, modified = null;
  try {
    const rel = path.relative(ROOT, absPath);
    added = execSync(`git log --diff-filter=A --follow --format=%aI -1 -- "${rel}"`,
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
    modified = execSync(`git log --format=%aI -1 -- "${rel}"`,
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch { /* git 없음 */ }
  if (!added || !modified) {
    try {
      const st = fs.statSync(absPath);
      const iso = st.mtime.toISOString();
      added = added || iso;
      modified = modified || iso;
    } catch { /* ignore */ }
  }
  return { added: added || null, modified: modified || null };
}

/** 파일명에서 회차 번호 추출: 001.md, 001화.md, 12화.md -> 숫자 */
function parseEpisodeNumber(filename) {
  const stem = filename.replace(/\.(md|txt)$/i, '');
  const m = stem.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function slugFromFilename(filename) {
  return filename.replace(/\.(md|txt)$/i, '');
}

// ---------- 스캔 ----------
function scanNovels() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const dirs = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => !name.startsWith('.') && !name.startsWith('_'));

  const novels = [];

  for (const slug of dirs) {
    const novelDir = path.join(CONTENT_DIR, slug);
    const metaPath = path.join(novelDir, 'meta.json');

    // meta.json 없으면 기본값 생성 후 저장 (관리자가 나중에 수정 가능)
    let meta = readJSON(metaPath);
    if (!meta) {
      meta = {
        title: slug,
        genre: '미분류',
        status: '연재중',
        description: '',
        cover: '',
        featured: false,
        popularity: 0,
        order: 999
      };
      try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8'); }
      catch { /* 읽기전용 환경 무시 */ }
    }

    // 회차 파일 수집
    const files = fs.readdirSync(novelDir, { withFileTypes: true })
      .filter(f => f.isFile() && /\.(md|txt)$/i.test(f.name))
      .map(f => f.name);

    const episodes = [];
    for (const file of files) {
      const abs = path.join(novelDir, file);
      const raw = fs.readFileSync(abs, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      const plain = toPlainText(body);

      // 제목: 프론트매터 title > 첫 번째 # 헤딩 > "N화"
      let title = data.title || null;
      if (!title) {
        const h = body.match(/^﻿?#\s+(.+)$/m);
        if (h) title = h[1].trim();
      }
      const num = parseEpisodeNumber(file);
      if (!title) title = num != null ? `${num}화` : slugFromFilename(file);

      const dates = fileDates(abs);
      const date = data.date || dates.added;

      episodes.push({
        id: slugFromFilename(file),
        file,
        num: num != null ? num : null,
        title,
        date,
        modified: dates.modified,
        words: countWords(plain),
        snippet: plain.slice(0, SNIPPET_LIMIT),
        _plain: plain // search.json 용도 (index.json에는 제외)
      });
    }

    // 정렬: 회차번호 있으면 번호순, 없으면 파일명순 뒤로
    episodes.sort((a, b) => {
      const an = a.num == null ? Number.MAX_SAFE_INTEGER : a.num;
      const bn = b.num == null ? Number.MAX_SAFE_INTEGER : b.num;
      if (an !== bn) return an - bn;
      return a.id.localeCompare(b.id);
    });

    // 표시용 순번(1,2,3...) 보정 - num 없는 경우 대비
    episodes.forEach((ep, i) => { ep.order = i + 1; });

    const datesAll = episodes.map(e => e.date).filter(Boolean).sort();
    const lastUpdated = datesAll.length ? datesAll[datesAll.length - 1] : (meta.date || null);

    novels.push({
      slug,
      title: meta.title || slug,
      genre: meta.genre || '미분류',
      status: meta.status || '연재중',
      description: meta.description || '',
      cover: meta.cover || '',
      featured: !!meta.featured,
      popularity: Number(meta.popularity || 0),
      order: Number(meta.order != null ? meta.order : 999),
      episodeCount: episodes.length,
      lastUpdated,
      firstEpisodeId: episodes[0] ? episodes[0].id : null,
      episodes
    });
  }

  return novels;
}

// ---------- 빌드 ----------
function build() {
  const novels = scanNovels();
  ensureDir(DATA_DIR);

  // index.json (본문 제외한 경량 데이터)
  const indexNovels = novels.map(n => ({
    slug: n.slug,
    title: n.title,
    genre: n.genre,
    status: n.status,
    description: n.description,
    cover: n.cover,
    featured: n.featured,
    popularity: n.popularity,
    order: n.order,
    episodeCount: n.episodeCount,
    lastUpdated: n.lastUpdated,
    firstEpisodeId: n.firstEpisodeId,
    episodes: n.episodes.map(e => ({
      id: e.id, file: e.file, num: e.num, order: e.order,
      title: e.title, date: e.date, modified: e.modified,
      words: e.words, snippet: e.snippet
    }))
  }));

  // 최근 추가된 회차 (전체 작품 통합, 날짜 내림차순)
  const recentEpisodes = [];
  for (const n of novels) {
    for (const e of n.episodes) {
      recentEpisodes.push({
        novelSlug: n.slug, novelTitle: n.title,
        id: e.id, num: e.num, order: e.order, title: e.title, date: e.date
      });
    }
  }
  recentEpisodes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const index = {
    site: {
      name: config.siteName || '웹소설 아카이브',
      tagline: config.tagline || '',
      baseUrl: config.baseUrl || ''
    },
    generatedAt: new Date().toISOString(),
    counts: {
      novels: novels.length,
      episodes: novels.reduce((s, n) => s + n.episodeCount, 0)
    },
    novels: indexNovels,
    recentEpisodes: recentEpisodes.slice(0, 30)
  };
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index), 'utf8');

  // search.json (본문 일부 포함)
  const docs = [];
  for (const n of novels) {
    docs.push({
      type: 'novel',
      slug: n.slug,
      title: n.title,
      genre: n.genre,
      description: n.description
    });
    for (const e of n.episodes) {
      docs.push({
        type: 'episode',
        slug: n.slug,
        novelTitle: n.title,
        id: e.id,
        num: e.num,
        order: e.order,
        title: e.title,
        body: (e._plain || '').slice(0, SEARCH_BODY_LIMIT)
      });
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'search.json'), JSON.stringify({ docs }), 'utf8');

  // sitemap.xml
  writeSitemap(novels);

  // 작품별 SEO 랜딩 페이지
  writeLandingPages(novels);

  console.log(`✅ 생성 완료: 작품 ${index.counts.novels}개 / 회차 ${index.counts.episodes}개`);
  console.log(`   - data/index.json, data/search.json, sitemap.xml, /novel/*.html`);
}

function writeSitemap(novels) {
  const base = (config.baseUrl || '').replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const add = (loc, lastmod, priority) =>
    urls.push(`  <url><loc>${xmlEscape(base + loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0,10)}</lastmod>` : ''}<priority>${priority}</priority></url>`);

  add('/', today, '1.0');
  add('/app/novels.html', today, '0.9');
  add('/app/search.html', today, '0.3');
  for (const n of novels) {
    add(`/novel/${encodeURIComponent(n.slug)}`, n.lastUpdated, '0.9');
    for (const e of n.episodes) {
      add(`/app/read.html?novel=${encodeURIComponent(n.slug)}&ep=${encodeURIComponent(e.id)}`, e.modified || e.date, '0.6');
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

// 작품별 정적 SEO 랜딩 페이지 → 저장소 루트의 /novel/{slug}.html
function htmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function writeLandingPages(novels) {
  const REPO_ROOT = path.resolve(ROOT, '..');
  const outDir = path.join(REPO_ROOT, 'novel');
  ensureDir(outDir);
  const brand = (config.seo && config.seo.brand) || '강그린 웹소설';
  const base = (config.baseUrl || '').replace(/\/$/, '');
  const adClient = (config.adsense && config.adsense.enabled && config.adsense.client) ? config.adsense.client : '';
  for (const n of novels) {
    const url = base + '/novel/' + n.slug;
    const title = `${n.title} - ${brand}`;
    const descRaw = (n.description || `${n.title} · ${n.genre || ''} 웹소설. 총 ${n.episodeCount || 0}화 ${n.status || ''}.`).replace(/\s+/g, ' ').trim();
    const desc = descRaw.slice(0, 160);
    const coverAbs = n.cover ? (/^https?:/.test(n.cover) ? n.cover : base + n.cover) : (base + ((config.ogImage) || '/app/assets/og-default.svg'));
    const eps = n.episodes || [];
    const firstEp = n.firstEpisodeId || (eps[0] && eps[0].id);
    const epLinks = eps.map(e => `        <li><a href="/app/read.html?novel=${encodeURIComponent(n.slug)}&amp;ep=${encodeURIComponent(e.id)}">${htmlEsc(e.num != null ? e.num + '화' : (e.order || '') + '화')} ${htmlEsc(e.title || '')}</a></li>`).join('\n');
    const adHead = adClient ? `\n  <meta name="google-adsense-account" content="${htmlEsc(adClient)}">\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${htmlEsc(adClient)}" crossorigin="anonymous"></script>` : '';
    const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Book', name: n.title, genre: n.genre, author: { '@type': 'Person', name: (config.author && config.author.name) || brand }, numberOfPages: n.episodeCount, bookFormat: 'https://schema.org/EBook', inLanguage: 'ko', description: descRaw, url, ...(n.cover ? { image: coverAbs } : {}) });
    const cover = n.cover ? `<img src="${htmlEsc(n.cover)}" alt="${htmlEsc(n.title)} 표지">` : `<div class="cover-title">${htmlEsc(n.title)}</div>`;
    const html = `<!DOCTYPE html>
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
  <meta property="og:site_name" content="${htmlEsc(config.siteName || brand)}">
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
    fs.writeFileSync(path.join(outDir, `${n.slug}.html`), html, 'utf8');
  }
}

build();
