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

  if (texts.length > 0) {
    const text = texts[0];
    const handle = await page.evaluateHandle((t) => {
      const q = document.querySelector('.quiz-question');
      const choices = Array.from(q.querySelectorAll('.choice'));
      return choices.find(el => el.innerText.trim() === t);
    }, text);
    
    const el = handle.asElement();
    if (el) {
        console.log('Clicking choice:', text, 'with Puppeteer el.click()');
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await randomDelay(1000, 2000);

        const btnState = await page.evaluate(() => {
          const btn = document.querySelector('.btn.btn-primary');
          return btn ? { text: btn.innerText, disabled: btn.classList.contains('is-disabled') } : null;
        });
        console.log('Confirm btn state:', btnState);
    }
    await handle.dispose();
  }
  await browser.close();
}
run();
