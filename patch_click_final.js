const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

// Replace the click method in tryChoiceTexts explicitly
bot = bot.replace(
  /await page\.evaluate\(e => \{ e\.scrollIntoView\(\{block: 'center'\}\); e\.click\(\); \}, el\);/g,
  "await page.evaluate(e => { e.scrollIntoView({block: 'center'}); e.click(); }, el);"
);

// We should also look at where the "확인 클릭" button is clicked because it says "ℹ️ 확인 버튼 없음 (단일클릭 또는 이미 결과 노출)"
// The confirm button click logic is in `tryChoiceTexts` -> `page.evaluate` around line 483
// Let's modify the `hasConfirmBtn` check inside `evalResult` 
// and the click logic for the confirmation button inside `tryChoiceTexts`.

fs.writeFileSync('bot.js', bot);
