const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

bot = bot.replace(
  /await el\.scrollIntoView\(\);\n\s*await el\.click\(\); \/\/ Vue\.js 반응성 보장/g,
  "await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);"
);

bot = bot.replace(
  /const el = handle.asElement\(\);\n\s*if \(!el\) \{\n\s*if \(handle\) await handle\.dispose\(\);\n\s*return false;\n\s*\}/g,
  `const el = handle.asElement();
        if (!el) {
          if (handle) await handle.dispose();
          return false;
        }`
);

fs.writeFileSync('bot.js', bot);
