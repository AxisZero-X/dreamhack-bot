const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

// The logic we patched earlier has issues with evalResult properly registering the 'Next' button
// Let's refine the evaluation logic for 'isCorrect'
const target = `        // 정답을 맞춘 후 선택지가 남아있어도, 확인 버튼이 사라지고 다음 문제 버튼이 생겼다면 정답
        if (qBtns.length === 0 && globalNextBtn) return { isCorrect: true, debug: debugInfo };`;

const newTarget = `        // 정답을 맞춘 후 선택지가 남아있어도, 확인 버튼이 사라지고 다음 문제 버튼이 생겼다면 정답
        if (qBtns.length === 0 && globalNextBtn) return { isCorrect: true, debug: debugInfo };
        
        // 어떤 버튼이든 텍스트에 "다음"이 포함되어 있으면 무조건 정답
        const anyNextBtn = allVisibleBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (anyNextBtn) return { isCorrect: true, debug: debugInfo };`;

content = content.replace(target, newTarget);
fs.writeFileSync(botPath, content);
console.log("Refined isCorrect logic for 'Next' buttons");
