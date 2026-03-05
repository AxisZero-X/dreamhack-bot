const fs = require('fs');
const content = fs.readFileSync('bot.js', 'utf8');
const lines = content.split('\n');
const tryChoiceIdx = lines.findIndex(l => l.includes('async function tryChoiceTexts('));
const endIdx = lines.findIndex((l, i) => i > tryChoiceIdx && l.startsWith('}'));
console.log(lines.slice(tryChoiceIdx, endIdx + 1).join('\n'));
