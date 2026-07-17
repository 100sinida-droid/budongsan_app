/* =========================================================
   공통 스크립트 (KG 네임스페이스)
   - 설정 로드 / 테마 / 헤더·푸터 / 유틸 / 마크다운 / SEO 메타
   ========================================================= */
(function () {
  const KG = (window.KG = window.KG || {});

  // ---------- 설정 로드 (동기 캐시) ----------
  let _config = null;
  KG.getConfig = async function () {
    if (_config) return _config;
    try {
      const r = await fetch('/app/site.config.json', { cache: 'no-cache' });
      _config = await r.json();
    } catch (e) {
      _config = { siteName: '웹소설 아카이브', author: {} };
    }
    return _config;
  };

  KG.fetchJSON = async function (url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('데이터를 불러오지 못했습니다: ' + url);
    return r.json();
  };

  KG.fetchText = async function (url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('파일을 불러오지 못했습니다: ' + url);
    return r.text();
  };

  KG.qs = function (name) {
    return new URLSearchParams(location.search).get(name);
  };

  KG.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // ---------- 날짜 ----------
  KG.formatDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  };
  KG.formatRelative = function (iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const diff = Date.now() - d.getTime();
    const day = 86400000;
    if (diff < 0) return KG.formatDate(iso);
    if (diff < day) return '오늘';
    if (diff < day * 2) return '어제';
    if (diff < day * 7) return `${Math.floor(diff / day)}일 전`;
    if (diff < day * 30) return `${Math.floor(diff / (day * 7))}주 전`;
    return KG.formatDate(iso);
  };

  // ---------- 테마 (다크모드) ----------
  KG.THEME_KEY = 'kg-theme';
  KG.applyTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KG.THEME_KEY, theme); } catch (e) {}
    const icon = document.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  };
  KG.initTheme = function () {
    let t;
    try { t = localStorage.getItem(KG.THEME_KEY); } catch (e) {}
    if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    KG.applyTheme(t);
  };
  KG.toggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme');
    KG.applyTheme(cur === 'dark' ? 'light' : 'dark');
  };

  // ---------- 헤더 / 푸터 ----------
  // ---------- 프로모션 배너 (site.config.json 의 promoBanner) ----------
  KG.renderPromoBanner = async function () {
    const cfg = await KG.getConfig();
    const pb = cfg.promoBanner;
    if (!pb || !pb.enabled || !pb.url) return;
    if (document.querySelector('.promo-bar')) return;
    const bar = document.createElement('a');
    bar.className = 'promo-bar';
    bar.href = pb.url; bar.target = '_blank'; bar.rel = 'noopener';
    bar.innerHTML = `<span class="promo-text">${KG.escapeHtml(pb.text || '바로가기')}</span><span class="promo-arrow">›</span>`;
    document.body.insertBefore(bar, document.body.firstChild);
  };

  // ---------- 구글 애드센스 ----------
  KG.initAds = async function () {
    const cfg = await KG.getConfig();
    const ad = cfg.adsense;
    if (!ad || !ad.enabled || !ad.client) return null;
    if (!document.querySelector('script[data-kg-adsense]')) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ad.client);
      s.crossOrigin = 'anonymous';
      s.setAttribute('data-kg-adsense', '1');
      document.head.appendChild(s);
    }
    return ad;
  };
  // 페이지의 <div class="ad-slot"></div> 자리에 광고를 채웁니다.
  KG.renderAds = async function () {
    const ad = await KG.initAds();
    if (!ad) return;
    document.querySelectorAll('.ad-slot:not([data-filled])').forEach(slot => {
      slot.setAttribute('data-filled', '1');
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-format', slot.getAttribute('data-ad-format') || 'autorelaxed');
      ins.setAttribute('data-ad-client', ad.client);
      ins.setAttribute('data-ad-slot', slot.getAttribute('data-ad-slot') || ad.slot);
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  };

  KG.renderChrome = async function (active) {
    const cfg = await KG.getConfig();
    const header = document.querySelector('[data-site-header]');
    if (header) {
      header.innerHTML = `
        <div class="container">
          <a class="logo" href="/" aria-label="${KG.escapeHtml(cfg.siteName)} 홈">
            <span class="mark">강</span>
            <span>${KG.escapeHtml(cfg.siteShortName || cfg.siteName)}</span>
          </a>
          <nav class="header-nav" aria-label="주요 메뉴">
            <a href="/app/novels.html" class="${active === 'novels' ? 'active' : ''}"><span class="label">작품</span></a>
            <a href="/app/search.html" class="${active === 'search' ? 'active' : ''}" aria-label="검색">🔎<span class="label" style="margin-left:4px">검색</span></a>
            <button class="icon-btn" data-theme-toggle aria-label="다크모드 전환"><span data-theme-icon>🌙</span></button>
          </nav>
        </div>`;
      header.querySelector('[data-theme-toggle]').addEventListener('click', KG.toggleTheme);
      const icon = header.querySelector('[data-theme-icon]');
      if (icon) icon.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    }
    const footer = document.querySelector('[data-site-footer]');
    if (footer) {
      const year = new Date().getFullYear();
      footer.innerHTML = `
        <div class="container">
          <div class="f-links">
            <a href="/">홈</a>
            <a href="/app/novels.html">작품 목록</a>
            <a href="/app/search.html">검색</a>
          </div>
          <div class="copy">© ${year} ${KG.escapeHtml(cfg.author?.name || cfg.siteName)}. All rights reserved.</div>
        </div>`;
    }
  };

  // ---------- SEO 메타 태그 동적 설정 ----------
  KG.setMeta = async function (opts) {
    const cfg = await KG.getConfig();
    const base = (cfg.baseUrl || '').replace(/\/$/, '');
    const title = opts.title ? `${opts.title} | ${cfg.siteName}` : cfg.siteName;
    const desc = opts.description || cfg.description || '';
    const url = base + (opts.path || location.pathname + location.search);
    const image = base + (opts.image || cfg.ogImage || '');

    document.title = title;
    setTag('meta[name="description"]', 'content', desc);
    setTag('link[rel="canonical"]', 'href', url, 'link');
    // Open Graph
    setProp('og:title', title);
    setProp('og:description', desc);
    setProp('og:url', url);
    setProp('og:type', opts.type || 'website');
    setProp('og:site_name', cfg.siteName);
    setProp('og:locale', cfg.locale || 'ko_KR');
    if (image) setProp('og:image', image);
    // Twitter
    setTag('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setTag('meta[name="twitter:title"]', 'content', title);
    setTag('meta[name="twitter:description"]', 'content', desc);
    if (image) setTag('meta[name="twitter:image"]', 'content', image);

    function setTag(sel, attr, val, tag) {
      let el = document.head.querySelector(sel);
      if (!el) {
        el = document.createElement(tag || 'meta');
        const m = sel.match(/\[(\w+)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, val);
    }
    function setProp(prop, val) {
      let el = document.head.querySelector(`meta[property="${prop}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
      el.setAttribute('content', val);
    }
  };

  // JSON-LD 구조화 데이터 삽입 (SEO 강화)
  KG.setJsonLd = function (obj) {
    let el = document.getElementById('kg-jsonld');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'kg-jsonld'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(obj);
  };

  // ---------- 경량 마크다운 렌더러 ----------
  // 웹소설 본문에 필요한 것: 문단, 줄바꿈, 헤딩, 굵게/기울임, 인용, 구분선
  KG.renderMarkdown = function (md) {
    md = String(md).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 프론트매터 제거
    md = md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

    const blocks = md.split(/\n{2,}/);
    const out = [];
    for (let block of blocks) {
      block = block.replace(/^\n+|\n+$/g, '');
      if (!block) continue;

      // 구분선
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(block.trim())) { out.push('<hr>'); continue; }
      // 헤딩
      const h = block.match(/^(#{1,6})\s+(.+)$/);
      if (h && block.split('\n').length === 1) {
        const lvl = Math.min(h[1].length, 3) + 1; // h2~h4로 매핑
        out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
        continue;
      }
      // 인용
      if (/^>\s?/.test(block)) {
        const inner = block.split('\n').map(l => l.replace(/^>\s?/, '')).join('<br>');
        out.push(`<blockquote>${inline(inner)}</blockquote>`);
        continue;
      }
      // 일반 문단 (문단 내 단일 줄바꿈은 <br>)
      const lines = block.split('\n').map(l => inline(l)).join('<br>');
      out.push(`<p>${lines}</p>`);
    }
    return out.join('\n');

    function inline(s) {
      s = KG.escapeHtml(s);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      return s;
    }
  };

  // ---------- 공통 부트스트랩 ----------
  KG.boot = async function (active) {
    KG.initTheme();
    await KG.renderPromoBanner();
    await KG.renderChrome(active);
    KG.renderAds();
  };
})();
