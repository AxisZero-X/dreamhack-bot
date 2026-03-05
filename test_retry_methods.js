const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

(async () => {
  let browser, page;
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await ensureLoggedIn(page);

    console.log('Navigating to Exam 916...');
    await page.goto('https://learn.dreamhack.io/exam/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    // Click choice
    await page.evaluate(() => {
      const q = document.querySelector('.quiz-question');
      q.querySelector('.choice').click();
    });
    await randomDelay(1000, 1000);

    // Click submit
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      btns.find(b => b.innerText.includes('확인')).click();
    });
    await randomDelay(1000, 1000);

    // Wait for wrong state
    await page.waitForFunction(() => document.querySelector('.is-wrong') !== null);
    console.log('State is now wrong. Trying different click methods for Retry...');

    const methods = [
      "DOM click()",
      "dispatchEvent MouseEvent",
      "Puppeteer elementHandle.click()",
      "Ghost-cursor click"
    ];

    for (let i = 0; i < methods.length; i++) {
      console.log(`\nTesting method: ${methods[i]}`);
      
      let cleared = false;
      if (i === 0) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
          const retry = btns.find(b => b.innerText.includes('재도전'));
          if (retry) retry.click();
        });
      } else if (i === 1) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
          const retry = btns.find(b => b.innerText.includes('재도전'));
          if (retry) retry.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
        });
      } else if (i === 2) {
        // Find selector for retry button
        const retryHandle = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전'));
        });
        const el = retryHandle.asElement();
        if (el) {
           await el.click();
           await retryHandle.dispose();
        }
      } else if (i === 3) {
         const { createCursor } = require('ghost-cursor');
         const cursor = createCursor(page);
         const retryHandle = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전'));
        });
        const el = retryHandle.asElement();
        if (el) {
           await cursor.click(el);
           await retryHandle.dispose();
        }
      }
      
      await randomDelay(1000, 2000);
      const isWrong = await page.evaluate(() => !!document.querySelector('.is-wrong'));
      console.log(`Is still wrong? ${isWrong}`);
      
      if (!isWrong) {
         console.log('Method worked! Exiting loop.');
         break;
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();
