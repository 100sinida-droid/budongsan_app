/* ═══════════════════════════════════════════════════════════════
   api.js  │  최적화된 무료 API 버전
   - 위치 조회    : Nominatim (OpenStreetMap) — 키 없음
   - 주변시설 조회: Overpass API (OSM)         — 키 없음
   - 실거래가     : 국토교통부 공공API           — 키 필요 (옵션)
   - 속도 개선    : 병렬 처리 최적화, 불필요한 대기 제거
   ═══════════════════════════════════════════════════════════════ */

const API = (() => {

  // ── 핵심 업무지구 좌표 (Nominatim 조회 대신 하드코딩 — 안정적) ──
  const KEY_HUBS = [
    { name:'강남역',     lat:37.4980, lng:127.0276, weight:3 },
    { name:'광화문',     lat:37.5752, lng:126.9769, weight:3 },
    { name:'시청',       lat:37.5666, lng:126.9779, weight:2 },
    { name:'여의도',     lat:37.5219, lng:126.9245, weight:2 },
    { name:'판교테크노', lat:37.3943, lng:127.1112, weight:2 },
    { name:'잠실',       lat:37.5133, lng:127.1001, weight:1 },
    { name:'종로3가',    lat:37.5717, lng:126.9920, weight:1 },
  ];

  // ── 법정동 코드 ─────────────────────────────────────────────
  const LAWD = {
    '강남':'11680','서초':'11650','송파':'11710','강동':'11740',
    '마포':'11440','용산':'11170','성동':'11200','광진':'11215',
    '강서':'11500','양천':'11470','영등포':'11560','동작':'11590',
    '관악':'11620','은평':'11380','서대문':'11410','종로':'11110',
    '중구':'11140','성북':'11290','노원':'11350','강북':'11305',
    '도봉':'11320','중랑':'11260','동대문':'11230','금천':'11545',
    '구로':'11530','수원':'41110','성남':'41130','분당':'41135',
    '고양':'41280','용인':'41460','부천':'41190','안산':'41270',
    '화성':'41590','남양주':'41360','평택':'41220','시흥':'41390',
    '해운대':'26350','수성':'27290','유성':'30200','목동':'11470',
    '일산':'41285','광명':'41210','하남':'41450','과천':'41290',
    '의왕':'41430','군포':'41410','안양':'41170','의정부':'41150',
    '판교':'41135','동탄':'41590','광교':'41115','위례':'11710',
    '부산':'26110','인천':'28110','대구':'27110','대전':'30110',
    '광주':'29110','울산':'31110','세종':'36110',
  };

  // ── 유틸 ────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function haversine(lat1, lng1, lat2, lng2) {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function fmtDist(m) { return m>=1000?`${(m/1000).toFixed(1)}km`:`${Math.round(m)}m`; }

  function fmtPrice(man) {
    if (!man||man<=0) return '정보없음';
    const uk=Math.floor(man/10000), m=man%10000;
    if (uk>0&&m>0) return `${uk}억 ${m.toLocaleString()}만원`;
    if (uk>0) return `${uk}억원`;
    return `${m.toLocaleString()}만원`;
  }

  function getRecentMonths(n) {
    const months=[], now=new Date();
    for (let i=0; i<n; i++) {
      const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return months;
  }

  function guessLawd(name) {
    for (const [k,v] of Object.entries(LAWD)) { if (name.includes(k)) return v; }
    return '11680';
  }

  // ── 1. Nominatim 위치 조회 (키 없음) - 최적화 ──────────────
  async function getLocation(aptName) {
    // 더 구체적인 쿼리 우선순위로 변경
    const queries = [
      `${aptName} 아파트 대한민국`,
      `${aptName} Korea`,
    ];
    
    for (const q of queries) {
      try {
        await sleep(200); // 300ms에서 200ms로 단축
        const url = `https://nominatim.openstreetmap.org/search?`
          + `q=${encodeURIComponent(q)}&format=json&limit=5` // limit 3에서 5로 증가
          + `&countrycodes=kr&addressdetails=1&accept-language=ko`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'AptScore/2.0 (apartment analysis tool)' }
        });
        const data = await res.json();
        
        // 더 나은 매칭 로직
        for (const d of data) {
          const displayName = d.display_name.toLowerCase();
          const aptNameLower = aptName.toLowerCase();
          
          // 아파트 이름이 결과에 포함되어 있는지 확인
          if (displayName.includes(aptNameLower) || 
              displayName.includes(aptName) ||
              (d.address && Object.values(d.address).some(v => 
                v && v.toString().includes(aptName)))) {
            const addr = d.address;
            const addrStr = [
              addr?.city||addr?.county||addr?.state,
              addr?.suburb||addr?.neighbourhood||addr?.quarter,
              addr?.road
            ].filter(Boolean).join(' ');
            return { 
              lat: parseFloat(d.lat), 
              lng: parseFloat(d.lon), 
              addr: addrStr || d.display_name 
            };
          }
        }
        
        // 매칭 실패 시 첫 번째 결과 사용
        if (data.length > 0) {
          const d = data[0];
          const addr = d.address;
          const addrStr = [
            addr?.city||addr?.county||addr?.state,
            addr?.suburb||addr?.neighbourhood||addr?.quarter,
            addr?.road
          ].filter(Boolean).join(' ');
          return { lat: parseFloat(d.lat), lng: parseFloat(d.lon), addr: addrStr || d.display_name };
        }
      } catch(e) { 
        console.warn('Nominatim:', e); 
      }
    }
    
    // 완전 실패 시 기본 서울 좌표 반환 (분석 실패 방지)
    console.warn(`위치 조회 실패: ${aptName} - 기본 좌표 사용`);
    return { lat: 37.5665, lng: 126.9780, addr: '서울특별시 (위치 추정)' };
  }

  // ── 2. Overpass API (OSM) 주변시설 조회 - 최적화 ─────────
  async function overpassQuery(ql) {
    const url = 'https://overpass-api.de/api/interpreter';
    try {
      await sleep(100); // 200ms에서 100ms로 단축
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(ql)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const json = await res.json();
      return json.elements || [];
    } catch(e) { console.warn('Overpass:', e); return []; }
  }

  async function getNearby(lat, lng, radiusM, filter) {
    const ql = `[out:json][timeout:15];
      (node${filter}(around:${radiusM},${lat},${lng});
       way${filter}(around:${radiusM},${lat},${lng}););
      out center;`;
    const els = await overpassQuery(ql);
    return els.map(el => ({
      name: el.tags?.name || el.tags?.['name:ko'] || '이름없음',
      lat:  el.lat || el.center?.lat,
      lng:  el.lon || el.center?.lon,
      dist: haversine(lat, lng, el.lat||el.center?.lat, el.lon||el.center?.lon),
    })).filter(e => e.lat && e.lng).sort((a,b)=>a.dist-b.dist);
  }

  // ── 3. 국토교통부 실거래가 (CORS 프록시) - 최적화 ────────
  async function fetchTrades(lawdCd, dealYmd) {
    if (!CONFIG.isMolitSet()) return [];
    const target = `http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`
      + `?serviceKey=${CONFIG.molitKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
    try {
      const res  = await fetch(url);
      const text = await res.text();
      const xml  = new DOMParser().parseFromString(text, 'text/xml');
      return Array.from(xml.querySelectorAll('item')).map(item => {
        const g = t => (item.querySelector(t)?.textContent||'').trim();
        return {
          name:      g('aptNm'),
          price:     parseInt(g('dealAmount').replace(/,/g,''),10)||0,
          area:      parseFloat(g('excluUseAr'))||0,
          floor:     g('floor'),
          buildYear: parseInt(g('buildYear'),10)||0,
          dong:      g('umdNm'),
          year:      parseInt(g('dealYear'),10)||0,
          month:     parseInt(g('dealMonth'),10)||0,
          day:       parseInt(g('dealDay'),10)||0,
        };
      }).filter(r=>r.price>0&&r.area>0);
    } catch { return []; }
  }

  async function getTradeRecords(aptName, nMonths=6, onProgress) {
    const lawd=guessLawd(aptName), months=getRecentMonths(nMonths);
    const prefix=aptName.slice(0,4);
    const target=[];
    
    // 병렬 처리로 속도 개선
    const promises = months.map(async (month, i) => {
      if(onProgress) onProgress(`실거래가 수집 중... (${i+1}/${months.length}개월)`);
      await sleep(i * 100); // stagger requests
      const recs = await fetchTrades(lawd, month);
      return recs.filter(r=>r.name.includes(prefix)||r.name.includes(aptName));
    });
    
    const results = await Promise.all(promises);
    results.forEach(recs => target.push(...recs));
    
    return target;
  }

  // ══════════════════════════════════════════════════════
  //   점수 계산 함수들
  // ══════════════════════════════════════════════════════

  // ── 점수1: 지역 선호도 (20점) - 새로 추가! ─────────────
  function scoreLocationPreference(addr) {
    const score = getLocationPreferenceScore(addr);
    
    // 지역별 특징 설명
    let description = '';
    if (score >= 95) {
      description = '최고급 프리미엄 지역';
    } else if (score >= 85) {
      description = '선호도 높은 우수 지역';
    } else if (score >= 75) {
      description = '안정적인 선호 지역';
    } else if (score >= 65) {
      description = '보통 수준의 지역';
    } else {
      description = '발전 가능성 있는 지역';
    }
    
    return { 
      score: score, 
      details: {
        '주소': addr || '정보없음',
        '지역특성': description,
        '선호도등급': score >= 90 ? 'S급' : score >= 80 ? 'A급' : score >= 70 ? 'B급' : 'C급'
      } 
    };
  }

  // ── 점수2: 핵심시설 접근성 (20점) ─────────────────────
  function scoreHubs(lat, lng) {
    if (!lat) return { score:50, details:{'메시지':'위치 조회 실패'}, facilities:{} };
    const details={}, facDists={};
    let totalW=0, weightedSum=0;

    for (const hub of KEY_HUBS) {
      totalW += hub.weight;
      const dist = haversine(lat, lng, hub.lat, hub.lng);
      let s;
      if      (dist<=1000)  s=100;
      else if (dist<=3000)  s=100-(dist-1000)/2000*30;
      else if (dist<=7000)  s=70-(dist-3000)/4000*30;
      else if (dist<=15000) s=40-(dist-7000)/8000*40;
      else                  s=0;
      s=Math.max(0,Math.round(s*10)/10);
      details[hub.name] = fmtDist(dist);
      facDists[hub.name] = dist;
      weightedSum += hub.weight * s;
    }
    const sorted = Object.entries(facDists).sort((a,b)=>a[1]-b[1]);
    if (sorted.length) {
      details['가장가까운'] = sorted[0][0];
      details['거리']       = fmtDist(sorted[0][1]);
    }
    return { score:Math.round(weightedSum/totalW*10)/10, details, facilities:facDists };
  }

  // ── 점수3: 지하철·버스 (15점) - 병렬 처리 최적화 ─────
  async function scoreTransit(lat, lng) {
    if (!lat) return { score:50, details:{'메시지':'위치 조회 실패'} };

    // 병렬 처리로 속도 개선
    const [subways, buses] = await Promise.all([
      getNearby(lat, lng, 1500, `["railway"~"station|subway_entrance"]["station"!~"light_rail"]`),
      getNearby(lat, lng, 300, `["highway"="bus_stop"]`)
    ]);
    
    const subNear = subways[0]||{ name:'없음', dist:9999 };
    const cnt500  = subways.filter(s=>s.dist<=500).length;
    const cnt1k   = subways.filter(s=>s.dist<=1000).length;
    const busCnt = Math.min(buses.length, 15);

    let subScore;
    if      (subNear.dist<=300)  subScore=100;
    else if (subNear.dist<=600)  subScore=85;
    else if (subNear.dist<=1000) subScore=65;
    else if (subNear.dist<=1500) subScore=40;
    else                         subScore=15;

    const score = Math.min(100, subScore*0.75 + Math.min(15,cnt500*8+cnt1k*3) + Math.min(10,busCnt*2));
    return { score:Math.round(score*10)/10, details:{
      '가장가까운역':    subNear.name,
      '역거리':          subNear.dist<9999 ? fmtDist(subNear.dist) : '1.5km 초과',
      '500m내역수':      cnt500,
      '1km내역수':       cnt1k,
      '300m내버스정류장': busCnt,
    }};
  }

  // ── 점수4: 학군 (15점) - 병렬 처리 최적화 ──────────────
  async function scoreSchool(lat, lng) {
    if (!lat) return { score:50, details:{'메시지':'위치 조회 실패'} };

    // 병렬 처리로 속도 개선
    const [elem, middle, high, allSchools] = await Promise.all([
      getNearby(lat, lng, 1000, `["amenity"="school"]["school:level"~"primary|elementary"]`),
      getNearby(lat, lng, 1000, `["amenity"="school"]["school:level"="middle"]`),
      getNearby(lat, lng, 1500, `["amenity"="school"]["school:level"="high"]`),
      getNearby(lat, lng, 1500, `["amenity"="school"]`)
    ]);

    const ed = elem.length ? elem[0].dist : (allSchools.length ? allSchools[0].dist : 9999);
    const md = middle.length ? middle[0].dist : (allSchools.length>=2 ? allSchools[1]?.dist||9999 : 9999);
    const hd = high.length ? high[0].dist : (allSchools.length>=3 ? allSchools[2]?.dist||9999 : 9999);

    const es=ed<=300?100:ed<=500?80:ed<=800?55:ed<=1000?30:10;
    const ms=md<=500?100:md<=800?80:md<=1000?50:20;
    const hs=hd<=700?100:hd<=1000?75:hd<=1500?50:20;
    const score=es*0.5+ms*0.3+hs*0.2;

    const eName = allSchools[0]?.name || elem[0]?.name || '없음';
    const mName = allSchools[1]?.name || middle[0]?.name || '없음';
    const hName = allSchools[2]?.name || high[0]?.name || '없음';

    return { score:Math.round(score*10)/10, details:{
      '인근학교(초)':  `${eName} (${fmtDist(ed)})`,
      '인근학교(중)':  `${mName} (${fmtDist(md)})`,
      '인근학교(고)':  `${hName} (${fmtDist(hd)})`,
      '1km내학교수':   allSchools.filter(s=>s.dist<=1000).length + '개',
    }};
  }

  // ── 점수5: 편의시설 (10점) - 병렬 처리 최적화 ───────────
  async function scoreAmenity(lat, lng) {
    if (!lat) return { score:50, details:{} };

    // 병렬 처리로 속도 개선
    const [mart, hosp, pharmacy, conv, park] = await Promise.all([
      getNearby(lat, lng, 500, `["shop"~"supermarket|mall|department_store"]`),
      getNearby(lat, lng, 500, `["amenity"~"hospital|clinic"]`),
      getNearby(lat, lng, 300, `["amenity"="pharmacy"]`),
      getNearby(lat, lng, 200, `["shop"="convenience"]`),
      getNearby(lat, lng, 700, `["leisure"~"park|garden"]`)
    ]);

    const weighted =
      Math.min(mart.length,3)*20 +
      Math.min(hosp.length,3)*8 +
      Math.min(pharmacy.length,3)*4 +
      Math.min(conv.length,3)*2 +
      Math.min(park.length,2)*10;

    return { score:Math.round(Math.min(100,weighted/80*100)*10)/10, details:{
      '대형마트(500m)': mart.length+'개',
      '병원(500m)':     hosp.length+'개',
      '약국(300m)':     pharmacy.length+'개',
      '편의점(200m)':   conv.length+'개',
      '공원(700m)':     park.length+'개',
    }};
  }

  // ── 점수6: 건물 신축도 (10점) ──────────────────────────
  function scoreBuilding(recs) {
    const yrs=recs.filter(r=>r.buildYear>1970&&r.buildYear<=new Date().getFullYear()).map(r=>r.buildYear);
    if (!yrs.length) return { score:50, details:{'건축년도':'정보없음'} };
    const avg=yrs.reduce((a,b)=>a+b,0)/yrs.length;
    const age=new Date().getFullYear()-avg;
    return { score:Math.round(Math.max(0,Math.min(100,(35-age)/35*100))*10)/10, details:{
      '평균건축년도': Math.round(avg)+'년',
      '평균연식':     Math.round(age)+'년',
      '재건축가능성': age>=30?'높음(30년+)': age>=20?'보통(20~30년)':'낮음',
    }};
  }

  // ── 점수7: ㎡당 가격수준 (10점) ────────────────────────
  function scorePriceLevel(recs) {
    if (!recs.length) return { score:50, details:{'메시지':'MOLIT API 키 필요'} };
    const vals=recs.filter(r=>r.area>0).map(r=>r.price/r.area);
    if (!vals.length) return { score:50, details:{'메시지':'데이터없음'} };
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const avgTotal=recs.reduce((a,r)=>a+r.price,0)/recs.length;
    return { score:Math.round(Math.max(0,Math.min(100,(4000-avg)/3500*100))*10)/10, details:{
      '㎡당평균가(만)': Math.round(avg).toLocaleString()+'만',
      '평균거래가':     fmtPrice(Math.round(avgTotal)),
      '최고거래가':     fmtPrice(Math.max(...recs.map(r=>r.price))),
      '최저거래가':     fmtPrice(Math.min(...recs.map(r=>r.price))),
    }};
  }

  // ── 메인 분석 - 최적화 버전 ─────────────────────────────
  async function analyze(aptName, onProgress=()=>{}) {
    const W={ 
      '지역선호도':20, '핵심시설접근성':20, '지하철버스교통':15,
      '학군':15, '편의시설':10, '건물신축도':10, '㎡당가격수준':10 
    };

    onProgress('📍 위치 정보 조회 중... (Nominatim OSM)');
    const { lat, lng, addr } = await getLocation(aptName);

    // 병렬 처리 1: 위치 기반 점수들 (교통, 학군, 편의시설)
    onProgress('🚀 주변 환경 분석 중... (병렬 처리)');
    const [p3, p4, p5, recs] = await Promise.all([
      scoreTransit(lat, lng),
      scoreSchool(lat, lng),
      scoreAmenity(lat, lng),
      getTradeRecords(aptName, 6, onProgress)
    ]);

    // 동기 점수 계산
    onProgress('📊 점수 계산 중...');
    const p1 = scoreLocationPreference(addr);  // 새로운 지역선호도 점수
    const p2 = scoreHubs(lat, lng);
    const p6 = scoreBuilding(recs);
    const p7 = scorePriceLevel(recs);

    const scores = {
      '지역선호도':p1.score, '핵심시설접근성':p2.score,
      '지하철버스교통':p3.score, '학군':p4.score,
      '편의시설':p5.score, '건물신축도':p6.score, '㎡당가격수준':p7.score,
    };
    const total = Math.round(Object.keys(scores).reduce((s,k)=>s+scores[k]*W[k]/100,0)*10)/10;

    return {
      aptName, addr, lat, lng, recs, scores, total, weights:W,
      grade: total>=80?'S':total>=70?'A':total>=60?'B':total>=50?'C':'D',
      details:{
        지역:p1.details, 핵심시설:p2.details, 교통:p3.details,
        학군:p4.details, 편의:p5.details, 건물:p6.details, 가격:p7.details,
        facilities:p2.facilities,
      },
    };
  }

  return { analyze, haversine, fmtDist, fmtPrice, KEY_HUBS };
})();
