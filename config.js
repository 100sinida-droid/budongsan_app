/* ═══════════════════════════════════════════════════════
   config.js  │  전역 설정 + 지역 선호도 시스템
   ═══════════════════════════════════════════════════════ */

// ── 전역 설정 (국토교통부 키만 옵션) ──────────────────────
const CONFIG = {
  molitKey: localStorage.getItem('molit_key') || '',

  save(molit) {
    this.molitKey = molit.trim();
    localStorage.setItem('molit_key', this.molitKey);
  },
  isMolitSet() { return this.molitKey.length > 10; },
};

// ── 지역 선호도 점수 데이터베이스 (100점 만점) ─────────────
const LOCATION_PREFERENCE = {
  // 서울특별시 - 강남권
  '강남구': 100, '서초구': 100, '송파구': 95, '강동구': 85,
  
  // 서울특별시 - 강서권
  '양천구': 88, '강서구': 82, '구로구': 75, '영등포구': 80, '금천구': 72,
  
  // 서울특별시 - 도심권
  '종로구': 92, '중구': 88, '용산구': 94,
  
  // 서울특별시 - 동북권
  '성동구': 86, '광진구': 84, '동대문구': 76, '중랑구': 70,
  '성북구': 78, '강북구': 68, '도봉구': 72, '노원구': 74,
  
  // 서울특별시 - 서북권
  '은평구': 76, '서대문구': 82, '마포구': 90,
  
  // 서울특별시 - 동작관악권
  '관악구': 74, '동작구': 80,
  
  // 경기도 - 주요 도시 (서울 인접)
  '성남시': 85, '분당구': 92, '수정구': 75, '중원구': 78,
  '과천시': 95, '광명시': 82, '하남시': 84,
  
  // 경기도 - 신도시
  '고양시': 80, '일산동구': 86, '일산서구': 86, '덕양구': 76,
  '용인시': 82, '수지구': 88, '기흥구': 85, '처인구': 72,
  '부천시': 78, '안양시': 80, '동안구': 83, '만안구': 77,
  
  // 경기도 - 기타
  '의왕시': 76, '군포시': 78, '안산시': 72, '시흥시': 74,
  '화성시': 75, '수원시': 80, '팔달구': 78, '영통구': 83,
  '권선구': 76, '장안구': 77, '남양주시': 74, '구리시': 78,
  '의정부시': 72, '파주시': 70, '김포시': 76,
  
  // 인천광역시
  '연수구': 82, '남동구': 78, '부평구': 76, '계양구': 74,
  '인천서구': 72, '인천중구': 70, '인천동구': 68, '미추홀구': 75,
  
  // 대전광역시
  '유성구': 80, '대전서구': 76, '대전중구': 72, '대전동구': 70, '대덕구': 74,
  
  // 대구광역시
  '수성구': 85, '달서구': 78, '대구중구': 74, '대구동구': 72,
  '대구서구': 76, '대구남구': 75, '대구북구': 73,
  
  // 부산광역시
  '해운대구': 88, '수영구': 86, '부산남구': 82, '부산진구': 80,
  '동래구': 78, '연제구': 79, '금정구': 74, '부산서구': 72,
  '부산중구': 75, '부산동구': 70, '영도구': 68, '부산북구': 72,
  '사상구': 73, '사하구': 71, '부산강서구': 76,
  
  // 광주광역시
  '광주서구': 76, '광주남구': 74, '광주동구': 70, '광주북구': 72, '광산구': 73,
  
  // 울산광역시
  '울산남구': 78, '울산중구': 75, '울산동구': 74, '울산북구': 76, '울주군': 72,
  
  // 세종특별자치시
  '세종시': 82,
  
  // 특정 지역명 매칭용
  '판교': 92, '동탄': 82, '광교': 85, '위례': 88, '송도': 88,
  '평촌': 85, '목동': 88, '잠실': 92,
};

// 지역 선호도 점수 계산 함수
function getLocationPreferenceScore(addr) {
  if (!addr || typeof addr !== 'string') return 70;
  
  // 구체적인 구/시 매칭 시도
  for (let region in LOCATION_PREFERENCE) {
    if (addr.includes(region)) {
      return LOCATION_PREFERENCE[region];
    }
  }
  
  // 서울이면 기본 80점
  if (addr.includes('서울')) return 80;
  
  // 경기도 주요 도시
  if (addr.includes('경기')) return 75;
  
  // 광역시
  const metros = ['인천', '대전', '대구', '부산', '광주', '울산'];
  for (let metro of metros) {
    if (addr.includes(metro)) return 75;
  }
  
  // 기본값
  return 70;
}

// ── 등급/색상 ──────────────────────────────────────────
const GRADE_COLOR = {
  S: '#059669', A: '#2563EB', B: '#D97706', C: '#EA580C', D: '#DC2626'
};
const GRADE_NAME  = {
  S: '최우수', A: '우수', B: '양호', C: '보통', D: '미흡'
};
const SCORE_LABEL = {
  '지역선호도':       '📍 지역선호도',
  '핵심시설접근성':   '🏙️ 핵심시설',
  '지하철버스교통':   '🚇 교통',
  '학군':             '🏫 학군',
  '편의시설':         '🏪 편의시설',
  '건물신축도':       '🏗️ 신축도',
  '㎡당가격수준':     '💰 가격수준',
};

function scoreColor(s)  { return s>=75?'#10B981': s>=55?'#F59E0B':'#EF4444'; }
function scoreBg(s)     { return s>=75?'#F0FDF4': s>=55?'#FFFBEB':'#FEF2F2'; }
function scoreBorder(s) { return s>=75?'#86EFAC': s>=55?'#FDE68A':'#FECACA'; }

function fmtPrice(man) {
  if (!man || man <= 0) return '정보없음';
  const uk = Math.floor(man / 10000), m = man % 10000;
  if (uk > 0 && m > 0) return `${uk}억 ${m.toLocaleString()}만원`;
  if (uk > 0) return `${uk}억원`;
  return `${m.toLocaleString()}만원`;
}

/* ═══════════════════════════════════════════════════════
   CHARTS  │  순수 Canvas 차트 (외부 라이브러리 없음)
   ═══════════════════════════════════════════════════════ */
const CHARTS = (() => {

  function drawRadar(canvasId, scores, grade) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2, R = Math.min(W,H)*0.34;
    const keys = Object.keys(scores);
    const vals = keys.map(k => scores[k]/100);
    const labels = keys.map(k => SCORE_LABEL[k]||k);
    const n = keys.length;
    const color = GRADE_COLOR[grade]||'#2563EB';
    const [r,g,b] = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));

    ctx.clearRect(0,0,W,H);

    // 배경 그리드
    [.25,.5,.75,1].forEach(rv => {
      ctx.beginPath();
      for (let i=0; i<n; i++) {
        const a=(i/n)*2*Math.PI - Math.PI/2;
        i===0 ? ctx.moveTo(cx+Math.cos(a)*R*rv, cy+Math.sin(a)*R*rv)
              : ctx.lineTo(cx+Math.cos(a)*R*rv, cy+Math.sin(a)*R*rv);
      }
      ctx.closePath();
      ctx.strokeStyle = rv===1?'#CBD5E1':'#E2E8F0';
      ctx.lineWidth = rv===1?1.5:1; ctx.stroke();
      if (rv<1) {
        ctx.fillStyle='#94A3B8'; ctx.font='10px Pretendard,sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(Math.round(rv*100), cx+3, cy-R*rv+3);
      }
    });

    // 축선
    for (let i=0; i<n; i++) {
      const a=(i/n)*2*Math.PI - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
      ctx.strokeStyle='#E2E8F0'; ctx.lineWidth=1; ctx.stroke();
    }

    // 데이터 폴리곤
    ctx.beginPath();
    for (let i=0; i<n; i++) {
      const a=(i/n)*2*Math.PI - Math.PI/2;
      i===0 ? ctx.moveTo(cx+Math.cos(a)*R*vals[i], cy+Math.sin(a)*R*vals[i])
            : ctx.lineTo(cx+Math.cos(a)*R*vals[i], cy+Math.sin(a)*R*vals[i]);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${r},${g},${b},0.15)`; ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.stroke();

    // 꼭짓점
    for (let i=0; i<n; i++) {
      const a=(i/n)*2*Math.PI - Math.PI/2;
      const [px,py]=[cx+Math.cos(a)*R*vals[i], cy+Math.sin(a)*R*vals[i]];
      ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2);
      ctx.fillStyle='white'; ctx.fill();
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
    }

    // 레이블
    ctx.fillStyle='#334155'; ctx.font='bold 11px Pretendard,sans-serif';
    for (let i=0; i<n; i++) {
      const a=(i/n)*2*Math.PI - Math.PI/2;
      const lx=cx+Math.cos(a)*(R+30), ly=cy+Math.sin(a)*(R+30);
      ctx.textAlign    = lx<cx-5?'right': lx>cx+5?'left':'center';
      ctx.textBaseline = ly<cy-5?'bottom': ly>cy+5?'top':'middle';
      ctx.fillText(labels[i], lx, ly);
    }
  }

  function drawPriceTrend(canvasId, recs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    const PAD={top:28,right:18,bottom:48,left:66};
    const cW=W-PAD.left-PAD.right, cH=H-PAD.top-PAD.bottom;

    ctx.clearRect(0,0,W,H);

    if (!recs||!recs.length) {
      ctx.fillStyle='#94A3B8'; ctx.font='13px Pretendard,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('실거래가 데이터 없음 (MOLIT API 키 필요)', W/2, H/2);
      return;
    }

    const monthly={};
    recs.forEach(r=>{
      const key=`${r.year}-${String(r.month).padStart(2,'0')}`;
      if(!monthly[key]) monthly[key]=[];
      if(r.area>0) monthly[key].push(r.price/r.area);
    });
    const months=Object.keys(monthly).sort();
    if (months.length<2) {
      ctx.fillStyle='#94A3B8'; ctx.font='13px Pretendard,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('데이터 부족', W/2, H/2); return;
    }
    const avgs=months.map(m=>monthly[m].reduce((a,b)=>a+b,0)/monthly[m].length);
    const cnts=months.map(m=>monthly[m].length);
    const minA=Math.min(...avgs)*0.95, maxA=Math.max(...avgs)*1.05;
    const maxC=Math.max(...cnts)||1;

    const xPos=i=>PAD.left+(i/(months.length-1))*cW;
    const yPos=v=>PAD.top+cH-((v-minA)/(maxA-minA))*cH;

    // 거래건수 바 (배경)
    months.forEach((_,i)=>{
      const bh=(cnts[i]/maxC)*cH*0.5;
      ctx.fillStyle='rgba(100,116,139,0.1)';
      ctx.fillRect(xPos(i)-12, PAD.top+cH-bh, 24, bh);
    });

    // 면적
    ctx.beginPath(); ctx.moveTo(xPos(0),yPos(avgs[0]));
    months.forEach((_,i)=>ctx.lineTo(xPos(i),yPos(avgs[i])));
    ctx.lineTo(xPos(months.length-1),PAD.top+cH); ctx.lineTo(xPos(0),PAD.top+cH);
    ctx.closePath(); ctx.fillStyle='rgba(37,99,235,0.07)'; ctx.fill();

    // 라인
    ctx.beginPath(); ctx.moveTo(xPos(0),yPos(avgs[0]));
    months.forEach((_,i)=>ctx.lineTo(xPos(i),yPos(avgs[i])));
    ctx.strokeStyle='#2563EB'; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();

    // 포인트
    months.forEach((_,i)=>{
      ctx.beginPath(); ctx.arc(xPos(i),yPos(avgs[i]),5,0,Math.PI*2);
      ctx.fillStyle='white'; ctx.fill();
      ctx.strokeStyle='#2563EB'; ctx.lineWidth=2; ctx.stroke();
    });

    // Y축
    ctx.fillStyle='#64748B'; ctx.font='11px Pretendard,sans-serif';
    ctx.textAlign='right'; ctx.textBaseline='middle';
    [0,.25,.5,.75,1].forEach(rv=>{
      const v=minA+(maxA-minA)*rv, y=yPos(v);
      ctx.fillText(Math.round(v).toLocaleString(), PAD.left-6, y);
      ctx.beginPath(); ctx.moveTo(PAD.left,y); ctx.lineTo(PAD.left+cW,y);
      ctx.strokeStyle='#F1F5F9'; ctx.lineWidth=1; ctx.stroke();
    });

    // X축
    ctx.fillStyle='#64748B'; ctx.textAlign='center'; ctx.textBaseline='top';
    months.forEach((m,i)=>ctx.fillText(m.replace('-','.'), xPos(i), PAD.top+cH+10));

    // Y 타이틀
    ctx.save(); ctx.translate(14,PAD.top+cH/2); ctx.rotate(-Math.PI/2);
    ctx.fillStyle='#94A3B8'; ctx.font='11px Pretendard,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('㎡당 평균가 (만원)',0,0); ctx.restore();
  }

  function drawHubBars(containerId, facilities) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Object.entries(facilities).filter(([,v])=>v>0);
    if (!entries.length) {
      container.innerHTML=`<div style="text-align:center;padding:32px;color:#94A3B8;font-size:13px">위치 정보 조회 중 또는 데이터 없음</div>`;
      return;
    }
    container.innerHTML = entries.sort((a,b)=>a[1]-b[1]).map(([name,dist])=>{
      const km=(dist/1000).toFixed(1);
      const pct=Math.min(100,(dist/25000)*100);
      const clr=dist<=3000?'#10B981':dist<=8000?'#F59E0B':'#EF4444';
      return `<div class="hub-item">
        <div class="hub-name">${name}</div>
        <div class="hub-bar-wrap">
          <div class="hub-bar-bg">
            <div class="hub-bar-fill" style="width:${pct}%;background:${clr}"></div>
          </div>
        </div>
        <div class="hub-dist" style="color:${clr}">${km}km</div>
      </div>`;
    }).join('');
  }

  return { drawRadar, drawPriceTrend, drawHubBars };
})();
