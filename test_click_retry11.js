const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await ensureLoggedIn(page);
  
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 3000);

  const wrongText = 'push 0x4';
  
  await page.evaluate((t) => {
    const choices = Array.from(document.querySelectorAll('.choice'));
    const el = choices.find(c => c.innerText.trim() === t);
    if(el) { el.scrollIntoView({block: 'center'}); el.click(); }
  }, wrongText);
  await randomDelay(1000);

  // Click confirm
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('확인') && b.offsetParent !== null);
    if(btn) { btn.scrollIntoView({block: 'center'}); btn.click(); }
  });
  await randomDelay(1000);

  console.log('Clicking Retry');
  await page.evaluate(() => {
    const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전') && b.offsetParent !== null);
    if(retryBtn) { 
        retryBtn.scrollIntoView({block: 'center'});
        retryBtn.click();
    }
  });
  await randomDelay(1000);
  
  console.log('Clicking a different choice: push 0x3');
  await page.evaluate(() => {
    const choices = Array.from(document.querySelectorAll('.choice'));
    const el = choices.find(c => c.innerText.trim() === 'push 0x3');
    if(el) { el.scrollIntoView({block: 'center'}); el.click(); }
  });
  await randomDelay(1000);

  const state = await page.evaluate(() => {
    const q = document.querySelector('.quiz-question');
    const isWrong = q.querySelector('.is-wrong') !== null;
    const isCorrect = q.querySelector('.is-correct') !== null;
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.offsetParent !== null && b.closest('.quiz-question') === q);
    
    return {
        isWrong,
        isCorrect,
        btnText: btn ? btn.innerText : null,
        btnDisabled: btn ? btn.classList.contains('disabled') || btn.classList.contains('is-disabled') : false
    };
  });
  console.log('State after clicking new choice:', state);

  if (state.btnText === '확인' && !state.btnDisabled) {
      console.log('Clicking Confirm again');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('확인') && b.offsetParent !== null && !b.classList.contains('disabled'));
        if(btn) { btn.click(); }
      });
      await randomDelay(1000);
      
      const finalState = await page.evaluate(() => {
        const q = document.querySelector('.quiz-question');
        const isWrong = q.querySelector('.is-wrong') !== null;
        const isCorrect = q.querySelector('.is-correct') !== null;
        return { isWrong, isCorrect };
      });
      console.log('Final state:', finalState);
  }

  await browser.close();
}
run();
