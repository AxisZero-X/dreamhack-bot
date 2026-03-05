const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

const snippet1 = `    let solved = false;
    let attempts = 0;`;

const snippet2 = `    let solved = false;
    let attempts = 0;
    const triedTexts = new Set();`;

content = content.replace(snippet1, snippet2);

fs.writeFileSync(botPath, content);
console.log('Added triedTexts declaration properly!');
