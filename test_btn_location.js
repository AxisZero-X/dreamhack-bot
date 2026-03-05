require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testBtnLocation() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    // Solve Q1
    await page.evaluate(() => {
      const q = document.querySelectorAll('.quiz-question')[0];
      q.querySelectorAll('.choice')[1].click(); // Assuming choice 1 is correct for Q1 from previous run "Correct at choice 1"
    });
    await randomDelay(500, 1000);
    await page.evaluate(() => {
      const q = document.querySelectorAll('.quiz-question')[0];
      q.querySelector('.btn.btn-primary').click();
    });
    await randomDelay(2000, 3000);

    const btnInfo = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      
      return btns.map(b => {
        const parentQ = b.closest('.quiz-question');
        const parentQIndex = parentQ ? qs.indexOf(parentQ) : -1;
        return {
          text: b.innerText.trim(),
          parentIsQuiz: parentQ !== null,
          parentQuizIndex: parentQIndex
        };
      });
    });
    
    console.table(btnInfo);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testBtnLocation();
