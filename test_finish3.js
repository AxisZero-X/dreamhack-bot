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

    // Let's see the overall DOM structure for the completion state
    const html = await page.evaluate(() => {
      // Find the last question container or the wrapper for the final state
      return document.querySelector('.quiz-container, .quiz-question').parentNode.innerHTML.slice(0, 1000);
    });
    console.log("Quiz parent HTML start:", html);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testFinishQuiz();
