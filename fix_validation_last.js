const fs = require('fs');
const path = require('path');
const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

const oldCheck2 = `        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          if (hasStart) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });`;
        
const newCheck2 = `        items.forEach(item => {
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

content = content.replace(oldCheck2, newCheck2);
fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Fixed second occurrence');
