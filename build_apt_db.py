#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
전국 아파트 DB 자동 수집 스크립트
==================================
사용법:
  1. pip install requests pandas tqdm
  2. MOLIT_KEY에 공공데이터포털 API 키 입력
  3. python build_apt_db.py
  4. 생성된 apt_db_full.js 파일을 index.html의 APT_DB 교체에 사용

API 키 발급:
  - 공공데이터포털: https://www.data.go.kr 회원가입 → API 신청
    * "국토교통부_아파트매매 실거래자료" 검색 → 활용신청
  - 카카오 REST API: https://developers.kakao.com → 앱 생성 → REST API 키 복사
"""

import requests
import json
import time
import os
from datetime import datetime, timedelta
import urllib.parse

# ════════════════════════════════════════════
# 🔑 API 키 설정 (여기에 입력하세요)
# ════════════════════════════════════════════
MOLIT_KEY  = "여기에_공공데이터포털_API키_입력"   # 국토교통부 실거래가
KAKAO_KEY  = "여기에_카카오_REST_API키_입력"       # 카카오 지오코딩

# ════════════════════════════════════════════
# 전국 법정동 코드 (시/군/구 단위)
# ════════════════════════════════════════════
LAWD_CODES = {
    # 서울
    "서울 종로구": "11110", "서울 중구": "11140", "서울 용산구": "11170",
    "서울 성동구": "11200", "서울 광진구": "11215", "서울 동대문구": "11230",
    "서울 중랑구": "11260", "서울 성북구": "11290", "서울 강북구": "11305",
    "서울 도봉구": "11320", "서울 노원구": "11350", "서울 은평구": "11380",
    "서울 서대문구": "11410", "서울 마포구": "11440", "서울 양천구": "11470",
    "서울 강서구": "11500", "서울 구로구": "11530", "서울 금천구": "11545",
    "서울 영등포구": "11560", "서울 동작구": "11590", "서울 관악구": "11620",
    "서울 서초구": "11650", "서울 강남구": "11680", "서울 송파구": "11710",
    "서울 강동구": "11740",
    # 부산
    "부산 중구": "26110", "부산 서구": "26140", "부산 동구": "26170",
    "부산 영도구": "26200", "부산 부산진구": "26230", "부산 동래구": "26260",
    "부산 남구": "26290", "부산 북구": "26320", "부산 해운대구": "26350",
    "부산 사하구": "26380", "부산 금정구": "26410", "부산 강서구": "26440",
    "부산 연제구": "26470", "부산 수영구": "26500", "부산 사상구": "26530",
    "부산 기장군": "26710",
    # 대구
    "대구 중구": "27110", "대구 동구": "27140", "대구 서구": "27170",
    "대구 남구": "27200", "대구 북구": "27230", "대구 수성구": "27260",
    "대구 달서구": "27290", "대구 달성군": "27710",
    # 인천
    "인천 중구": "28110", "인천 동구": "28140", "인천 미추홀구": "28177",
    "인천 연수구": "28185", "인천 남동구": "28200", "인천 부평구": "28237",
    "인천 계양구": "28245", "인천 서구": "28260", "인천 강화군": "28710",
    "인천 옹진군": "28720",
    # 광주
    "광주 동구": "29110", "광주 서구": "29140", "광주 남구": "29155",
    "광주 북구": "29170", "광주 광산구": "29200",
    # 대전
    "대전 동구": "30110", "대전 중구": "30140", "대전 서구": "30170",
    "대전 유성구": "30200", "대전 대덕구": "30230",
    # 울산
    "울산 중구": "31110", "울산 남구": "31140", "울산 동구": "31170",
    "울산 북구": "31200", "울산 울주군": "31710",
    # 세종
    "세종 세종시": "36110",
    # 경기
    "경기 수원시": "41110", "경기 성남시": "41130", "경기 의정부시": "41150",
    "경기 안양시": "41170", "경기 부천시": "41190", "경기 광명시": "41210",
    "경기 평택시": "41220", "경기 동두천시": "41250", "경기 안산시": "41270",
    "경기 고양시": "41280", "경기 과천시": "41290", "경기 구리시": "41310",
    "경기 남양주시": "41360", "경기 오산시": "41370", "경기 시흥시": "41390",
    "경기 군포시": "41410", "경기 의왕시": "41430", "경기 하남시": "41450",
    "경기 용인시": "41460", "경기 파주시": "41480", "경기 이천시": "41500",
    "경기 안성시": "41550", "경기 김포시": "41570", "경기 화성시": "41590",
    "경기 광주시": "41610", "경기 양주시": "41630", "경기 포천시": "41650",
    "경기 여주시": "41670", "경기 연천군": "41800", "경기 가평군": "41820",
    "경기 양평군": "41830",
    # 강원
    "강원 춘천시": "51110", "강원 원주시": "51130", "강원 강릉시": "51150",
    "강원 동해시": "51170", "강원 태백시": "51190", "강원 속초시": "51210",
    "강원 삼척시": "51230",
    # 충북
    "충북 청주시": "43110", "충북 충주시": "43130", "충북 제천시": "43150",
    # 충남
    "충남 천안시": "44130", "충남 공주시": "44150", "충남 보령시": "44180",
    "충남 아산시": "44200", "충남 서산시": "44210",
    # 전북
    "전북 전주시": "45110", "전북 군산시": "45130", "전북 익산시": "45140",
    # 전남
    "전남 목포시": "46110", "전남 여수시": "46130", "전남 순천시": "46150",
    "전남 나주시": "46170",
    # 경북
    "경북 포항시": "47110", "경북 경주시": "47130", "경북 김천시": "47150",
    "경북 안동시": "47170", "경북 구미시": "47190",
    # 경남
    "경남 창원시": "48120", "경남 진주시": "48170", "경남 통영시": "48220",
    "경남 사천시": "48240", "경남 김해시": "48250",
    # 제주
    "제주 제주시": "50110", "제주 서귀포시": "50130",
}

# 시/도 → city 매핑
CITY_MAP = {
    "서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천",
    "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종",
    "경기": "경기", "강원": "강원도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전라북도", "전남": "전라남도", "경북": "경상북도",
    "경남": "경상남도", "제주": "제주",
}

# ════════════════════════════════════════════
# 카카오 지오코딩
# ════════════════════════════════════════════
def geocode(address: str) -> tuple:
    """주소 → (위도, 경도) 반환. 실패 시 (None, None)"""
    if not KAKAO_KEY or KAKAO_KEY.startswith("여기에"):
        return None, None
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_KEY}"}
    try:
        resp = requests.get(url, params={"query": address}, headers=headers, timeout=8)
        data = resp.json()
        if data.get("documents"):
            doc = data["documents"][0]
            return float(doc["y"]), float(doc["x"])
    except Exception as e:
        print(f"  [지오코딩 오류] {address}: {e}")
    return None, None

def geocode_keyword(keyword: str) -> tuple:
    """키워드 검색으로 좌표 반환"""
    if not KAKAO_KEY or KAKAO_KEY.startswith("여기에"):
        return None, None
    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_KEY}"}
    try:
        resp = requests.get(url, params={"query": keyword, "category_group_code": "AD5"}, headers=headers, timeout=8)
        data = resp.json()
        if data.get("documents"):
            doc = data["documents"][0]
            return float(doc["y"]), float(doc["x"])
    except Exception:
        pass
    return None, None

# ════════════════════════════════════════════
# 국토교통부 실거래가 API 수집
# ════════════════════════════════════════════
def fetch_molit_month(lawd_cd: str, deal_ymd: str) -> list:
    """
    특정 지역, 특정 월의 아파트 거래 목록 반환
    lawd_cd: 법정동코드 (5자리)
    deal_ymd: YYYYMM 형식
    """
    url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
    params = {
        "serviceKey": MOLIT_KEY,
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "numOfRows": 1000,
        "pageNo": 1,
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        from xml.etree import ElementTree as ET
        root = ET.fromstring(resp.content)
        items = []
        for item in root.iter("item"):
            d = {child.tag: (child.text or "").strip() for child in item}
            items.append(d)
        return items
    except Exception as e:
        print(f"  [MOLIT 오류] {lawd_cd}/{deal_ymd}: {e}")
        return []

def collect_all_apts() -> dict:
    """
    최근 6개월 실거래 데이터에서 아파트 단지 목록 수집
    Returns: { "단지명|주소": apt_info_dict }
    """
    apt_dict = {}
    now = datetime.now()
    months = [(now - timedelta(days=30*i)).strftime("%Y%m") for i in range(6)]

    total = len(LAWD_CODES) * len(months)
    count = 0

    print(f"\n📦 전국 {len(LAWD_CODES)}개 지역 × {len(months)}개월 = {total}회 API 호출 예정")
    print("⏱  예상 소요시간: 약 15~30분 (API 제한 고려)\n")

    for region_name, lawd_cd in LAWD_CODES.items():
        sido = region_name.split()[0]
        gu = region_name.split()[1]
        city = CITY_MAP.get(sido, sido)

        for ym in months:
            count += 1
            if count % 20 == 0:
                print(f"  진행: {count}/{total} ({count/total*100:.0f}%)")

            items = fetch_molit_month(lawd_cd, ym)
            for item in items:
                name = item.get("아파트", "").strip()
                dong = item.get("법정동", "").strip()
                jibun = item.get("지번", "").strip()
                yr_str = item.get("건축년도", "0")
                area_str = item.get("전용면적", "0")
                price_str = item.get("거래금액", "0").replace(",", "")

                if not name or len(name) < 2:
                    continue

                key = f"{name}|{region_name}"
                if key in apt_dict:
                    # 거래가 업데이트 (최신 거래 반영)
                    try:
                        p = int(price_str)
                        a = float(area_str) if area_str else 1
                        ppm = round(p / a) if a > 0 else 0
                        if ppm > apt_dict[key].get("price", 0):
                            apt_dict[key]["price"] = ppm
                    except:
                        pass
                    continue

                # 신규 단지 등록
                try:
                    yr = int(yr_str) if yr_str and yr_str.isdigit() else 2000
                    price = int(price_str) if price_str.isdigit() else 0
                    area = float(area_str) if area_str else 1
                    ppm = round(price / area) if area > 0 else 0  # 만원/㎡
                except:
                    yr, ppm = 2000, 0

                address = f"{region_name} {dong}"
                apt_dict[key] = {
                    "n": name,
                    "city": city,
                    "gu": gu,
                    "dong": dong,
                    "a": address,
                    "jibun": f"{dong} {jibun}",
                    "yr": yr,
                    "price": ppm,
                    "la": None,
                    "lo": None,
                    "st": "",
                    "sd": 9999,
                }
            time.sleep(0.2)  # API 부하 방지

    print(f"\n✅ 수집 완료: {len(apt_dict)}개 아파트 단지")
    return apt_dict

# ════════════════════════════════════════════
# 지오코딩 (좌표 추가)
# ════════════════════════════════════════════
def add_coordinates(apt_dict: dict) -> dict:
    """수집된 단지에 위도/경도 추가"""
    if KAKAO_KEY.startswith("여기에"):
        print("\n⚠️  카카오 API 키 없음 → 좌표 추가 건너뜀")
        return apt_dict

    print(f"\n🗺️  좌표 추가 시작: {len(apt_dict)}개 단지")
    no_coord = 0

    for i, (key, apt) in enumerate(apt_dict.items()):
        if i % 100 == 0:
            print(f"  지오코딩 진행: {i}/{len(apt_dict)}")

        # 1차: 단지명 + 주소로 시도
        la, lo = geocode(f"{apt['a']} {apt['n']}")
        if la is None:
            # 2차: 키워드 검색
            la, lo = geocode_keyword(f"{apt['city']} {apt['gu']} {apt['n']}")
        if la is None:
            no_coord += 1
            apt["la"] = 37.5665  # 서울시청 기본값
            apt["lo"] = 126.9780
        else:
            apt["la"] = round(la, 4)
            apt["lo"] = round(lo, 4)

        time.sleep(0.05)  # 카카오 API 속도 제한

    print(f"  좌표 실패: {no_coord}개 (기본값 사용)")
    return apt_dict

# ════════════════════════════════════════════
# JS 출력
# ════════════════════════════════════════════
def export_js(apt_dict: dict, output_path: str = "apt_db_full.js"):
    """수집된 데이터를 index.html에 바로 붙여넣을 수 있는 JS 형식으로 저장"""
    apts = list(apt_dict.values())
    apts.sort(key=lambda x: (x["city"], x["gu"], x["dong"], x["n"]))

    lines = ["const APT_DB=["]
    city_prev = None

    for apt in apts:
        if apt["city"] != city_prev:
            lines.append(f"  /* ── {apt['city']} ── */")
            city_prev = apt["city"]

        name = apt["n"].replace("'", "\\'")
        # 키워드: 정식명 + 단축명(앞 2글자 이상 단어)
        kw_set = {name}
        words = name.replace("아파트", "").split()
        if len(words) >= 2:
            kw_set.add("".join(words[:2]))
        k_str = ",".join(f"'{k}'" for k in kw_set)

        la = apt["la"] or 37.5665
        lo = apt["lo"] or 126.9780
        yr = apt["yr"] or 2000
        price = apt["price"] or 2000
        dong = (apt["dong"] or "").replace("'", "\\'")
        addr = (apt["a"] or "").replace("'", "\\'")
        city = apt["city"].replace("'", "\\'")
        gu = apt["gu"].replace("'", "\\'")
        st = (apt.get("st") or "").replace("'", "\\'")
        sd = apt.get("sd") or 9999

        lines.append(
            f"  {{k:[{k_str}],n:'{name}',city:'{city}',gu:'{gu}',"
            f"dong:'{dong}',a:'{addr}',la:{la},lo:{lo},"
            f"yr:{yr},st:'{st}',sd:{sd},price:{price}}},"
        )

    lines.append("];")
    js_content = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n✅ JS 파일 저장 완료: {output_path}")
    print(f"   아파트 수: {len(apts):,}개")
    print(f"   파일 크기: {len(js_content)/1024:.0f} KB")
    print(f"\n📋 사용법:")
    print(f"   index.html에서 'const APT_DB=[' ~ '];' 구간을")
    print(f"   이 파일의 내용으로 통째로 교체하면 됩니다.")

def export_json(apt_dict: dict, output_path: str = "apt_db_full.json"):
    """JSON 형식으로도 저장 (백업용)"""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(list(apt_dict.values()), f, ensure_ascii=False, indent=2)
    print(f"JSON 백업: {output_path} ({len(apt_dict)}개)")

# ════════════════════════════════════════════
# 메인 실행
# ════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 60)
    print("  전국 아파트 DB 수집기 — AptScore용")
    print("=" * 60)

    if MOLIT_KEY.startswith("여기에"):
        print("\n❌ MOLIT_KEY가 설정되지 않았습니다.")
        print("   스크립트 상단의 MOLIT_KEY에 API 키를 입력하세요.")
        print("\n   API 키 발급 방법:")
        print("   1. https://www.data.go.kr 접속 → 회원가입")
        print("   2. '국토교통부 아파트매매 실거래자료' 검색")
        print("   3. '활용신청' 클릭 → 승인 대기 (보통 즉시~1일)")
        print("   4. '마이페이지 > 인증키' 에서 키 복사")
        exit(1)

    # 1단계: 실거래 데이터로 단지 목록 수집
    print("\n[1단계] 국토교통부 실거래가 API로 아파트 단지 수집...")
    apt_dict = collect_all_apts()

    # 2단계: 좌표 추가
    print("\n[2단계] 카카오 API로 위도/경도 추가...")
    apt_dict = add_coordinates(apt_dict)

    # 3단계: 저장
    print("\n[3단계] 파일 저장...")
    export_js(apt_dict, "apt_db_full.js")
    export_json(apt_dict, "apt_db_full.json")

    print("\n🎉 완료!")
    print("   apt_db_full.js → index.html의 APT_DB 교체에 사용")
    print("   apt_db_full.json → 백업 및 재활용")
