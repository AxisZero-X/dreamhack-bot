require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');
const { createCursor } = require('ghost-cursor');

async function testFinishQuiz() {
  let browser, page, cursor;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());
    cursor = createCursor(page);

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    console.log('🔍 현재 화면의 모든 버튼 목록 출력:');
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button'));
      const visibleBtns = btns.filter(b => b.offsetParent !== null && b.innerText.trim().length > 0);
      return visibleBtns.map(b => ({
        tag: b.tagName,
        className: b.className,
        text: b.innerText.trim().replace(/\n/g, ' ')
      }));
    });
    
    console.table(buttons);

    console.log('테스트 끝. 브라우저는 수동으로 닫으세요.');
  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testFinishQuiz();
