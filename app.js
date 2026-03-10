/* ═══════════════════════════════════════════════════════
   app.js  │  UI 이벤트 & 렌더링 (지역선호도 버전)
   ═══════════════════════════════════════════════════════ */

const QUICK_SEARCHES = [
  '래미안퍼스티지','아크로리버파크','헬리오시티',
  '마포래미안푸르지오','힐스테이트판교역','자이아파트',
];

const FAMOUS_APTS = [
  '래미안퍼스티지','아크로리버파크','마포래미안푸르지오','헬리오시티',
  '올림픽파크포레온','디에이치아너힐스','반포자이','개포주공아파트',
  '잠실엘스','잠실리센츠','힐스테이트판교역','판교알파리움',
  '광교중흥S클래스','동탄역롯데캐슬','위례자이더시티',
  '래미안블레스티지','신반포자이','아크로비스타',
  '삼성래미안','롯데캐슬이스트폴','e편한세상',
  '자이','아이파크','푸르지오','힐스테이트',
];

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  restoreKeys();
  updateStatus();
});

function initUI() {
  // 빠른 검색 칩
  const qsWrap = document.getElementById('quick-search');
  QUICK_SEARCHES.forEach(name => {
    const chip = Object.assign(document.createElement('button'), {
      className: 'quick-chip', textContent: name,
      onclick: () => { document.getElementById('search-input').value = name; runSearch(name); }
    });
    qsWrap?.appendChild(chip);
  });

  // 검색
  document.getElementById('search-btn').onclick  = () => runSearch(document.getElementById('search-input').value.trim());
  document.getElementById('search-input').onkeydown = e => { if(e.key==='Enter') runSearch(document.getElementById('search-input').value.trim()); };
  document.getElementById('search-input').oninput   = e => handleAC(e.target.value);

  // API 패널
  document.getElementById('api-toggle').onclick = () => document.getElementById('api-panel').classList.toggle('open');
  document.getElementById('api-save-btn').onclick = saveKeys;

  // 면적 필터
  document.querySelectorAll('.filter-chip').forEach(c =>
    c.onclick = () => {
      document.querySelectorAll('.filter-chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      filterTable(c.dataset.area);
    }
  );

  // 자동완성 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-input-wrap'))
      document.getElementById('ac-list')?.classList.remove('show');
  });
}

function restoreKeys() {
  document.getElementById('molit-key-input').value = CONFIG.molitKey;
}

function saveKeys() {
  CONFIG.save(document.getElementById('molit-key-input').value);
  updateStatus();
  showToast('✅ API 키 저장 완료', 'success');
  document.getElementById('api-panel').classList.remove('open');
}

function updateStatus() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (CONFIG.isMolitSet()) {
    dot.className='status-dot connected'; text.textContent='MOLIT 연결됨';
  } else {
    dot.className='status-dot'; text.textContent='OSM 모드 (무료)';
  }
}

// 자동완성
function handleAC(val) {
  const list = document.getElementById('ac-list');
  if (!val||val.length<1) { list.classList.remove('show'); return; }
  const matched = FAMOUS_APTS.filter(a=>a.includes(val)).slice(0,6);
  if (!matched.length) { list.classList.remove('show'); return; }
  list.innerHTML = matched.map(n=>`<div class="ac-item" onclick="selectAc('${n}')">🏠 <strong>${n}</strong></div>`).join('');
  list.classList.add('show');
}
function selectAc(name) {
  document.getElementById('search-input').value = name;
  document.getElementById('ac-list').classList.remove('show');
  runSearch(name);
}

// ── 검색 실행 ──────────────────────────────────────────
let currentRecs=[], currentResult=null;

async function runSearch(name) {
  if (!name) { showToast('아파트 이름을 입력해 주세요', 'error'); return; }
  document.getElementById('ac-list')?.classList.remove('show');

  setLoading(true); hideError();
  document.getElementById('result-section').classList.remove('show');

  try {
    const result = await API.analyze(name, msg => {
      document.getElementById('loading-msg').textContent = msg;
    });
    currentResult=result; currentRecs=result.recs;
    renderResult(result);
    showToast(`✅ ${name} 분석 완료!`, 'success');
  } catch(err) {
    console.error(err);
    showError('분석 중 오류: ' + err.message + '\n잠시 후 다시 시도해 주세요.');
  } finally { setLoading(false); }
}

function setLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('show', on);
  const btn = document.getElementById('search-btn');
  btn.disabled=on; btn.textContent=on?'⏳ 분석 중...':'🔍 분석 시작';
}
function showError(msg) {
  const el=document.getElementById('error-box');
  el.textContent='⚠️ '+msg; el.classList.add('show');
}
function hideError() { document.getElementById('error-box').classList.remove('show'); }

// ── 결과 렌더링 ─────────────────────────────────────────
function renderResult(r) {
  renderHeader(r);
  renderCards(r);
  renderProsCons(r);
  renderInvest(r);
  CHARTS.drawRadar('radar-canvas', r.scores, r.grade);
  CHARTS.drawPriceTrend('trend-canvas', r.recs);
  CHARTS.drawHubBars('hub-bars', r.details.facilities||{});
  renderTable(r.recs);
  document.getElementById('result-section').classList.add('show');
  setTimeout(()=>document.getElementById('result-section').scrollIntoView({behavior:'smooth',block:'start'}),100);
}

function renderHeader(r) {
  const gc = GRADE_COLOR[r.grade];
  document.getElementById('res-apt-name').textContent = r.aptName;
  document.getElementById('res-apt-addr').textContent = r.addr || '주소: Nominatim OSM 조회 실패 (정확한 아파트명 사용 권장)';
  document.getElementById('res-score-num').textContent = r.total;
  document.getElementById('res-grade').textContent = r.grade;
  document.getElementById('res-grade-desc').textContent = GRADE_NAME[r.grade]+' 등급';
  document.getElementById('res-date').textContent = new Date().toLocaleString('ko-KR');
  document.getElementById('res-score-num').style.color = gc;
  document.getElementById('res-grade').style.color = gc;
  const fill = document.getElementById('res-gauge-fill');
  if (fill) { fill.style.background=`linear-gradient(90deg,#1D4ED8,${gc})`; setTimeout(()=>fill.style.width=r.total+'%',100); }
  const ring = document.getElementById('res-ring-fill');
  if (ring) {
    const c=2*Math.PI*46;
    ring.setAttribute('stroke',gc); ring.setAttribute('stroke-dasharray',c);
    setTimeout(()=>ring.setAttribute('stroke-dashoffset',c*(1-r.total/100)),100);
  }
}

function renderCards(r) {
  const container = document.getElementById('score-cards');
  const dmap = {
    '지역선호도':r.details.지역,'핵심시설접근성':r.details.핵심시설,
    '지하철버스교통':r.details.교통,'학군':r.details.학군,
    '편의시설':r.details.편의,'건물신축도':r.details.건물,'㎡당가격수준':r.details.가격,
  };
  container.innerHTML = Object.keys(r.scores).map((key,i)=>{
    const s=r.scores[key], w=r.weights[key]||0, d=dmap[key]||{};
    const vc=scoreColor(s);
    const sub=Object.entries(d).slice(0,2).map(([k,v])=>`<span>· ${k}: <b>${v}</b></span>`).join('');
    return `<div class="score-card fade-in-up" style="animation-delay:${i*0.06}s">
      <div class="sc-header">
        <div><div class="sc-label">${SCORE_LABEL[key]||key}</div><div class="sc-weight">가중치 ${w}점</div></div>
        <div class="sc-score" style="color:${vc}">${s}<span class="sc-pt">점</span></div>
      </div>
      <div class="sc-bar-bg"><div class="sc-bar-fill" style="width:0%;background:${vc}" data-target="${s}"></div></div>
      <div class="sc-details">${sub}</div>
    </div>`;
  }).join('');
  setTimeout(()=>container.querySelectorAll('.sc-bar-fill').forEach(el=>{
    el.style.transition='width 1s cubic-bezier(0.4,0,0.2,1)'; el.style.width=el.dataset.target+'%';
  }),200);
}

// 자동 장단점 생성 (지역선호도 버전)
function autoAnalysis(r) {
  const {scores,details,total}=r; const pros=[],cons=[];

  // 지역 선호도 분석
  const locScore=scores['지역선호도']||0;
  const locChar=details.지역?.['지역특성']||'';
  if (locScore>=90) pros.push(['📍 최고급 프리미엄 입지',locChar+' — 강남/서초급 입지']);
  else if (locScore>=80) pros.push(['📍 우수한 지역 선호도',locChar+' — 안정적 자산가치']);
  else if (locScore>=70) pros.push(['📍 양호한 입지',locChar]);
  else if (locScore<60) cons.push(['📍 지역 선호도 낮음','장기 투자 시 신중 검토 필요']);

  const shub=scores['핵심시설접근성'], cls=details.핵심시설?.['가장가까운']||'', clsd=details.핵심시설?.['거리']||'';
  if      (shub>=80) pros.push(['🏙️ 최상급 도심 접근성',`${cls}까지 ${clsd} — 직주근접`]);
  else if (shub>=60) pros.push(['🏙️ 양호한 도심 접근성',`${cls}까지 ${clsd}`]);
  else if (shub<35)  cons.push(['🏙️ 도심 접근성 한계','강남·광화문 등 핵심시설 거리 멀어 출퇴근 부담']);

  const str=scores['지하철버스교통'], sta=details.교통?.['가장가까운역']||'', sd=details.교통?.['역거리']||'', c5=details.교통?.['500m내역수']||0;
  if      (str>=80) pros.push(['🚇 역세권 프리미엄',`${sta}${c5>=2?' ·더블역세권':''} (${sd})`]);
  else if (str>=60) pros.push(['🚇 양호한 교통',`${sta} (${sd})`]);
  else if (str<40)  cons.push(['🚇 교통 불편',`역까지 ${sd} — 대중교통 이용 불편`]);

  const ssch=scores['학군'], sch=details.학군?.['인근학교(초)']||'';
  if      (ssch>=80) pros.push(['🏫 우수 학군',`${sch} — 학교 도보권`]);
  else if (ssch>=65) pros.push(['🏫 양호한 학군',`${sch}`]);
  else if (ssch<40)  cons.push(['🏫 학군 접근성 부족','학교까지 거리 멀어 통학 부담']);

  const sam=scores['편의시설'], mart=details.편의?.['대형마트(500m)']||'0개', park=details.편의?.['공원(700m)']||'0개';
  if      (sam>=75) pros.push(['🏪 생활 인프라 탁월',`마트 ${mart} · 공원 ${park}`]);
  else if (mart!=='0개') pros.push(['🛒 대형마트 근접',`500m 내 마트 ${mart}`]);
  if (parseInt(park)>=2) pros.push(['🌳 녹지 우수',`공원 ${park} — 쾌적 환경`]);
  if (sam<35) cons.push(['🏪 편의시설 부족','근거리 마트·병원·공원 제한적']);

  const sbd=scores['건물신축도'], yr=details.건물?.['평균건축년도']||'', age=details.건물?.['평균연식']||'', rv=details.건물?.['재건축가능성']||'';
  if      (sbd>=80) pros.push(['🏗️ 신축급 건물',`${yr} 준공 (${age})`]);
  else if (sbd>=60) pros.push(['🏗️ 준신축',`${yr} 준공 (${age})`]);
  else { if (rv.includes('높음')) pros.push(['🔨 재건축 기대감',`${age} — 재건축 가능권`]); cons.push(['🏗️ 노후 건물',`${age} — 유지비 증가 가능`]); }

  const spv=scores['㎡당가격수준'], m2p=details.가격?.['㎡당평균가(만)']||'', ap=details.가격?.['평균거래가']||'';
  if      (spv>=70) pros.push(['💰 합리적 가격',`㎡당 ${m2p} (평균 ${ap})`]);
  else if (spv<30)  cons.push(['💰 높은 가격',`㎡당 ${m2p} (평균 ${ap})`]);

  let invest,target;
  if      (total>=75) { invest='✅ 적극 추천 — 핵심 지표 복수 강점 확인. 실거주·투자 모두 높은 만족도 기대.'; target='직주근접 직장인, 자녀 교육 중시 가정, 안정적 자산 성장 투자자'; }
  else if (total>=62) { invest='🟡 긍정적 검토 — 전반적으로 균형 잡힌 입지. 개별 약점을 감안해 판단하세요.'; target='중장기 실거주, 안정 지향 투자자'; }
  else if (total>=50) { invest='⚠️ 중립 — 장단점 혼재. 직장 위치·자녀 여부에 따라 판단이 달라집니다.'; target='해당 지역 직장인, 특정 생활권 선호자'; }
  else                { invest='🔴 신중 검토 — 다수 취약점 확인. 개발 계획·재건축 호재 여부를 추가 조사하세요.'; target='장기 저가 매수 전략, 지역 특수 수요자'; }

  return { pros:pros.slice(0,5), cons:cons.slice(0,4), invest, target };
}

function renderProsCons(r) {
  const {pros,cons}=autoAnalysis(r);
  const mkP=([t,d])=>`<div class="pc-item"><div class="pc-ico">✅</div><div><div class="pc-title">${t}</div><div class="pc-desc">${d}</div></div></div>`;
  const mkC=([t,d])=>`<div class="pc-item"><div class="pc-ico">⚠️</div><div><div class="pc-title">${t}</div><div class="pc-desc">${d}</div></div></div>`;
  document.getElementById('pros-list').innerHTML = pros.length ? pros.map(mkP).join('') : '<div class="pc-desc">장점 데이터 수집 중</div>';
  document.getElementById('cons-list').innerHTML = cons.length ? cons.map(mkC).join('') : '<div class="pc-desc">특별한 단점 없음</div>';
}

function renderInvest(r) {
  const {invest,target}=autoAnalysis(r);
  document.getElementById('invest-text').textContent=invest;
  document.getElementById('invest-target').textContent='🎯 추천 대상: '+target;
}

// 실거래 테이블
function renderTable(recs, areaFilter='all') {
  const tbody=document.getElementById('trade-tbody');
  let filtered=[...recs];
  if (areaFilter!=='all') {
    const [mn,mx]=areaFilter.split('-').map(Number);
    filtered=filtered.filter(r=>r.area>=mn&&(!mx||r.area<mx));
  }
  filtered.sort((a,b)=>b.year*10000+b.month*100+b.day-(a.year*10000+a.month*100+a.day));
  const top=filtered.slice(0,20);
  if (!top.length) {
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:32px;color:#94A3B8">${recs.length===0?'거래 데이터 없음 (MOLIT API 키 설정 권장)':'해당 면적 거래 없음'}</td></tr>`;
    return;
  }
  tbody.innerHTML=top.map(r=>{
    const date=`${r.year}.${String(r.month).padStart(2,'0')}.${String(r.day).padStart(2,'0')}`;
    const m2=r.area>0?Math.round(r.price/r.area):0;
    const py=Math.round(r.area/3.305);
    return `<tr>
      <td><b>${r.name}</b></td>
      <td>${date}</td>
      <td>${r.area}㎡ <span style="color:#94A3B8;font-size:11px">(${py}평)</span></td>
      <td>${r.floor}층</td>
      <td class="price-cell">${fmtPrice(r.price)}</td>
      <td class="m2-cell">${m2.toLocaleString()}만/㎡</td>
    </tr>`;
  }).join('');
}

function filterTable(area) { renderTable(currentRecs, area||'all'); }

let toastTimer;
function showToast(msg, type='info') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type}`;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}
