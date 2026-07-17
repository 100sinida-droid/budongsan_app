# 강그린 웹소설 아카이브

작가 강그린의 웹소설을 독자에게 선보이는 웹사이트입니다.
**빌드 도구 없는 순수 HTML/CSS/JS 정적 사이트**로, GitHub + Cloudflare Pages 조합으로 **완전 무료**로 운영합니다.

- 독자용 홈페이지: 루트의 **`index.html`**
- 관리자 업로드 페이지: 루트의 **`admin.html`**
- 그 외 모든 코드·콘텐츠·데이터: **`app/` 폴더 한 곳**에 모여 있어, 나중에 통째로 관리·교체하기 쉽습니다.

> 동작 원리: 원고 파일(.md/.txt)이 `app/content/novels/` 에 올라오면 → GitHub Action이 자동으로 목록·검색·사이트맵을 생성하고 → Cloudflare Pages가 자동 재배포합니다. **파일만 올리면 홈페이지에 자동 반영됩니다.** 관리자 페이지에서 드래그로 올리거나, GitHub에 직접 올리거나 둘 다 됩니다.

---

## 목차

1. [전체 폴더 구조](#1-전체-폴더-구조)
2. [로컬 미리보기 (선택)](#2-로컬-미리보기-선택)
3. [GitHub에 업로드하기](#3-github에-업로드하기)
4. [Cloudflare Pages 연결하기](#4-cloudflare-pages-연결하기)
5. [관리자 페이지 사용법 (드래그 업로드)](#5-관리자-페이지-사용법-드래그-업로드)
6. [작품·회차 직접 관리하기 (GitHub)](#6-작품회차-직접-관리하기-github)
7. [사이트 설정 바꾸기](#7-사이트-설정-바꾸기)
8. [자주 묻는 질문 (FAQ)](#8-자주-묻는-질문-faq)

---

## 1. 전체 폴더 구조

```
kanggreen-webnovel/
├── index.html               ← 독자용 메인 페이지 (루트)
├── admin.html               ← 관리자 업로드 페이지 (루트)
├── .github/workflows/
│   └── build-index.yml      ← (숨김) 파일 올리면 자동 실행되는 GitHub Action
├── .gitignore               ← (숨김)
│
└── app/                     ← ★ 나머지 전부 (나중에 통째로 관리·교체)
    ├── novels.html          ← 작품 목록
    ├── novel.html           ← 작품 상세
    ├── read.html            ← 소설 읽기
    ├── search.html          ← 검색
    ├── 404.html             ← 없는 페이지
    ├── robots.txt           ← 검색엔진 규칙
    ├── _headers             ← Cloudflare 캐싱/보안 규칙
    ├── README.md            ← 이 문서
    ├── package.json
    ├── site.config.json     ← ★ 사이트 이름·작가소개·주소 설정
    ├── assets/
    │   ├── css/style.css     ← 전체 디자인 (다크모드 포함)
    │   ├── js/               ← common / home / novels / novel / read / search / admin
    │   ├── favicon.svg       ← 사이트 아이콘
    │   └── og-default.svg    ← SNS 공유 이미지
    ├── content/             ← ★★★ 여기에 원고를 올립니다 ★★★
    │   └── novels/
    │       ├── mirae-ai/
    │       │   ├── meta.json         ← 작품 정보
    │       │   ├── 001.md            ← 1화
    │       │   ├── 002.md
    │       │   └── 003.md
    │       └── last-necromancer/
    │           ├── meta.json
    │           ├── 001화.md          ← '001화.md' 형식도 자동 인식
    │           └── 002화.md
    ├── data/                ← (자동 생성) index.json, search.json — 손대지 마세요
    ├── sitemap.xml          ← (자동 생성) SEO 사이트맵
    └── scripts/generate.mjs ← 목록·검색·사이트맵 생성기
```

> 루트에는 두 개의 진입 페이지(`index.html`, `admin.html`)만 두었습니다. (`.github`, `.gitignore` 는 화면에 안 보이는 숨김 파일이며, GitHub Action 실행을 위해 반드시 루트에 있어야 합니다.) 그 외 모든 것은 **`app/`** 안에 있어 나중에 폴더째 백업·교체할 수 있습니다.
>
> ℹ️ **참고 (Cloudflare 특수 파일):** `_headers`(캐싱 규칙), `404.html`(커스텀 404), `robots.txt` 는 원래 사이트 최상단에 있을 때만 100% 효과를 냅니다. 지금은 깔끔한 루트를 위해 `app/` 안에 두었는데, 이 상태로도 **사이트는 정상 작동**하며 Cloudflare가 정적 파일을 자동으로 CDN 캐싱합니다. 세밀한 캐싱 규칙·커스텀 404 페이지·`/robots.txt` 자동 인식까지 켜고 싶다면, 이 세 파일만 루트로 옮기면 됩니다. (SEO는 페이지별 메타태그 + 사이트맵으로 이미 처리되며, 사이트맵은 아래 4번 방법으로 검색엔진에 직접 등록할 수 있습니다.)

---

## 2. 로컬 미리보기 (선택)

> 컴퓨터에서 먼저 보고 싶을 때만 하면 됩니다. 바로 GitHub에 올려도 됩니다.

Node.js(18 이상) 설치 후, **`app` 폴더 안에서** 실행합니다:

```bash
cd app
npm run dev      # 목록 생성 + 로컬 서버 실행 (사이트 루트 기준)
```

브라우저에서 `http://localhost:3000` 접속. 관리자 페이지는 `http://localhost:3000/admin.html`.

목록만 다시 만들려면 `app` 폴더에서 `npm run build`.

> ⚠️ HTML을 `file://` 로 직접 열면 데이터가 로드되지 않습니다. 위 서버로 열거나 배포 후 확인하세요.

---

## 3. GitHub에 업로드하기

1. GitHub 로그인 → 오른쪽 위 **`+`** → **New repository** → 이름 예: `kanggreen-webnovel` → **Create repository**
2. **명령어 방식(권장, `.github` 폴더까지 확실히 올라감)**:
   ```bash
   cd kanggreen-webnovel
   git init
   git add -A
   git commit -m "강그린 웹소설 아카이브 첫 업로드"
   git branch -M main
   git remote add origin https://github.com/(내아이디)/kanggreen-webnovel.git
   git push -u origin main
   ```
3. Git이 없다면 GitHub 웹의 **Add file → Upload files** 로 폴더를 통째로 드래그해도 됩니다.
   단, 숨김 폴더 **`.github`** 가 누락되지 않도록 주의하세요. (자동 인덱싱 기능이 이 폴더에 있습니다.)

---

## 4. Cloudflare Pages 연결하기

1. [Cloudflare 대시보드](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 연동 후 저장소(`kanggreen-webnovel`) 선택 → **Begin setup**
3. **빌드 설정 (중요)** — 이 사이트는 빌드가 필요 없습니다:

   | 항목 | 값 |
   |------|-----|
   | Framework preset | **None** |
   | Build command | **(비워두기)** |
   | Build output directory | **`/`** (또는 비워두기) |

   > 루트에 `index.html` 이 있으므로 출력 폴더는 루트(`/`) 그대로 둡니다.

4. **Save and Deploy** → `https://(프로젝트명).pages.dev` 로 사이트가 열립니다. 🎉

### 배포 후 딱 한 번 — 실제 주소 설정 (SEO)

1. `app/site.config.json` 의 `"baseUrl"` 을 실제 주소로 변경
   ```json
   "baseUrl": "https://kanggreen-webnovel.pages.dev",
   ```
2. 저장 후 GitHub에 반영 → 자동 재배포. (사이트맵이 그 주소로 다시 생성됩니다.)
3. **사이트맵 등록:** [Google Search Console](https://search.google.com/search-console) 에 사이트를 등록하고, 사이트맵 주소로 `https://(내주소)/app/sitemap.xml` 을 제출하면 전체 작품·회차가 검색에 노출됩니다.

> 개인 도메인은 Cloudflare Pages → **Custom domains** 에서 무료로 연결할 수 있습니다.

---

## 5. 관리자 페이지 사용법 (드래그 업로드)

배포된 주소 뒤에 **`/admin.html`** 을 붙이면 관리자 페이지가 열립니다. (예: `https://kanggreen-webnovel.pages.dev/admin.html`)

관리자 페이지는 **GitHub에 파일을 대신 올려주는 도구**입니다. 별도 서버가 없으므로, 여러분의 GitHub **액세스 토큰**으로 인증합니다. 토큰은 **여러분 브라우저에만 저장**되며 사이트나 외부로 전송되지 않습니다.

### (1) 액세스 토큰 만들기 — 최초 1회

1. GitHub → 오른쪽 위 프로필 → **Settings**
2. 왼쪽 맨 아래 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
3. 설정:
   - **Token name**: 아무거나 (예: `webnovel-admin`)
   - **Repository access**: **Only select repositories** → 이 저장소 선택
   - **Repository permissions** → **Contents** → **Read and write** 로 설정
4. **Generate token** → 나온 토큰(`github_pat_...`)을 복사. (한 번만 보이니 잘 보관)

### (2) 연결하기

1. 관리자 페이지 **1. GitHub 연결 설정** 에 입력:
   - GitHub 사용자명, 저장소 이름, 브랜치(`main`), 복사한 토큰
   - (개인 기기라면 "토큰 기억하기" 체크 시 다음에 다시 입력 안 해도 됩니다.)
2. **연결 테스트 & 저장** 클릭 → "연결됨" 이 뜨면 성공.

### (3) 회차 업로드

1. **2. 회차 업로드** 에서 작품 선택 (없으면 **➕ 새 작품 만들기** 로 제목·장르 등 입력)
2. 원고 파일(`004.md`, `005.md` …)을 **드래그하거나 클릭해서 여러 개 선택**
   - 파일명의 숫자로 회차 번호가 자동 인식됩니다. (`012.md` → 12화, `3화.txt` → 3화)
   - 파일 맨 위 `# 4화 - 제목` 줄이 회차 제목이 됩니다. (본문에는 중복 표시 안 됨)
3. **업로드 실행** → GitHub에 커밋됩니다. **1~2분 뒤** 자동 인덱싱·배포가 끝나면 사이트에 반영됩니다.

### (4) 작품·회차 관리

**3. 작품·회차 관리** 에서 작품을 펼쳐 회차별 **삭제**, 작품 **전체 삭제**를 할 수 있고, **GitHub 업로드 기록 보기** 로 진행 상황(Actions)을 확인할 수 있습니다.

> 🔒 **보안 참고**: 관리자 페이지 자체는 누구나 열 수 있지만, **올바른 토큰이 없으면 아무것도 할 수 없습니다.** 더 강하게 막고 싶다면 Cloudflare **Zero Trust → Access** 로 `admin.html` 경로에 이메일 인증을 무료로 걸 수 있습니다.

---

## 6. 작품·회차 직접 관리하기 (GitHub)

관리자 페이지 대신, GitHub에서 파일을 직접 다뤄도 똑같이 동작합니다.

### 새 회차 추가
`app/content/novels/(작품폴더)` 로 이동 → **Add file → Upload files** → `.md`/`.txt` 파일 드래그 → **Commit changes**.

**파일 이름 규칙**

| 파일명 | 인식 |
|--------|------|
| `001.md` | 1화 |
| `012.md` | 12화 |
| `001화.md` | 1화 |
| `25화.md` | 25화 |

**원고 예시** (`.md`)

```markdown
# 4화 - 새로운 동료

첫 문단입니다. 빈 줄로 문단을 나눕니다.

**굵게**, *기울임*, > 인용, *** (가로줄) 을 쓸 수 있습니다.
```

제목 줄을 생략하면 파일명 기준으로 자동 생성됩니다. 등록 날짜는 파일 올린 날짜로 자동 기록됩니다.

### 새 작품 추가
`app/content/novels/` 안에 새 폴더(영문 권장, 예: `dragon-king`)를 만들고 `meta.json` 을 추가:

```json
{
  "title": "용왕의 딸",
  "genre": "동양판타지",
  "status": "연재중",
  "description": "작품 소개",
  "cover": "",
  "featured": true,
  "popularity": 0,
  "order": 3
}
```

| 항목 | 설명 |
|------|------|
| `status` | `연재중` / `완결` / `휴재` |
| `cover` | 표지 이미지 경로 (비우면 제목이 표지가 됨) |
| `featured` | `true` → 메인 **대표 작품**에 표시 |
| `popularity` | 클수록 **인기 작품** 상단 (0이면 인기목록 제외) |
| `order` | 작품 목록 정렬 (작을수록 앞) |

### 수정 / 삭제
해당 `.md` 파일을 열고 연필(✏️) 아이콘으로 수정, 휴지통(🗑️)으로 삭제. 작품 삭제는 폴더 안 파일을 모두 지우면 됩니다.

---

## 7. 사이트 설정 바꾸기

`app/site.config.json` 하나만 고치면 사이트 전체에 반영됩니다. (사이트 이름, 작가 소개, 대문 문구, 대표 주소 등)
색상 테마는 `app/assets/css/style.css` 맨 위 `--brand` 값을 바꾸면 됩니다.

---

## 8. 자주 묻는 질문 (FAQ)

**Q. 파일을 올렸는데 사이트에 안 보여요.**
A. ① 1~2분 기다렸는지 ② GitHub **Actions** 탭에서 워크플로우가 초록(성공)인지 ③ 파일이 올바른 작품 폴더(`app/content/novels/...`)에 있는지 확인하세요.

**Q. 관리자 페이지에서 "연결 실패" 가 떠요.**
A. 사용자명·저장소 이름 철자, 그리고 토큰의 **Contents: Read and write** 권한과 **대상 저장소 선택**을 확인하세요. 토큰이 만료됐을 수도 있습니다.

**Q. 정말 완전 무료인가요?**
A. 네. GitHub, Cloudflare Pages, GitHub Actions 모두 개인 웹소설 사이트 규모에선 무료 한도 안에서 운영됩니다.

**Q. 글자 크기·다크모드·이어보기 위치가 저장되나요?**
A. 네. 독자의 브라우저에 저장되어 다음 방문에도 유지됩니다.

**Q. 나중에 사이트를 통째로 갈아엎고 싶어요.**
A. `app/` 폴더만 교체하면 됩니다. 콘텐츠(원고)는 `app/content/` 에 있으니, 원고만 백업해 두면 디자인·코드는 자유롭게 바꿀 수 있습니다.

---

즐거운 연재 되세요! 📚
