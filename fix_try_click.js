const fs = require('fs');
let bot = fs.readFileSync('bot.js', 'utf8');

// I will just make tryChoiceTexts exactly like how test_click.js works which clicked perfectly
// In test_click.js I used: await page.evaluate(e => { e.scrollIntoView({block: 'center'}); e.click(); }, el);
// In the current bot.js, the confirmation button click says "확인 버튼 없음" 

bot = bot.replace(
  /const b = qBtn \|\| globalBtn;/g,
  `const b = qBtn || globalBtn;
        if (b) console.log('  🔍 확인/제출 버튼 찾음: ' + b.innerText.trim());`
);

bot = bot.replace(
  /const isConfirm = \!\['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'\]\.some\(k => t\.includes\(k\)\);/g,
  `const isConfirm = !['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));
              if (isConfirm) console.log('  🔍 버튼 활성화 상태 확인:', t);`
);

fs.writeFileSync('bot.js', bot);
