require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testCompletedQuiz() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const buttons = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a, .btn, .el-button')).filter(b => b.offsetParent !== null && b.innerText.trim().length > 0);
      return allBtns.map(b => ({ tag: b.tagName, className: b.className, text: b.innerText.trim().replace(/\n/g, ' ') }));
    });
    console.table(buttons);

    // Let's also check if there is any '진행하기' or '다음 주제로' in the whole document body
    const hasProceed = await page.evaluate(() => document.body.innerText.includes('진행하기'));
    const hasNextTopic = await page.evaluate(() => document.body.innerText.includes('다음 주제로'));
    console.log("has 진행하기:", hasProceed);
    console.log("has 다음 주제로:", hasNextTopic);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testCompletedQuiz();
