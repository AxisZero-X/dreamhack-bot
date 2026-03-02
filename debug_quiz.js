const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync } = require('child_process');
const path = require('path');

puppeteer.use(StealthPlugin());

async function debug() {
  try {
    const response = await fetch('http://127.0.0.1:9222/json');
    const targets = await response.json();
    const quizTarget = targets.find(t => t.url.includes('dreamhack.io/quiz/'));
    
    if (!quizTarget) {
      console.log('No quiz page found in targets:', targets.map(t => t.url));
      process.exit(1);
    }

    const browser = await puppeteer.connect({
      browserWSEndpoint: quizTarget.webSocketDebuggerUrl,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('dreamhack.io/quiz/'));
    
    console.log('Current URL:', page.url());
    
    const info = await page.evaluate(() => {
      const questions = document.querySelectorAll('.quiz-question');
      return Array.from(questions).map((q, i) => {
        const main = q.querySelector('.question-main');
        const feedback = q.querySelector('.feedback, .alert, .message');
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => {
            if (!b.offsetParent || !b.innerText.includes('재도전')) return false;
            const parentQ = b.closest('.quiz-question');
            return !parentQ || parentQ === q;
        });
        
        return {
          index: i,
          qClasses: q.className,
          mainClasses: main ? main.className : 'no main',
          feedbackClasses: feedback ? feedback.className : 'no feedback',
          feedbackText: feedback ? feedback.innerText.trim() : '',
          hasRetry: !!retryBtn,
          retryText: retryBtn ? retryBtn.innerText : '',
          innerHtmlSnippet: q.innerHTML.substring(0, 300)
        };
      });
    });

    console.log('Quiz Questions Info:', JSON.stringify(info, null, 2));
    
    const globalErrors = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.is-wrong, .is-incorrect, .is-error, .el-alert--error'))
            .map(el => ({ tag: el.tagName, classes: el.className, text: el.innerText.substring(0, 50).trim() }));
    });
    console.log('Global Errors:', JSON.stringify(globalErrors, null, 2));

    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
