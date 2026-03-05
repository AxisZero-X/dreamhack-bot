const fs = require('fs');
const content = fs.readFileSync('bot.js', 'utf8');
const lines = content.split('\n');
const clickRetryIdx = lines.findIndex(l => l.includes('async function clickRetry('));
const endIdx = lines.findIndex((l, i) => i > clickRetryIdx && l.startsWith('  }'));
console.log(lines.slice(clickRetryIdx, endIdx + 1).join('\n'));
