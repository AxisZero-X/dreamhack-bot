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

    const html = await page.evaluate(() => {
      // Look for completion buttons or any wrapper at the bottom
      const footer = document.querySelector('.bottom-action') || document.querySelector('.action-container') || document.querySelector('.lecture-footer');
      if (footer) return footer.innerHTML;
      return "No specific footer found. Body length: " + document.body.innerHTML.length;
    });
    console.log("Footer HTML:", html);

    const actionTexts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.btn, a')).map(el => el.innerText.trim()).filter(t => t.length > 0);
    });
    console.log("All link/btn texts:", actionTexts);
  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testFinishQuiz();
