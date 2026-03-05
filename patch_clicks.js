const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

// Update clickRetry
bot = bot.replace(
  /await el\.scrollIntoView\(\);\n\s*await el\.click\(\); \/\/ Vue\.js 반응성 보장/g,
  "await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);"
);

// Fallback for previous change if it was still cursor.click
bot = bot.replace(
  /await el\.scrollIntoView\(\);\n\s*await cursor\.click\(el\);/g,
  "await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);"
);

// Update tryChoiceTexts click
bot = bot.replace(
  /await el\.scrollIntoViewIfNeeded\(\);\n\s*await el\.click\(\); \/\/ 네이티브 클릭으로 Vue\.js 이벤트 트리거/g,
  "await page.evaluate(e => { e.scrollIntoView({block: 'center'}); e.click(); }, el);"
);

fs.writeFileSync('bot.js', bot);
