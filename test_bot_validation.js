const fs = require('fs');
const path = require('path');
const botJsPath = path.join(__dirname, 'bot.js');
const content = fs.readFileSync(botJsPath, 'utf8');

const regex1 = /function finishQuiz\(/;
const regex2 = /function validateCompletion\(/;

console.log("finishQuiz found:", regex1.test(content));
console.log("validateCompletion found:", regex2.test(content));
