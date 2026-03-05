const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

// The issue might be that in evalResult, it's returning false because of the UI state, let's add more logs
const evalStr = `        const hasConfirmBtn = targetBtns.some(b => {`;
const newEvalStr = `        const hasConfirmBtn = targetBtns.some(b => {
          // If we see "다음", we shouldn't consider it a confirm btn
`;
content = content.replace(evalStr, newEvalStr);

fs.writeFileSync(botPath, content);
