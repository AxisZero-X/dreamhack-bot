const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await ensureLoggedIn(page);
  
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 3000);

  const texts = await page.evaluate(() => {
    const q = document.querySelector('.quiz-question');
    const choices = Array.from(q.querySelectorAll('.choice'));
    return choices.map(el => el.innerText.trim());
  });

  // Pick a definitely wrong answer (push 0x4)
  const wrongText = texts.find(t => t.includes('0x4')) || texts[0];
  
  console.log('Clicking wrong choice:', wrongText);
  await page.evaluate((t) => {
    const choices = Array.from(document.querySelectorAll('.choice'));
    const el = choices.find(c => c.innerText.trim() === t);
    if(el) { el.scrollIntoView({block: 'center'}); el.click(); }
  }, wrongText);
  await randomDelay(1000, 2000);

  console.log('Clicking Confirm');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
    const confirmBtn = btns.find(b => b.innerText.includes('확인') && b.offsetParent !== null);
    if(confirmBtn) { confirmBtn.scrollIntoView({block: 'center'}); confirmBtn.click(); }
  });
  await randomDelay(2000, 3000);

  let state = await page.evaluate(() => {
    const q = document.querySelector('.quiz-question');
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
    const retryBtn = btns.find(b => b.innerText.includes('재도전'));
    return {
        isWrong: q.querySelector('.is-wrong') !== null,
        retryBtnExists: !!retryBtn,
        retryBtnText: retryBtn ? retryBtn.innerText : null
    };
  });
  console.log('State after wrong answer:', state);

  if (state.retryBtnExists) {
      console.log('Clicking Retry');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
        const retryBtn = btns.find(b => b.innerText.includes('재도전'));
        if(retryBtn) { retryBtn.scrollIntoView({block: 'center'}); retryBtn.click(); }
      });
      await randomDelay(2000, 3000);
      
      let stateAfterRetry = await page.evaluate(() => {
        const q = document.querySelector('.quiz-question');
        const btns = Array.from(document.querySelectorAll('.btn.btn-primary')).filter(b => b.offsetParent !== null);
        const retryBtn = btns.find(b => b.innerText.includes('재도전'));
        const confirmBtn = btns.find(b => b.innerText.includes('확인'));
        return {
            isWrong: q.querySelector('.is-wrong') !== null,
            retryBtnExists: !!retryBtn,
            confirmBtnExists: !!confirmBtn,
            confirmBtnText: confirmBtn ? confirmBtn.innerText : null
        };
      });
      console.log('State after Retry clicked:', stateAfterRetry);
  }

  await browser.close();
}
run();
