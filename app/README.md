# 강그린 웹소설 아카이브

작가 강그린의 웹소설을 독자에게 선보이는 웹사이트입니다.
**빌드 도구 없는 정적 사이트 + 서버리스 관리자 백엔드**로, GitHub + Cloudflare Pages 조합으로 **완전 무료**로 운영합니다.

- 독자용 홈페이지: 루트의 **`index.html`**
- 관리자 페이지(아이디/비밀번호 로그인): 루트의 **`admin.html`**
- 관리자 백엔드(로그인·업로드 처리): 루트의 **`functions/`** (Cloudflare가 자동 실행)
- 그 외 모든 코드·콘텐츠·데이터: **`app/` 폴더 한 곳**에 모여 있어, 나중에 통째로 관리·교체하기 쉽습니다.

> 동작 원리: 관리자 페이지에 **로그인 → 원고·표지를 드래그 업로드**하면, 백엔드가 원고와 함께 **목록·검색·사이트맵까지 한 번에 GitHub에 커밋** → Cloudflare Pages가 자동 재배포합니다. **로그인해서 올리기만 하면 홈페이지에 자동 반영됩니다.** (별도의 GitHub Action이나 숨김 폴더 설정이 필요 없습니다. GitHub 토큰은 서버에만 있고 브라우저로 오지 않습니다.)

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
├── admin.html               ← 관리자 페이지 (루트)
├── functions/
│   └── api/[[path]].js      ← 관리자 백엔드 (로그인·업로드·삭제 + 목록 자동 생성)
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

> 루트에는 진입 페이지(`index.html`, `admin.html`)와, 반드시 루트에 있어야 하는 관리자 백엔드 폴더(`functions/`)만 있습니다. 그 외 모든 것은 **`app/`** 안에 있어 나중에 폴더째 백업·교체할 수 있습니다.
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

브라우저에서 `http://localhost:3000` 접속. 독자용 페이지를 미리 볼 수 있습니다.

목록만 다시 만들려면 `app` 폴더에서 `npm run build`.

> ⚠️ HTML을 `file://` 로 직접 열면 데이터가 로드되지 않습니다. 위 서버로 열거나 배포 후 확인하세요.
>
> ℹ️ **관리자 로그인/업로드는 백엔드(`functions/`)가 필요**하므로 위 단순 서버에서는 동작하지 않습니다. 배포된 사이트에서 확인하거나, 로컬에서 테스트하려면 `npx wrangler pages dev .`(저장소 루트에서) 로 실행하세요.

---

## 3. GitHub에 업로드하기

1. GitHub 로그인 → 오른쪽 위 **`+`** → **New repository** → 이름 입력 → **Create repository**
2. GitHub 웹의 **Add file → Upload files** 로 이 프로젝트의 **모든 파일과 폴더(`index.html`, `admin.html`, `app`, `functions`)를 통째로 드래그** → **Commit changes**
   - 숨김 폴더 걱정 없이 그냥 올리면 됩니다. (자동 인덱싱은 `functions/` 백엔드가 처리하므로 `.github` 같은 숨김 폴더가 필요 없습니다.)
3. Git 명령어에 익숙하다면 `git init && git add -A && git commit && git push` 로 올려도 됩니다.

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

> `functions/` 폴더는 Cloudflare Pages가 자동으로 인식해 관리자 백엔드(`/api/*`)로 배포합니다. 별도 설정이 필요 없습니다.

### 관리자 기능을 위한 환경변수 설정 — 최초 1회 (중요)

관리자 로그인·업로드가 동작하려면, Cloudflare에 GitHub 정보를 **한 번만** 등록해야 합니다. (이후로는 로그인만 하면 됩니다.)

먼저 GitHub 토큰을 만듭니다:

1. GitHub → 프로필 → **Settings** → 맨 아래 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. **Repository access**: **Only select repositories** → 이 저장소 선택
3. **Repository permissions** → **Contents** → **Read and write**
4. **Generate token** → 나온 토큰(`github_pat_...`) 복사

그다음 Cloudflare Pages 프로젝트 → **Settings** → **Environment variables** → **Production** 에 아래를 추가하고 **Save**:

| 변수 이름 | 값 | 필수 |
|-----------|-----|------|
| `GITHUB_TOKEN` | 방금 복사한 토큰 (Secret로 추가 권장) | ✅ |
| `GITHUB_OWNER` | GitHub 사용자명 (예: `kanggreen`) | ✅ |
| `GITHUB_REPO` | 저장소 이름 (예: `kanggreen-webnovel`) | ✅ |
| `GITHUB_BRANCH` | `main` (기본값이라 생략 가능) | – |
| `ADMIN_USERNAME` | 로그인 아이디 (기본 `sinida`) | – |
| `ADMIN_PASSWORD` | 로그인 비밀번호 (기본 `shin6464^^`) | – |

> 변수를 추가한 뒤에는 Cloudflare **Deployments** 탭에서 **Retry deployment**(또는 다음 배포)를 한 번 해줘야 값이 적용됩니다.
>
> 아이디/비밀번호를 바꾸고 싶으면 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 변수로 덮어쓰면 됩니다. (보안을 위해 `ADMIN_PASSWORD` 는 꼭 바꾸시길 권합니다.)

### 배포 후 딱 한 번 — 실제 주소 설정 (SEO)

1. `app/site.config.json` 의 `"baseUrl"` 을 실제 주소로 변경
   ```json
   "baseUrl": "https://kanggreen-webnovel.pages.dev",
   ```
2. 저장 후 GitHub에 반영 → 자동 재배포. (사이트맵이 그 주소로 다시 생성됩니다.)
3. **사이트맵 등록:** [Google Search Console](https://search.google.com/search-console) 에 사이트를 등록하고, 사이트맵 주소로 `https://(내주소)/app/sitemap.xml` 을 제출하면 전체 작품·회차가 검색에 노출됩니다.

> 개인 도메인은 Cloudflare Pages → **Custom domains** 에서 무료로 연결할 수 있습니다.

---

## 5. 관리자 페이지 사용법 (로그인 → 업로드)

배포된 주소 뒤에 **`/admin.html`** 을 붙이면 관리자 페이지가 열립니다. (예: `https://kanggreen-webnovel.pages.dev/admin.html`)

> 4번의 환경변수 설정을 먼저 끝내야 로그인·업로드가 동작합니다.

### (1) 로그인

- 아이디 **`sinida`**, 비밀번호 **`shin6464^^`** (환경변수로 바꿨다면 그 값)으로 로그인합니다.
- 로그인하면 GitHub 사용자명·저장소·토큰 같은 걸 **입력할 필요 없이** 바로 업로드·관리 화면이 나옵니다.

### (2) 원고 업로드

1. **작품 선택** — 기존 작품을 고르거나, **➕ 새 작품 만들기** 로 제목·장르·소개 등을 입력합니다.
2. **표지 이미지 (선택)** — "이미지 선택" 으로 표지를 올리면 미리보기가 뜹니다. 새 작품이면 등록과 함께, 기존 작품이면 표지만 교체됩니다. (세로형 3:4 이미지 권장)
3. **원고 파일** — `.md`/`.txt` 원고를 **드래그하거나 클릭해서 여러 개** 올립니다.
   - 파일명의 숫자로 회차 번호가 자동 인식됩니다. (`012.md` → 12화, `3화.txt` → 3화)
   - 파일 맨 위 `# 4화 - 제목` 줄이 회차 제목이 됩니다. (본문에는 중복 표시 안 됨)
4. **업로드 실행** → 원고·표지·목록이 한 번의 커밋으로 올라갑니다. **30초~1분 뒤** Cloudflare 재배포가 끝나면 사이트에 자동 반영됩니다. (별도 설정 불필요)

### (3) 작품·회차 관리

**작품·회차 관리** 에서 작품을 펼쳐 회차별 **삭제**, 작품 **전체 삭제**(표지 포함)를 할 수 있습니다. "목록 새로고침" 으로 최신 상태를 다시 불러옵니다.

> 🔒 **보안 참고**: GitHub 토큰은 **서버(Cloudflare 환경변수)에만** 있고 브라우저로 전송되지 않습니다. 로그인 아이디/비밀번호는 서버에서 확인하므로, 비밀번호를 모르면 아무 작업도 할 수 없습니다. 저장소를 공개(public)로 둔다면 코드에 적힌 기본 비밀번호가 노출되므로, **`ADMIN_PASSWORD` 환경변수로 반드시 비밀번호를 바꾸거나 저장소를 비공개(private)로** 두세요. 더 강하게는 Cloudflare **Zero Trust → Access** 로 `admin.html` 에 이메일 인증을 추가할 수 있습니다.

---

## 6. (참고) 데이터 구조 · 파일 규칙

평소에는 **관리자 페이지에서 업로드**하면 목록까지 자동으로 만들어지므로 이 항목은 몰라도 됩니다. 아래는 내부 구조를 알고 싶을 때 참고용입니다.

> ⚠️ GitHub에서 `app/content/novels/` 에 파일을 **직접** 올리는 것도 가능하지만, 그렇게 하면 목록(index.json)이 자동 갱신되지 않아 사이트에 바로 안 보입니다. 목록 자동 생성은 **관리자 페이지 업로드**를 거쳐야 동작하니, 되도록 관리자 페이지로 올리세요.

### 원고 파일 이름 규칙
`app/content/novels/(작품폴더)/(회차파일)` 형태이며, 파일명 규칙은 다음과 같습니다.

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
A. ① 30초~1분 기다렸는지 ② Cloudflare **Deployments** 탭에서 최신 배포가 초록(성공)인지 확인하세요. 관리자에서 업로드가 "✔ 완료" 로 떴다면 GitHub 커밋까지는 끝난 것이고, 남은 건 Cloudflare 재배포(자동)뿐입니다.

**Q. 로그인은 되는데 업로드할 때 "서버 설정 누락" 또는 오류가 떠요.**
A. Cloudflare 환경변수(`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`)가 제대로 저장됐는지, 그리고 변수 추가 후 **재배포(Retry deployment)** 를 했는지 확인하세요. 토큰의 **Contents: Read and write** 권한과 **대상 저장소 선택**도 확인합니다.

**Q. 로그인이 안 돼요 ("아이디 또는 비밀번호가 올바르지 않습니다").**
A. 기본값은 아이디 `sinida` / 비밀번호 `shin6464^^` 입니다. 환경변수 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 로 바꿨다면 그 값으로 로그인하세요. 로컬 단순 서버에서는 로그인이 동작하지 않습니다(위 2번 참고).

**Q. 정말 완전 무료인가요?**
A. 네. GitHub, Cloudflare Pages(Functions 포함), GitHub Actions 모두 개인 웹소설 사이트 규모에선 무료 한도 안에서 운영됩니다.

**Q. 글자 크기·다크모드·이어보기 위치가 저장되나요?**
A. 네. 독자의 브라우저에 저장되어 다음 방문에도 유지됩니다.

**Q. 나중에 사이트를 통째로 갈아엎고 싶어요.**
A. `app/` 폴더만 교체하면 됩니다. 콘텐츠(원고)는 `app/content/` 에 있으니, 원고만 백업해 두면 디자인·코드는 자유롭게 바꿀 수 있습니다.

---

즐거운 연재 되세요! 📚
