require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testSolveQuiz() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    console.log("clicking 완료하기 if exists...");
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, .btn')).find(b => b.innerText.includes('완료'));
      if (btn) {
          btn.click();
          return true;
      }
      return false;
    });

    if (clicked) {
        console.log("Clicked 완료하기. waiting 3s...");
        await randomDelay(3000, 3000);
    } else {
        console.log("완료하기 button not found!");
    }

    const finalState = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a, .btn, .el-button')).filter(b => b.offsetParent !== null && b.innerText.trim().length > 0);
      return allBtns.map(b => ({ tag: b.tagName, className: b.className, text: b.innerText.trim().replace(/\n/g, ' ') }));
    });
    console.table(finalState);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testSolveQuiz();
