require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function dumpCurriculum() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 커리큘럼 916 페이지로 이동합니다...');
    await page.goto('https://dreamhack.io/euser/curriculums/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const result = await page.evaluate(() => {
        const listItems = Array.from(document.querySelectorAll('.list-item'));
        return listItems.map(item => {
            const title = item.querySelector('.title, .name')?.innerText.trim();
            const actionText = item.querySelector('.action-text')?.innerText.trim();
            const actionClass = item.querySelector('.action-text')?.className;
            const link = item.querySelector('a')?.href;
            const progressText = item.querySelector('.progress-text, .progress')?.innerText.trim();
            return { title, actionText, actionClass, link, progressText };
        });
    });
    
    console.table(result);
  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

dumpCurriculum();
