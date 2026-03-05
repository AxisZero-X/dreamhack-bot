const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

// Replace the nextBtn logic in evalResult
const oldSnippet = `        const targetBtns = qBtns.length > 0 ? qBtns : globalBtns;
        // 다음 문제 버튼이 있으면 무조건 정답 상태로 간주
        const nextBtn = targetBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (nextBtn) return { isCorrect: true, debug: debugInfo };`;

const newSnippet = `        const targetBtns = qBtns.length > 0 ? qBtns : globalBtns;
        // 다음 문제 버튼이 있으면 무조건 정답 상태로 간주
        const nextBtn = targetBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (nextBtn) return { isCorrect: true, debug: debugInfo };
        
        // 전역 버튼 중에서 "다음" 버튼이 있는지 확인 (특히 step 기반 퀴즈에서 중요)
        const globalNextBtn = allVisibleBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (globalNextBtn) return { isCorrect: true, debug: debugInfo };`;

content = content.replace(oldSnippet, newSnippet);

fs.writeFileSync(botPath, content);
console.log('Fixed evalResult logic!');
