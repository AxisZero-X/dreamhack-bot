# 로그인 오류 해결 문서

## 문제 상황
- **발생 일시**: 2026년 3월 6일
- **에러 메시지**: `❌ 로그인 버튼을 찾을 수 없습니다.`
- **에러 상세**: `TimeoutError: Waiting for selector \`button[type="submit"], .login-button, .el-button--primary, button:contains("로그인"), button:contains("Login"), .submit-button\` failed: Waiting failed: 5000ms exceeded`

## 원인 분석
드림핵 로그인 페이지 UI가 변경되어 기존 셀렉터가 더 이상 작동하지 않음:
1. 로그인 버튼이 `.btn-login.btn-secondary.disabled` 클래스 사용
2. 비밀번호 입력 후에만 버튼이 활성화되는 동적 동작
3. 새로운 디자인 시스템(`dh3-button`) 도입

## 해결 작업

### 1. 로그인 페이지 구조 분석
- `debug_login_page.js` 스크립트 작성
- 현재 드림핵 로그인 페이지 HTML 구조 분석
- 새로운 로그인 버튼 셀렉터 확인

### 2. utils.js 수정
**수정 파일**: `utils.js` - `ensureLoggedIn` 함수

**변경 내용**:
```javascript
// 기존 셀렉터
const loginButtonSelectors = [
  'button[type="submit"]',
  '.login-button',
  '.el-button--primary',
  'button:contains("로그인")',
  'button:contains("Login")',
  '.submit-button'
];

// 새로운 셀렉터
const loginButtonSelectors = [
  'button[type="submit"]',
  '.login-button',
  '.btn-login',
  '.btn.btn-login',
  '.dh3-button',
  '.btn-secondary',
  'button:contains("로그인")',
  'button:contains("Login")',
  '.submit-button',
  '#login-button',
  '[data-testid="login-button"]'
];
```

**추가된 기능**:
1. 버튼 활성화 대기 로직 (`waitForFunction`)
2. 타임아웃 시간 증가 (5초 → 10초)
3. JavaScript 직접 클릭 대체 방법
4. 향상된 에러 처리

### 3. 대체 로그인 방법 구현
- `improved_setup_login.js` 스크립트 작성
- 두 가지 로그인 방법 제공:
  1. Chrome 실행 후 수동 로그인 (권장)
  2. 환경 변수를 사용한 자동 로그인

### 4. 테스트 스크립트
1. `test_login_fix_updated.js` - 기본 로그인 테스트
2. `test_bot_login.js` - bot.js와 동일한 방식으로 테스트

## 테스트 결과
- ✅ JavaScript로 로그인 버튼 클릭 성공
- ✅ 로그인 완료 확인
- ✅ 커리큘럼 페이지 접속 성공

## 사용 방법

### 방법 1: 직접 실행
```bash
node bot.js
```

### 방법 2: 로그인 설정 후 실행
```bash
# 로그인 설정
node improved_setup_login.js

# 봇 실행
node bot.js
```

### 방법 3: 환경 변수 설정
`.env` 파일에 추가:
```env
DREAMHACK_EMAIL=your_email@example.com
DREAMHACK_PASSWORD=your_password
```

## 주의사항
1. 드림핵 로그인 페이지는 자주 변경될 수 있음
2. 셀렉터는 주기적으로 업데이트 필요
3. JavaScript 직접 클릭 방법은 안전망으로 유지

## 향후 개선사항
1. 셀렉터 자동 감지 기능
2. 로그인 상태 모니터링
3. 에러 자동 복구 메커니즘

## 관련 파일
- `utils.js` - 수정된 로그인 함수
- `debug_login_page.js` - 디버깅 스크립트
- `improved_setup_login.js` - 로그인 설정 스크립트
- `test_login_fix_updated.js` - 테스트 스크립트
- `test_bot_login.js` - bot.js 호환성 테스트