const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// replace curriculum extract
const oldExtract = `        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          // 100% 진행률인 경우 무시
          if ((hasStart || hasResume) && progressText !== '100%') urls.push(a.href);
        });
        return { lectureUrls: urls, togetherPracticeMap: practiceMap };`;
const newExtract = `        items.forEach(item => {
          const actionTextEl = item.querySelector('.action-text');
          if (!actionTextEl) return;
          const text = actionTextEl.innerText.trim();
          const isCompleted = actionTextEl.classList.contains('completed');
          
          if (!isCompleted && (text === '시작하기' || text === '이어하기' || text === '재도전')) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });
        return { lectureUrls: urls, togetherPracticeMap: practiceMap };`;
content = content.replace(oldExtract, newExtract);

// replace validation
const oldValid = `        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const hasResume = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '이어서');
          const progressEl = item.querySelector('.progress-text');
          const progressText = progressEl ? progressEl.innerText.trim() : '';
          if ((hasStart || hasResume) && progressText !== '100%') {
            return a.href;
          }
        });`;
const newValid = `        items.forEach(item => {
          const actionTextEl = item.querySelector('.action-text');
          if (!actionTextEl) return;
          const text = actionTextEl.innerText.trim();
          const isCompleted = actionTextEl.classList.contains('completed');
          
          if (!isCompleted && (text === '시작하기' || text === '이어하기' || text === '재도전')) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });`;
content = content.replace(oldValid, newValid);

// exam test
const oldExam = `      const examUrlStr = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const examLink = links.find(a => a.innerText.includes('수료 퀴즈') || a.href.includes('/exam/'));
        return examLink ? examLink.href : null;
      });
      const examUrl = examUrlStr;`;
const newExam = `      const examUrl = await page.evaluate(() => {
        const items = document.querySelectorAll('.entity');
        for (const item of Array.from(items)) {
          const titleEl = item.querySelector('.title');
          if (titleEl && (titleEl.innerText.includes('수료 퀴즈') || titleEl.innerText.includes('Exam') || titleEl.innerText.includes('시험'))) {
            const actionEl = item.querySelector('.action-text');
            if (actionEl && !actionEl.classList.contains('completed')) {
                const linkEl = item.querySelector('a');
                if (linkEl && linkEl.href) return linkEl.href;
            }
          }
        }
        return null;
      });`;
content = content.replace(oldExam, newExam);

fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Patched final validation logic');
