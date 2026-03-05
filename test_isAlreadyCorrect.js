require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function run() {
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

    for(let i=0; i<qs.length; i++) {
        const flags = await page.evaluate((idx) => {
            const q = document.querySelectorAll('.quiz-question')[idx];
            if (!q) return null;
            return {
                idx,
                classList: Array.from(q.classList).join(' '),
                hasIsSuccess: q.querySelector('.is-success') !== null,
                hasCheckIcon: q.querySelector('.check-icon') !== null,
                isCorrectClass: q.classList.contains('is-success'),
                visible: q.offsetParent !== null
            };
        }, i);
        console.log(flags);
    }
  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}
run();
