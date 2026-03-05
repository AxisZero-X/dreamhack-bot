# 수강률 기반 목표 달성 기능

## 개요
드림핵 자동 수강 봇에 수강률 기반 목표 달성 기능이 추가되었습니다. 이 기능을 통해 사용자는 실행 시점에 원하는 수강률 목표(예: 70%)를 설정할 수 있으며, 봇은 해당 목표에 도달하면 자동으로 종료됩니다.

## 기능 설명

### 1. 대화형 목표 설정
- 봇 실행 시 사용자로부터 목표 수강률을 입력받습니다.
- 입력 형식: 1-100 사이의 정수 (기본값: 100%)
- 잘못된 입력은 자동으로 보정됩니다 (1-100 범위로 제한).

### 2. 실시간 수강률 모니터링
- 각 강의 완료 후 커리큘럼 페이지로 이동하여 현재 수강률을 추출합니다.
- 수강률 추출 위치: `.type-period` CSS 클래스 요소
- 추출 형식: "통합 과제 커리큘럼 / 총 368일 (D-277) / 30.9%"에서 30.9% 추출

### 3. 자동 종료 로직
- 현재 수강률이 목표 수강률 이상이면 즉시 종료합니다.
- 강의 순회 중간에 목표 달성 시 남은 강의를 건너뜁니다.

### 4. 최종 검증
- 모든 강의 순회 후 최종 수강률을 확인합니다.
- 목표 달성 여부를 명확히 보고합니다.
- 미달성 시 남은 강의 목록을 표시합니다.

## 구현 세부사항

### 주요 함수

#### `askTargetRate()`
```javascript
async function askTargetRate() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('🎯 목표 수강률을 입력하세요 (1-100, Enter=100): ', (answer) => {
      rl.close();
      const rate = parseInt(answer.trim()) || 100;
      const validRate = Math.min(100, Math.max(1, rate));
      resolve(validRate);
    });
  });
}
```

#### `getCurrentCompletionRate(page, curriculumUrl)`
```javascript
async function getCurrentCompletionRate(page, curriculumUrl) {
  await page.goto(curriculumUrl, { waitUntil: 'networkidle2' });
  await randomDelay(1000, 2000);
  
  const rate = await page.evaluate(() => {
    const periodDiv = document.querySelector('.type-period');
    if (!periodDiv) return 0;
    
    const text = periodDiv.innerText || periodDiv.textContent;
    // "통합 과제 커리큘럼 / 총 368일 (D-277) / 30.9%" 형식에서 숫자 추출
    const match = text.match(/(\d+\.?\d*)%/);
    return match ? parseFloat(match[1]) : 0;
  });
  
  console.log(`📊 현재 수강률: ${rate}%`);
  return rate;
}
```

### 통합 위치
1. **메인 함수 시작 부분**: 목표 수강률 입력 프롬프트
2. **강의 순회 루프 내**: 각 강의 완료 후 수강률 체크
3. **최종 검증 단계**: 수강률 기반 최종 결과 보고

## 사용 방법

### 기본 실행
```bash
node bot.js
```

### 실행 예시
```
🚀 드림핵 자동 수강 봇 시작...

🎯 목표 수강률을 입력하세요 (1-100, Enter=100): 70
✅ 목표 수강률: 70%

... (강의 진행 중) ...

📊 현재 수강률: 65% (목표: 70%)
▶️  [5/10] https://learn.dreamhack.io/...

... (강의 진행 중) ...

📊 현재 수강률: 72% (목표: 70%)

🎉 목표 수강률 70% 달성! (현재: 72%)
봇을 종료합니다.
```

## 에지 케이스 처리

1. **수강률 추출 실패**: `.type-period` 요소가 없으면 0% 반환
2. **잘못된 입력**: 1-100 범위 외 입력은 자동 보정
3. **빈 입력**: Enter만 누르면 기본값 100% 적용
4. **목표 초과 달성**: 100% 이상 입력 시 100%로 제한
5. **이미 완료된 강의**: 모든 강의가 완료된 상태면 즉시 종료

## 주의사항

1. **인터넷 연결**: 수강률 추출을 위해 커리큘럼 페이지 접속이 필요합니다.
2. **페이지 로딩 시간**: 수강률 확인 시 약 1-2초의 추가 딜레이가 발생합니다.
3. **HTML 구조 변경**: 드림핵 웹사이트의 HTML 구조가 변경되면 수정이 필요할 수 있습니다.

## 버전 기록

- **2024.03.06**: 초기 구현 완료
  - 대화형 목표 설정 기능 추가
  - 실시간 수강률 모니터링 구현
  - 자동 종료 로직 통합
  - 최종 검증 단계 개선

## 관련 파일

- `bot.js`: 메인 실행 파일 (수정됨)
- `config.js`: 설정 파일
- `utils.js`: 유틸리티 함수
- `docs/completion_rate_feature.md`: 이 문서