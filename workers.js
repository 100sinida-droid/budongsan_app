/**
 * AptScore - Cloudflare Workers CORS 프록시
 * 공공데이터포털 국토교통부 실거래가 API의 CORS 문제를 해결합니다.
 *
 * 배포 방법:
 * 1. https://workers.cloudflare.com 접속 → 로그인
 * 2. "Create a Worker" 클릭
 * 3. 아래 코드 전체 복붙 → "Deploy" 클릭
 * 4. 배포된 URL (예: https://apt-proxy.your-name.workers.dev) 복사
 * 5. AptScore 우측 상단 "실거래 연동" 버튼 → Workers URL 입력 → 저장
 *
 * 허용 도메인: stock-predictor-dx2.pages.dev (본인 도메인으로 변경)
 */

const ALLOWED_ORIGINS = [
  'https://stock-predictor-dx2.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
];

// 허용할 API 도메인 (보안: 공공데이터포털만 허용)
const ALLOWED_API_HOST = 'apis.data.go.kr';

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': isAllowed ? origin : '',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // GET만 허용
    if (req.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ?url= 파라미터 추출
    const reqUrl = new URL(req.url);
    const targetUrl = reqUrl.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'url parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 보안: 허용된 API 도메인만 프록시
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400 });
    }

    if (parsed.hostname !== ALLOWED_API_HOST) {
      return new Response(JSON.stringify({ error: 'forbidden host' }), { status: 403 });
    }

    // 공공데이터 API 호출
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'AptScore/1.0',
          'Accept': 'application/json',
        },
        cf: { cacheTtl: 3600, cacheEverything: true }, // 1시간 캐시
      });

      const data = await res.text();

      return new Response(data, {
        status: res.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          'X-Proxy': 'AptScore-Workers',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
