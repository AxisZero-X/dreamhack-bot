const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');
const { createCursor } = require('ghost-cursor');

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);
  await ensureLoggedIn(page);
  
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 3000);

  const wrongText = 'push 0x4';
  
  await page.evaluate((t) => {
    const choices = Array.from(document.querySelectorAll('.choice'));
    const el = choices.find(c => c.innerText.trim() === t);
    if(el) { el.scrollIntoView({block: 'center'}); el.click(); }
  }, wrongText);
  await randomDelay(1000, 2000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    const btn = btns.find(b => b.innerText.includes('확인'));
    if(btn) { btn.scrollIntoView({block: 'center'}); btn.click(); }
  });
  await randomDelay(2000, 3000);

  console.log('Clicking Retry via cursor with center scroll');
      
  const retryHandle = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    return btns.find(b => b.innerText.includes('재도전'));
  });
  
  const retryEl = retryHandle.asElement();
  if(retryEl) {
     await page.evaluate(e => e.scrollIntoView({block: 'center'}), retryEl);
     await randomDelay(500);
     await cursor.click(retryEl);
     await randomDelay(2000, 3000);
  }
  
  let stateAfterRetry = await page.evaluate(() => {
    const q = Array.from(document.querySelectorAll('.quiz-question')).find(el => el.offsetParent !== null);
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    const retryBtn = btns.find(b => b.innerText.includes('재도전'));
    return {
        isWrong: q ? q.querySelector('.is-wrong') !== null : null,
        retryBtnExists: !!retryBtn
    };
  });
  console.log('State after Retry clicked:', stateAfterRetry);

  await browser.close();
}
run();
