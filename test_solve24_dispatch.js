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

    // Click "다음 문제" via JS dispatchEvent instead of direct click, or via puppeteer .click()
    const btns = await page.$$('.btn.btn-primary');
    for (const btn of btns) {
      const text = await page.evaluate(el => el.innerText, btn);
      const visible = await page.evaluate(el => el.offsetParent !== null, btn);
      if (text.includes('다음 문제') && visible) {
        console.log('Found "다음 문제" button, clicking with puppeteer...');
        await btn.click();
        await randomDelay(2000, 3000);
        break;
      }
    }

    const currentStep = await page.evaluate(() => {
        const steps = Array.from(document.querySelectorAll('.step'));
        const current = steps.findIndex(s => s.classList.contains('is-current'));
        return current;
    });
    console.log("Current step index after click:", currentStep);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testSolveQuiz();
