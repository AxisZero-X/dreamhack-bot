const fs = require('fs');
const path = require('path');
const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

const oldTry = `    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0];
        if (!q) return true;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');

        // 결과 관련 클래스들 (더 포괄적으로)
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const hasResultClass = main && resultClasses.some(c => main.classList.contains(c));
        const qHasResultClass = resultClasses.some(c => q.classList.contains(c));
        const anyChildHasResult = q.querySelector('.is-wrong, .is-incorrect, .is-success, .is-correct, .is-danger, .is-valid');

        // 모든 결과 상태가 해제되면 재도전 클릭 후 상태 초기화 완료된 것으로 간주
        return !hasResultClass && !qHasResultClass && !anyChildHasResult;
      }, { timeout: 8000 }, qIndex);
    } catch (e) {
      console.log('  ⚠️ 재도전 후 상태 초기화 대기 타임아웃. 강제 초기화 및 추가 대기.');
      // 강제 초기화 시도
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0];
        if (!q) return;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        if (main) {
          main.classList.remove('is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error');
        }
        q.classList.remove('is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error');
      }, qIndex);
      await randomDelay(1000, 2000); // 강제 초기화 후 안정화 대기
    }`;

const newTry = `    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0];
        if (!q) return true;
        
        // checking the retry button disappears instead of classes, it's safer
        const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null) || !(b.innerText.includes('재도전') || b.innerText.includes('다시'))) return false;
          const parentQ = b.closest('.quiz-question');
          return !parentQ || parentQ === q;
        });
        return !btn;
      }, { timeout: 4000 }, qIndex);
    } catch (e) {
      // ignore
      await randomDelay(1000, 2000);
    }`;

content = content.replace(oldTry, newTry);
fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Patched clickRetry');
