const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

const oldStr = `const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0];`;
const newStr = `const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);`;

// Need to adjust spacing, so let's do regex replacement
bot = bot.replace(/const q = qs\.find\(el => el\.offsetParent !== null\) \|\| qs\[idx\] \|\| qs\[0\];/g, 
  `const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);`);

// Wait, the spacing might be different. Let's try with flexible whitespace
bot = bot.replace(/const\s+q\s*=\s*qs\.find\(el\s*=>\s*el\.offsetParent\s*!==\s*null\)\s*\|\|\s*qs\[idx\]\s*\|\|\s*qs\[0\];/g, 
  `const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);`);

fs.writeFileSync('bot.js', bot);
console.log('Replaced query selectors:', bot.includes('const visibleQs = qs.filter(el => el.offsetParent !== null);'));
