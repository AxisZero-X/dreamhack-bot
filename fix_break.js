const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

const snippet1 = `            if (retryRes === 'RELOAD_REQUIRED') {
              // AI 예측 실패 후 reload된 경우 다시 바깥 for/while 루프로 넘김
              break; 
            }`;

const snippet2 = `            if (retryRes === 'RELOAD_REQUIRED') {
              // AI 예측 실패 후 reload된 경우 다시 바깥 for/while 루프로 넘김
              continue; 
            }`;

if (content.includes(snippet1)) {
    content = content.replace(snippet1, snippet2);
    fs.writeFileSync(botPath, content);
    console.log('Fixed break to continue in AI retry logic!');
} else {
    console.log('Snippet not found!');
}
