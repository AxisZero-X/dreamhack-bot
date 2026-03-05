const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

const newStr = `        // 보기도 없고 확인 버튼도 없으면 (다음 단계로 넘어감)
        const hasVisibleChoices = Array.from(q.querySelectorAll('.choice')).some(el => el.offsetParent !== null);
        const hasConfirmBtn = targetBtns.some(b => {
          const t = b.innerText.trim();
          const isActionBtn = t.includes('확인') || t.includes('제출') || t.includes('Confirm') || t.includes('Submit');
          return isActionBtn && !['재도전', '다시', ...nextKeys].some(k => t.includes(k));
        });

        if (!hasVisibleChoices && !hasConfirmBtn && !q.querySelector('textarea')) return { isCorrect: true, debug: debugInfo };

        return { isCorrect: false, debug: debugInfo };
      }, qIndex, CORRECT_TEXTS, NEXT_KEYS);

      if (evalResult.debug) {`;

content = content.replace(/        \/\/ 보기도 없고 확인 버튼도 없으면 \(다음 단계로 넘어감\)[\s\S]+/, newStr + content.slice(content.indexOf('      if (evalResult.debug) {') + '      if (evalResult.debug) {'.length));

fs.writeFileSync(botPath, content);
console.log('Fixed syntax error completely!');
