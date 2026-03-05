const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// 1. curriculum validation check
const oldEval = `        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          // 100% 진행률인 경우 무시
          if ((hasStart || hasResume) && progressText !== '100%') urls.push(a.href);
        });`;
const newEval = `        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          
          // 강의 항목 (a 태그에 action-text 클래스)
          let hasIncomplete = false;
          actionTexts.forEach(el => {
            const text = el.innerText.trim();
            if (!el.classList.contains('completed')) {
              if (text === '시작하기' || text === '이어하기' || text === '재도전') {
                hasIncomplete = true;
              }
            }
          });
          
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          
          if (hasIncomplete && progressText !== '100%') {
            const linkEl = item.querySelector('a');
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });`;
content = content.replace(oldEval, newEval);
content = content.replace(oldEval, newEval); // replace both extract and validate

// exam extract
const oldExam = `      const btnText = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const examLink = links.find(a => a.innerText.includes('수료 퀴즈') || a.href.includes('/exam/'));
        return examLink ? examLink.href : null;
      });`;
const newExam = `      const examUrlStr = await page.evaluate(() => {
        const items = document.querySelectorAll('.entity');
        for (const item of Array.from(items)) {
          const titleEl = item.querySelector('.title');
          if (titleEl && (titleEl.innerText.includes('수료 퀴즈') || titleEl.innerText.includes('Exam'))) {
            const linkEl = item.querySelector('a');
            if (linkEl && linkEl.href) return linkEl.href;
          }
        }
        return null;
      });
      const examUrl = examUrlStr;`;
content = content.replace(oldExam, newExam);

fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Patched validation logic');
