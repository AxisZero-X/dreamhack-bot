const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

const snippet1 = `      // 2) 브루트포스 (현재 고정된 텍스트 목록 기반)
      // triedTexts is now persisted across reloads
      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          triedTexts.add(JSON.stringify(aiTexts.slice().sort()));
        }
      }`;

const snippet2 = `      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          if (typeof triedTexts !== 'undefined') {
            triedTexts.add(JSON.stringify(aiTexts.slice().sort()));
          }
        }
      }`;

content = content.replace(snippet1, snippet2);

fs.writeFileSync(botPath, content);
console.log('Fixed triedTexts error!');
