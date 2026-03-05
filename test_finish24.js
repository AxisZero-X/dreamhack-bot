require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testFinishQuiz() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const qs = await page.$$('.quiz-question');
    console.log(`총 ${qs.length}문제`);

    console.log("\n모든 문제 풀이 완료. 최종 버튼 상태 확인:");
    const finalState = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a, .btn, .el-button')).filter(b => b.offsetParent !== null && b.innerText.trim().length > 0);
      return allBtns.map(b => ({ tag: b.tagName, className: b.className, text: b.innerText.trim() }));
    });
    console.table(finalState);
    
    // Test the finishQuiz logic
    const btnText = await page.evaluate(() => {
      const submitKeywords = ['제출', '완료', '결과', 'Finish', 'Submit', 'Done'];
      const btns = Array.from(document.querySelectorAll('button, .btn, .el-button, .el-button--primary, .el-button--success'));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

      const targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') &&
        !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기')
      );

      if (targetBtn) {
          // don't click for test
        // targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;
    });
    
    console.log("Found finish button text:", btnText);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testFinishQuiz();
