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
  await randomDelay(1000, 2000);

  // Click confirm
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    const btn = btns.find(b => b.innerText.includes('확인'));
    if(btn) { btn.scrollIntoView({block: 'center'}); btn.click(); }
  });
  await randomDelay(2000, 3000);

  let state = await page.evaluate(() => {
    const q = Array.from(document.querySelectorAll('.quiz-question')).find(el => el.offsetParent !== null);
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    const retryBtn = btns.find(b => b.innerText.includes('재도전'));
    return {
        isWrong: q.querySelector('.is-wrong') !== null,
        retryBtnExists: !!retryBtn
    };
  });
  console.log('State after wrong answer:', state);

  if (state.retryBtnExists) {
      console.log('Clicking Retry via Native click() with coordinate (since React/Vue swallows things)');
      // We will try using bounding client rect and pure puppeteer click
      const rect = await page.evaluate(() => {
         const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
         const retryBtn = btns.find(b => b.innerText.includes('재도전'));
         if(!retryBtn) return null;
         retryBtn.scrollIntoView({block: 'center'});
         const {x, y, width, height} = retryBtn.getBoundingClientRect();
         return {x, y, width, height};
      });
      console.log('Retry btn rect:', rect);
      if (rect) {
          await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
          await randomDelay(2000, 3000);
      }
      
      let stateAfterRetry = await page.evaluate(() => {
        const q = Array.from(document.querySelectorAll('.quiz-question')).find(el => el.offsetParent !== null);
        const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
        const retryBtn = btns.find(b => b.innerText.includes('재도전'));
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
