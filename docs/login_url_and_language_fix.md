# 드림핵 로그인 URL 및 언어 설정 수정

## 변경사항 요약

### 1. 로그인 URL 수정
- **이전**: `https://dreamhack.io/login` (에러 발생)
- **이후**: `https://dreamhack.io/users/login` (정확한 엔드포인트)

### 2. 한국어 언어 설정 추가
- Chrome 브라우저 시작 시 `--lang=ko` 인자 추가
- 전체 브라우저 세션 동안 한국어를 기본 언어로 설정

## 수정된 파일

### 1. `utils.js`
- `launchBrowser()` 함수: `--lang=ko` 인자 추가
- `ensureLoggedIn()` 함수: 로그인 URL 변경

### 2. `setup-login.js`
- Chrome 실행 URL 변경
- 안내 메시지 업데이트

## 변경 상세

### utils.js 변경사항
```javascript
// launchBrowser() 함수 내 args 배열에 추가:
args: [
  // ... 기존 인자들
  '--lang=ko', // 한국어 언어 설정
]

// ensureLoggedIn() 함수 내 로그인 URL 변경:
await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
```

### setup-login.js 변경사항
```javascript
// Chrome 실행 URL 변경:
'https://dreamhack.io/users/login',

// 안내 메시지 업데이트:
console.log('✅ Chrome 실행됨. dreamhack.io/users/login 에서 로그인하세요.');
```

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