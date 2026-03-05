const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

(async () => {
  let browser, page;
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await ensureLoggedIn(page);

    console.log('Navigating to Quiz 24...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const data = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const qStates = qs.map(q => {
        return {
          main: q.querySelector('.question-main')?.className,
          isWrong: q.classList.contains('is-wrong'),
          isCorrect: q.classList.contains('is-correct'),
          classes: q.className,
          text: q.innerText.substring(0, 50).replace(/\n/g, ' ')
        };
      });

      const btns = Array.from(document.querySelectorAll('.btn, button, a')).filter(b => b.innerText).map(b => b.innerText.trim());
      return { qStates, btns };
    });
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();
