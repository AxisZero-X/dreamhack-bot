require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function dump() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);
    await page.goto('https://dreamhack.io/euser/curriculums/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const html = await page.evaluate(() => {
        const entity = document.querySelector('.entity'); // from config.js SELECTORS.LECTURE_ITEM
        return entity ? entity.outerHTML : 'No .entity found';
    });
    
    require('fs').writeFileSync('curriculum_dump.html', html);
    console.log('Dumped to curriculum_dump.html');
  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}
dump();
