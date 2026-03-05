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

    // Solve Q1 brute-force to see what happens
    console.log("Brute forcing Q1...");
    let qIndex = 0;
    
    // get choices for Q1
    const choiceCount = await page.evaluate(() => {
      const q = document.querySelectorAll('.quiz-question')[0];
      return q.querySelectorAll('.choice').length;
    });

    let correct = false;
    for (let c = 0; c < choiceCount; c++) {
      await page.evaluate((c) => {
        const q = document.querySelectorAll('.quiz-question')[0];
        const choices = q.querySelectorAll('.choice');
        choices[c].click();
      }, c);
      await randomDelay(500, 1000);
      
      await page.evaluate(() => {
        const q = document.querySelectorAll('.quiz-question')[0];
        const btn = q.querySelector('.btn.btn-primary');
        if (btn) btn.click();
      });
      await randomDelay(1000, 2000);

      // check if correct
      correct = await page.evaluate(() => {
        const q = document.querySelectorAll('.quiz-question')[0];
        const btn = q.querySelector('.btn.btn-primary');
        if (q.querySelector('.is-correct')) return true;
        if (btn && btn.innerText.includes('다음 문제')) return true;
        if (btn && btn.innerText.includes('재도전')) {
            btn.click();
            return false;
        }
        return false;
      });

      if (correct) {
        console.log("Correct at choice", c);
        break;
      }
      await randomDelay(1000, 2000);
    }

    if (correct) {
      console.log("Q1 solved! Let's check buttons.");
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null).map(b => b.innerText.trim());
      });
      console.log("Visible buttons:", buttons);

      // click '다음 문제'
      await page.evaluate(() => {
        const q = document.querySelectorAll('.quiz-question')[0];
        const btn = q.querySelector('.btn.btn-primary');
        if (btn && btn.innerText.includes('다음 문제')) btn.click();
      });
      await randomDelay(2000, 3000);
      
      console.log("Clicked next. Current buttons:");
      const buttons2 = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null).map(b => b.innerText.trim());
      });
      console.log("Visible buttons after next:", buttons2);
    }

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testSolveQuiz();
