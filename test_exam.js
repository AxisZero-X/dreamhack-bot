require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testExam() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 커리큘럼 916 페이지로 이동합니다...');
    await page.goto('https://dreamhack.io/euser/curriculums/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const examUrls = await page.evaluate(() => {
        const urls = [];
        const items = document.querySelectorAll('.entity');
        items.forEach(item => {
          const titleEl = item.querySelector('.title');
          if (titleEl && (titleEl.innerText.includes('수료 퀴즈') || titleEl.innerText.includes('Exam'))) {
            const linkEl = item.querySelector('a');
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });
        return urls;
    });

    console.log("Found exam urls:");
    console.table(examUrls);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}
testExam();
