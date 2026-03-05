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
  await randomDelay(1000, 2000);

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('확인') && b.offsetParent !== null);
    if(btn) { btn.scrollIntoView({block: 'center'}); btn.click(); }
  });
  await randomDelay(1000, 2000);

  console.log('Finding elements for Vue inspect');
      
  const clickViaGhost = await page.evaluate(() => {
    const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전') && b.offsetParent !== null);
    if(retryBtn) { 
        retryBtn.scrollIntoView({block: 'center'});
        retryBtn.click();
        return true;
    }
    return false;
  });
  await randomDelay(1000, 2000);
  
  const html = await page.evaluate(() => {
      const q = document.querySelector('.quiz-question');
      return q ? q.outerHTML : null;
  });
  require('fs').writeFileSync('q_dump.html', html || '');
  console.log('Dumped HTML to q_dump.html');

  await browser.close();
}
run();
