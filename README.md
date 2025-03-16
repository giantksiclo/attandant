# 샤인치과 출결관리 시스템

모바일 앱처럼 사용할 수 있는 출결관리 웹 애플리케이션입니다.

## 기능

- **모바일 앱 경험**: 홈 화면에 설치하여 네이티브 앱처럼 사용 가능
- **출퇴근 기록**: 출근, 퇴근, 시간외근무 종료 기록 관리
- **오프라인 지원**: 인터넷 연결 없이도 기본 기능 사용 가능
- **푸시 알림**: 알림을 통한 출퇴근 시간 리마인더 (구현 예정)

## 설치 방법

### 웹 브라우저에서 사용

1. URL에 접속합니다.
2. 로그인 화면에서 이메일과 비밀번호를 입력하여 로그인합니다.
3. 대시보드에서 출근, 퇴근, 시간외근무 종료 버튼을 이용하여 기록합니다.

### 모바일 앱으로 설치 (iOS)

1. Safari 브라우저로 URL에 접속합니다.
2. 하단 메뉴에서 "공유" 버튼을 탭합니다.
3. "홈 화면에 추가"를 선택합니다.
4. 이름을 확인하고 "추가"를 탭합니다.
5. 홈 화면에서 앱 아이콘을 찾아 실행합니다.

### 모바일 앱으로 설치 (Android)

1. Chrome 브라우저로 URL에 접속합니다.
2. 상단 우측 메뉴(⋮)를 탭합니다.
3. "앱 설치" 또는 "홈 화면에 추가"를 선택합니다.
4. 화면의 안내에 따라 설치를 완료합니다.
5. 홈 화면에서 앱 아이콘을 찾아 실행합니다.

## 사용 팁

- **자동 출근 알림**: 회사 위치 근처에 도착하면 자동으로 출근 알림을 받을 수 있습니다. (구현 예정)
- **오프라인 모드**: 인터넷 연결이 불안정한 환경에서도 기록이 가능합니다. 연결이 복구되면 자동으로 동기화됩니다.
- **배터리 최적화**: 백그라운드에서 동작 시 배터리 소모를 최소화하도록 설계되었습니다.

## 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 미리보기
npm run preview
```

## 기술 스택

- React + TypeScript
- Vite
- Supabase (인증 및 데이터베이스)
- Tailwind CSS
- PWA (Progressive Web App)

## 배포 정보

이 프로젝트는 Vercel을 통해 배포됩니다. 배포 시 `react-qr-reader` 라이브러리와 React 18 사이의 의존성 충돌을 해결하기 위해 다음과 같은 설정이 적용되었습니다:

1. `package.json`의 build 스크립트에 `--legacy-peer-deps` 옵션 추가
2. 프로젝트 루트에 `.npmrc` 파일 추가 (`legacy-peer-deps=true` 설정)
3. Vercel 대시보드에서 Install Command를 `npm install --legacy-peer-deps`로 수정

> **중요**: Vercel 대시보드에서 Build Command가 올바르게 설정되어 있는지 확인하세요. 잘못된 문법(예: 끝에 쉼표가 있는 경우)이 포함되어 있으면 배포가 실패할 수 있습니다. 올바른 설정은 `npm run build` 또는 `npm install --legacy-peer-deps && vite build` 입니다.
