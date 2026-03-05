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

    const questions = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.quiz-question')).map(q => {
        const btn = q.querySelector('.btn.btn-primary');
        return {
          visible: q.offsetParent !== null,
          btnText: btn ? btn.innerText.trim() : null,
          btnDisabled: btn ? btn.classList.contains('disabled') : false,
          isCorrect: !!q.querySelector('.is-correct'),
          isWrong: !!q.querySelector('.is-wrong'),
          content: q.querySelector('.content') ? q.querySelector('.content').innerText.trim().slice(0, 30) : ''
        };
      });
    });
    console.log("Questions state:");
    console.table(questions);

    const mainButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => b.innerText.trim());
    });
    console.log("Visible buttons:", mainButtons);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testFinishQuiz();
