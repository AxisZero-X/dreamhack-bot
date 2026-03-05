const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

// There is still a syntax error because of how I replaced the hasConfirmBtn arrow function.
// Let's fix the syntax error.
const evalStr1 = `        const hasConfirmBtn = targetBtns.some(b => {
          // If we see "다음", we shouldn't consider it a confirm btn

          const t = b.innerText.trim();
          const isActionBtn = t.includes('확인') || t.includes('제출') || t.includes('Confirm') || t.includes('Submit');`;

const newEvalStr1 = `        const hasConfirmBtn = targetBtns.some(b => {
          const t = b.innerText.trim();
          const isActionBtn = t.includes('확인') || t.includes('제출') || t.includes('Confirm') || t.includes('Submit');
          return isActionBtn && !['재도전', '다시', ...nextKeys].some(k => t.includes(k));
        });`;

content = content.replace(evalStr1, newEvalStr1);

fs.writeFileSync(botPath, content);
console.log('Fixed syntax error!');
