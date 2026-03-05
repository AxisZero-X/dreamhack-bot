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

  const dump = await page.evaluate(() => {
    const q = Array.from(document.querySelectorAll('.quiz-question')).find(el => el.offsetParent !== null);
    const btns = Array.from(document.querySelectorAll('button, .btn, a')).filter(b => {
        return b.offsetParent !== null && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
    });
    
    return {
        isWrong: q ? q.querySelector('.is-wrong') !== null : null,
        btns: btns.map(b => ({
            tag: b.tagName,
            text: b.innerText,
            classes: b.className,
            html: b.outerHTML.substring(0, 100)
        }))
    };
  });
  console.log(JSON.stringify(dump, null, 2));

  await browser.close();
}
run();
