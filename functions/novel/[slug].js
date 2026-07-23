/* /novel/{slug} 실시간 SEO 랜딩 페이지 (정적 파일이 아직 없을 때의 안전장치)
   - 배포된 app/data/index.json 을 읽어 그 작품의 랜딩 HTML을 즉시 생성해 반환
   - 미리 생성된 정적 novel/{slug}.html 이 있으면 그게 우선 서빙되고, 없으면 이 함수가 처리 */
import { novelLandingHtml } from '../api/_lib.js';

export async function onRequestGet(context) {
  const { params, request } = context;
  let slug = params.slug;
  if (Array.isArray(slug)) slug = slug[0];
  slug = decodeURIComponent(String(slug || '')).replace(/\.html$/i, '');
  const origin = new URL(request.url).origin;
  try {
    const idx = await fetch(origin + '/app/data/index.json', { cf: { cacheTtl: 60 } })
      .then(r => r.ok ? r.json() : { novels: [] }).catch(() => ({ novels: [] }));
    const novel = (idx.novels || []).find(n => n.slug === slug);
    if (!novel) {
      return new Response('<!doctype html><meta charset="utf-8"><title>작품 없음</title><p style="font-family:sans-serif;text-align:center;padding:60px">작품을 찾을 수 없습니다. <a href="/">홈으로</a></p>',
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const cfg = await fetch(origin + '/app/site.config.json')
      .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    if (!cfg.baseUrl) cfg.baseUrl = origin;
    return new Response(novelLandingHtml(novel, cfg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (e) {
    return new Response('일시적인 오류가 발생했습니다.', { status: 500 });
  }
}
