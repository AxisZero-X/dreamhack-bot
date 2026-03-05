const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// There's a small syntax issue with the search-replace we just did for the 'try' block in clickRetry.
// Let's do a more precise replacement of clickRetry to ensure it's structurally sound.

const funcRegex = /async function clickRetry\(page, cursor, qIndex\) {[\s\S]*?\n}/;

const newClickRetry = `async function clickRetry(page, cursor, qIndex) {
  let isReloaded = false;
  const handle = await page.evaluateHandle((idx) => {
    const qs = Array.from(document.querySelectorAll('.quiz-question'));
    const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
      if (!(b.offsetParent !== null) || !(b.innerText.includes('재도전') || b.innerText.includes('다시'))) return false;
      const parentQ = b.closest('.quiz-question');
      return !parentQ || parentQ === q; // 현재 문제 내부 또는 전역 재도전 버튼
    });
    return btn || null;
  }, qIndex);
  const el = handle.asElement();
  if (el) {
    console.log('  🔄 재도전 버튼 클릭');
    await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);

    // 재도전 클릭 후 오답/정답 상태 클래스가 사라질 때까지 대기
    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return true;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');

        // 결과 관련 클래스들 (더 포괄적으로)
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const hasResultClass = main && resultClasses.some(c => main.classList.contains(c));
        const qHasResultClass = resultClasses.some(c => q.classList.contains(c));
        const anyChildHasResult = q.querySelector('.is-wrong, .is-incorrect, .is-success, .is-correct, .is-danger, .is-valid');

        // 버튼 텍스트가 "확인"으로 돌아왔는지도 체크하면 더 정확함
        const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('확인') || b.innerText.includes('제출'));
        });

        // "재도전" 버튼이 사라졌는지 확인
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
        });

        return (!main || !hasResultClass) && !qHasResultClass && !anyChildHasResult && !retryBtn;
      }, { timeout: 6000, polling: 500 }, qIndex);
    } catch (e) {
      console.log('  ⚠️ 재도전 버튼 타임아웃. 페이지를 강제로 새로고침하여 상태를 초기화합니다...');
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForFunction(() => document.readyState === 'complete', {timeout: 10000}).catch(()=>null);
      isReloaded = true;
    }
  }
  handle.dispose();
  
  if (isReloaded) {
      await randomDelay(2000, 3000); // 새로고침 후 대기
      return 'RELOAD_REQUIRED';
  } else {
      await randomDelay(800, 1500); // 상태 초기화 후 약간 더 긴 대기
  }
}`;

content = content.replace(funcRegex, newClickRetry);
fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Fixed clickRetry implementation completely');
