const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await ensureLoggedIn(page);
  
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 3000);

  const wrongText = 'push 0x4';
  
  // Click wrong choice
  await page.evaluate((t) => {
    const choices = Array.from(document.querySelectorAll('.choice'));
    const el = choices.find(c => c.innerText.trim() === t);
    if(el) { el.scrollIntoView({block: 'center'}); el.click(); }
  }, wrongText);
  await randomDelay(1000);

  // Click confirm
  await page.evaluate(() => {
    const q = document.querySelectorAll('.quiz-question')[0];
    const btn = Array.from(q.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('확인'));
    if(btn) { btn.scrollIntoView({block: 'center'}); btn.click(); }
  });
  await randomDelay(1000);

  let state = await page.evaluate(() => {
    const q = document.querySelectorAll('.quiz-question')[0];
    const retryBtn = Array.from(q.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전'));
    return {
        isWrong: q.querySelector('.is-wrong') !== null,
        retryBtnExists: !!retryBtn
    };
  });
  console.log('State after wrong answer:', state);

  if (state.retryBtnExists) {
      console.log('Clicking Retry via page.click() with selector');
      // Let's try native Puppeteer click on the selector
      const retryBtnSel = '.quiz-question:nth-child(1) .btn.btn-primary'; // assuming it changes text
      await page.waitForSelector(retryBtnSel);
      
      const retryBtnText = await page.$eval(retryBtnSel, el => el.innerText);
      console.log('Retry btn text before click:', retryBtnText);
      
      await page.click(retryBtnSel);
      await randomDelay(2000);
      
      let stateAfterRetry = await page.evaluate(() => {
        const q = document.querySelectorAll('.quiz-question')[0];
        const retryBtn = Array.from(q.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전'));
        return {
            isWrong: q.querySelector('.is-wrong') !== null,
            retryBtnExists: !!retryBtn
        };
      });
      console.log('State after native Retry clicked:', stateAfterRetry);
  }

  await browser.close();
}
run();
