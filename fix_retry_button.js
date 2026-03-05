const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

// The issue in the exam page seems to be that the Retry button is completely global and not inside the quiz-question element.
// In clickRetry, we had:
// const btn = ...
// const parentQ = b.closest('.quiz-question');
// return !parentQ || parentQ === q;
// Let's modify the clickRetry function to be more flexible about finding the retry button.

const newClickRetry = `async function clickRetry(page, cursor, qIndex) {
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
      console.log('  ⚠️ 재도전 후 상태 초기화 대기 타임아웃. 강제 초기화 및 추가 대기.');
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return;
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const removeClasses = (el) => {
          if (!el) return;
          resultClasses.forEach(c => el.classList.remove(c));
        };
        
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        removeClasses(main);
        removeClasses(q);
        q.querySelectorAll('*').forEach(removeClasses);
      }, qIndex);
      await randomDelay(1000, 2000);
    }
  } else {
    console.log('  ⚠️ 재도전 버튼을 찾을 수 없습니다.');
  }
}`;

// Use regex to replace the function definition
const re = /async function clickRetry\(page, cursor, qIndex\) \{[\s\S]*?(?=\n\n|\nasync |\nfunction |$)/;

// check if regex matches
// We know it ends with `    }
//   }
// }`

bot = bot.replace(/async function clickRetry\(page, cursor, qIndex\) \{[\s\S]*?^}$/m, "REPLACE_ME");
bot = bot.replace("REPLACE_ME", newClickRetry);

// Wait, the regex replacement might be tricky. Let's do it with split and join.

