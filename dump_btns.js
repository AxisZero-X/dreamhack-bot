const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await ensureLoggedIn(page);
  
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 3000);

  const dump = await page.evaluate(() => {
    const qs = Array.from(document.querySelectorAll('.quiz-question'));
    const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
    
    return {
        questions: qs.map(q => ({
            visible: q.offsetParent !== null,
            text: q.innerText.substring(0, 30).replace(/\n/g, ' ')
        })),
        btns: btns.map(b => {
            const parent = b.closest('.quiz-question');
            return {
                text: b.innerText,
                visible: b.offsetParent !== null,
                hasParent: !!parent,
                parentVisible: parent ? parent.offsetParent !== null : false,
                classes: b.className
            };
        })
    };
  });
  console.log(JSON.stringify(dump, null, 2));

  await browser.close();
}
run();
