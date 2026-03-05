const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// Replace variations of visibility checks
content = content.replace(/el\.offsetWidth > 0 && el\.offsetHeight > 0/g, 'el.offsetParent !== null');
content = content.replace(/b\.offsetWidth > 0 && b\.offsetHeight > 0/g, 'b.offsetParent !== null');

content = content.replace(/el\.offsetWidth > 0 \|\| el\.offsetHeight > 0 \|\| el\.getClientRects\(\)\.length > 0/g, 'el.offsetParent !== null');
content = content.replace(/b\.offsetWidth > 0 \|\| b\.offsetHeight > 0 \|\| b\.getClientRects\(\)\.length > 0/g, 'b.offsetParent !== null');

content = content.replace(/el\.offsetWidth > 0 \|\| el\.offsetHeight > 0/g, 'el.offsetParent !== null');
content = content.replace(/b\.offsetWidth > 0 \|\| b\.offsetHeight > 0/g, 'b.offsetParent !== null');

fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Replaced visibility checks in bot.js');
