const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

const target = `        // 전역 버튼 중에서 "다음" 버튼이 있는지 확인 (특히 step 기반 퀴즈에서 중요)
        const globalNextBtn = allVisibleBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (globalNextBtn) return { isCorrect: true, debug: debugInfo };`;

const newTarget = `        // 전역 버튼 중에서 "다음" 버튼이 있는지 확인 (특히 step 기반 퀴즈에서 중요)
        const globalNextBtn = allVisibleBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (globalNextBtn) return { isCorrect: true, debug: debugInfo };
        
        // 정답을 맞춘 후 선택지가 남아있어도, 확인 버튼이 사라지고 다음 문제 버튼이 생겼다면 정답
        if (qBtns.length === 0 && globalNextBtn) return { isCorrect: true, debug: debugInfo };`;

content = content.replace(target, newTarget);
fs.writeFileSync(botPath, content);
console.log('Fixed buttons check');
