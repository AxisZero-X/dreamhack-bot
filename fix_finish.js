const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// 1. handleCorrect 안에서 '수강중인 커리큘럼' 버튼이나 '완료하기' 등의 버튼을 완료 조건으로 추가
const oldHandleCorrectKeywords = "const nextKeywords = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue'];";
const newHandleCorrectKeywords = "const nextKeywords = ['다음 문제', '다음', '완료하기', '계속', 'Next', 'Continue'];";
content = content.replace(oldHandleCorrectKeywords, newHandleCorrectKeywords);

// 2. finishQuiz를 호출할 필요가 없는 경우를 위해 isQuiz 블록에서 finishQuiz 에러 무시 처리 및 수강 완료 확인 개선
const oldFinishQuizBtnText = "const submitKeywords = ['제출', '완료', '결과', 'Finish', 'Submit', 'Done'];";
const newFinishQuizBtnText = "const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done'];"; // '완료' 제거하여 퀴즈 내부의 완료하기를 실수로 클릭하지 않도록
content = content.replace(oldFinishQuizBtnText, newFinishQuizBtnText);

// 3. Curriculum Page Validation logic - retry check
const oldCheck = `const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          if (hasStart || hasResume) urls.push(a.href);`;
const newCheck = `const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          // 100% 진행률인 경우 무시
          if ((hasStart || hasResume) && progressText !== '100%') urls.push(a.href);`;
content = content.replace(oldCheck, newCheck);

// 4. examUrl validation logic
const oldExamCheck = `const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          if (hasStart || hasResume) {
            return a.href;`;
const newExamCheck = `const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          if ((hasStart || hasResume) && progressText !== '100%') {
            return a.href;`;
content = content.replace(oldExamCheck, newExamCheck);

fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Patched bot.js');
