# 드림핵 로그인 URL 및 언어 설정 수정

## 변경사항 요약

### 1. 로그인 URL 수정
- **이전**: `https://dreamhack.io/login` (에러 발생)
- **이후**: `https://dreamhack.io/users/login` (정확한 엔드포인트)

### 2. 한국어 언어 설정 강화
- Chrome 브라우저 시작 시 `--lang=ko` 인자 추가
- 추가로 `--accept-lang=ko` 인자 추가
- 전체 브라우저 세션 동안 한국어를 기본 언어로 설정

### 3. 로그인 버튼 셀렉터 개선
- 다양한 로그인 버튼 셀렉터 추가
- JavaScript 기반 대체 클릭 로직 구현
- 버튼 활성화 상태 확인 로직 강화

## 수정된 파일

### 1. `utils.js`
- `launchBrowser()` 함수: `--lang=ko` 및 `--accept-lang=ko` 인자 추가
- `ensureLoggedIn()` 함수: 로그인 URL 변경 및 로그인 버튼 셀렉터 개선

### 2. `setup-login.js`
- Chrome 실행 URL 변경
- 안내 메시지 업데이트

### 3. 추가 테스트 파일
- `debug_login_page.js`: 로그인 페이지 디버깅 도구
- `test_bot_login.js`: 통합 로그인 테스트
- `test_login_fix_updated.js`: 업데이트된 로그인 로직 테스트

## 변경 상세

### utils.js 변경사항
```javascript
// launchBrowser() 함수 내 args 배열에 추가:
args: [
  // ... 기존 인자들
  '--lang=ko', // 한국어 언어 설정
  '--accept-lang=ko', // 언어 수락 설정 추가
]

// ensureLoggedIn() 함수 내 로그인 URL 변경:
await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });

// 로그인 버튼 셀렉터 개선:
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

// JavaScript 기반 대체 클릭 로직:
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const loginButton = buttons.find(btn =>
    btn.offsetParent !== null &&
    !btn.disabled &&
    !btn.classList.contains('disabled') &&
    (btn.innerText.includes('로그인') || btn.innerText.includes('Login'))
  );
  if (loginButton) {
    loginButton.click();
    return true;
  }
  return false;
});
```

### setup-login.js 변경사항
```javascript
// Chrome 실행 URL 변경:
'https://dreamhack.io/users/login',

// 안내 메시지 업데이트:
console.log('✅ Chrome 실행됨. dreamhack.io/users/login 에서 로그인하세요.');
```

### 테스트 파일
- `debug_login_page.js`: 로그인 페이지 요소 분석 및 디버깅
- `test_bot_login.js`: 통합 로그인 플로우 테스트
- `test_login_fix_updated.js`: 업데이트된 로그인 로직 검증

## 영향
1. **로그인 성공률 향상**: 올바른 로그인 엔드포인트 사용으로 에러 방지
2. **한국어 인터페이스**: 드림핵 사이트가 한국어로 표시됨
3. **사용자 경험 개선**: 한국어 사용자에게 더 친숙한 환경 제공

## 테스트 방법
1. `node setup-login.js` 실행하여 로그인 설정
2. `node bot.js` 실행하여 자동 로그인 테스트
3. 브라우저가 한국어로 표시되는지 확인

## 참고사항
- `dreamhack.io/login`은 더 이상 사용되지 않으며 에러 발생
- `dreamhack.io/users/login`이 정식 로그인 엔드포인트
- 언어 설정은 Chrome 브라우저 전체에 적용되며 세션 동안 유지됨