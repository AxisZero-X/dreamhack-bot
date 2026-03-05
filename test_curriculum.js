require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function checkCurriculum() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 커리큘럼 916 페이지로 이동합니다...');
    await page.goto('https://dreamhack.io/euser/curriculums/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const items = await page.evaluate(() => {
        const itemSel = '.curriculum-item, .curriculum-lecture-item, .list-item'; // adjust if needed
        const els = document.querySelectorAll('.curriculum-lecture-item'); // Assuming this class
        return Array.from(els).map(el => {
            const title = el.querySelector('.lecture-title, .title, .name')?.innerText.trim() || 'Unknown';
            const actionText = el.querySelector('.action-text')?.innerText.trim() || 'No action';
            const actionClass = el.querySelector('.action-text')?.className || '';
            const link = el.querySelector('a')?.href || 'No link';
            const progress = el.querySelector('.progress-text, .progress')?.innerText.trim() || '';
            const isCompleted = el.querySelector('.completed') !== null || actionText === '다시 보기' || actionText === '수료 완료';
            return { title, actionText, actionClass, link, progress, isCompleted };
        });
    });
    
    console.table(items);

    const examItems = await page.evaluate(() => {
        const els = document.querySelectorAll('.exam-item, .curriculum-exam-item, .list-item');
        return Array.from(els).map(el => {
            const title = el.querySelector('.title, .name')?.innerText.trim() || 'Unknown';
            const actionText = el.querySelector('.action-text, .btn')?.innerText.trim() || 'No action';
            const link = el.querySelector('a')?.href || 'No link';
            return { title, actionText, link, html: el.innerHTML.substring(0, 100) };
        });
    });
    console.log("Exam items:");
    console.table(examItems);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

checkCurriculum();
