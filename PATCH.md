# AptScore 최종 수정 패치

## 적용할 수정사항

### 1. HUBS 데이터에 인천 서구 및 지역 업무지구 추가

**위치**: line 4009 (const HUBS 배열)

**추가할 코드** (기존 인천 섹션 뒤에):
```javascript
  // ── 인천 ──
  {n:'인천시청',  la:37.4563,lo:126.7052, region:'인천', gu:'남동구'},
  {n:'인천송도',  la:37.3825,lo:126.6566, region:'인천', gu:'연수구'},
  {n:'인천구월',  la:37.4558,lo:126.6996, region:'인천', gu:'남동구'},
  {n:'검단신도시',la:37.6130,lo:126.6749, region:'인천', gu:'서구'},
  {n:'인천서구청',la:37.5456,lo:126.6761, region:'인천', gu:'서구'},
  {n:'청라국제도시',la:37.5397,lo:126.6444, region:'인천', gu:'서구'},
  {n:'부평역',    la:37.4888,lo:126.7222, region:'인천', gu:'부평구'},
  {n:'간석역',    la:37.4683,lo:126.7023, region:'인천', gu:'남동구'},
```

### 2. 검색 속도 개선 - 실거래가 API 타임아웃 단축

**위치**: line 4669 (fetchMolit 함수 내)

**변경 전**:
```javascript
const timeouts = WORKERS_URL ? [6000] : [3000, 4000];
```

**변경 후**:
```javascript
const timeouts = WORKERS_URL ? [3000] : [2000, 2500];  // 타임아웃 단축
```

**추가 수정** - line 4790:
```javascript
await sleep(50);  // 100ms → 50ms로 단축
```

### 3. 주소 정보 상세화

**위치**: line 4741 근처 (render 함수)

**변경 전**:
```javascript
document.getElementById('r-addr').innerHTML =
  `<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:4px;">${R.addr}</div>` +
```

**변경 후**:
```javascript
const fullAddr = currentApt ? 
  `${currentApt.city} ${currentApt.gu} ${currentApt.dong} ${currentApt.jibun || ''}`.trim() : 
  R.addr;
document.getElementById('r-addr').innerHTML =
  `<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:4px;">${fullAddr}</div>` +
```

### 4. 배틀 UI 가로형으로 변경

**위치**: line 6120 근처 (renderBattleResult 함수)

**Canvas 크기 변경**:
```javascript
// 변경 전
const W=800, H=460;

// 변경 후  
const W=1000, H=350;  // 가로로 더 넓게, 세로는 짧게
```

**레이아웃 조정** - drawSide 함수 수정:
```javascript
function drawSide(R, side, x) {
  const gc = GRADE_COLORS[R.grade]||'#888';
  const col = side==='A'?'#f87171':'#60a5fa';
  const isWin = winner===side;
  
  // 이름 (더 컴팩트하게)
  ctx.fillStyle=col; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
  ctx.fillText(side==='A'?'🔴 단지 A':'🔵 단지 B', x, 70);
  ctx.fillStyle=isWin?'#fff':'rgba(255,255,255,.85)';
  ctx.font=`bold 16px sans-serif`;
  const maxW = 280;
  let name = R.name;
  while(ctx.measureText(name).width > maxW && name.length>4) name=name.slice(0,-1)+'…';
  ctx.fillText(name, x, 92);
  
  // 점수 (크기 줄임)
  ctx.fillStyle=gc; ctx.font=`900 52px sans-serif`;
  ctx.fillText(String(R.total), x, 150);
  ctx.font='bold 16px sans-serif'; ctx.fillStyle=gc;
  ctx.fillText(R.grade+'등급', x, 175);
  
  // 항목 (가로로 배치)
  const keys = Object.keys(SCORE_META);
  const startY = 210;
  const itemHeight = 20;
  keys.forEach((k,i) => {
    const sc = R.scores[k]||0;
    const ky = startY + i*itemHeight;
    
    // 라벨
    ctx.fillStyle='rgba(255,255,255,.35)'; 
    ctx.font='10px sans-serif'; 
    ctx.textAlign='left';
    ctx.fillText(SCORE_META[k].lbl, x-120, ky);
    
    // 바
    const bW=80, bH=4, bX=x-30, bY=ky-6;
    ctx.fillStyle='rgba(255,255,255,.08)'; 
    ctx.beginPath();
    ctx.roundRect?ctx.roundRect(bX,bY,bW,bH,2):ctx.rect(bX,bY,bW,bH);
    ctx.fill();
    const fc=sc>=70?'#22c55e':sc>=50?'#f59e0b':'#ef4444';
    ctx.fillStyle=fc; 
    ctx.beginPath();
    const fw=bW*(sc/100);
    ctx.roundRect?ctx.roundRect(bX,bY,fw,bH,2):ctx.rect(bX,bY,fw,bH);
    ctx.fill();
    
    // 점수
    ctx.fillStyle='rgba(255,255,255,.6)'; 
    ctx.textAlign='right';
    ctx.font='10px sans-serif';
    ctx.fillText(String(sc), x+65, ky);
  });
  
  // 승자 크라운
  if(isWin){
    ctx.fillStyle='rgba(251,191,36,.2)';
    ctx.strokeStyle='rgba(251,191,36,.5)'; ctx.lineWidth=2;
    ctx.beginPath(); 
    ctx.roundRect?ctx.roundRect(x-80,50,160,18,9):ctx.rect(x-80,50,160,18);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fbbf24'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center';
    ctx.fillText('🏆 승리!', x, 62);
  }
}

// 포지션 변경
drawSide(rA,'A',230);   // 변경: 180 → 230
drawSide(rB,'B',770);   // 변경: 620 → 770
```

### 5. 점수 일치화 재확인

**estimateGrade 함수가 이미 수정되어 있는지 확인** (line 5331):

```javascript
function estimateGrade(a) {
  if (!a) return 'D';
  const addr = a.a || '';
  const gu = a.gu || '';
  const dong = a.dong || '';
  
  // 1. 지역선호도 (반드시 LOCATION_PREFERENCE 사용)
  let p1 = 70;
  for (let region in LOCATION_PREFERENCE) {
    if (dong && dong.includes(region)) {
      p1 = LOCATION_PREFERENCE[region];
      break;
    }
  }
  if (p1 === 70) {
    for (let region in LOCATION_PREFERENCE) {
      if (gu && gu.includes(region)) {
        p1 = LOCATION_PREFERENCE[region];
        break;
      }
    }
  }
  // ... 나머지 로직
  
  // 가중 합산 (반드시 이 공식 사용)
  const total = Math.round((p1*20 + p2*20 + p3*15 + p4*15 + p5*10 + p6*10 + p7*10) / 100 * 10) / 10;
  
  return total >= 80 ? 'S' : total >= 70 ? 'A' : total >= 60 ? 'B' : total >= 50 ? 'C' : 'D';
}
```

## 파일 크기 문제로 전체 파일 재생성이 어려움

index.html 파일이 6900+ 라인으로 너무 크기 때문에, 위 패치를 수동으로 적용해야 합니다.

### 자동 패치 적용 방법:

1. index.html 파일을 텍스트 에디터로 열기
2. 위의 각 섹션에서 "위치" 라인 번호로 이동
3. "변경 전" 코드를 찾아서 "변경 후" 코드로 교체
4. 파일 저장

### 또는:

새로운 간소화 버전을 만들어서 핵심 기능만 포함시키겠습니다.
