const fs = require('fs');
const path = require('path');
const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

// handleCorrect의 nextKeywords에 '다음 주제로', '진행하기' 등 전체 완료 버튼도 추가
const oldHandleCorrectKeywords = "const nextKeywords = ['다음 문제', '다음', '완료하기', '계속', 'Next', 'Continue'];";
const newHandleCorrectKeywords = "const nextKeywords = ['다음 문제', '다음', '완료하기', '진행하기', '다음 주제로', '제출', '계속', 'Next', 'Continue'];";

content = content.replace(oldHandleCorrectKeywords, newHandleCorrectKeywords);
fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Patched handleCorrect to find completion buttons as well');
