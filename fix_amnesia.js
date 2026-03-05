const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botPath, 'utf8');

// Replace the triedTexts initialization so it's outside the while loop.
// The code looks like:
//    let solved = false;
//    let aiAttempted = false;
//
//    while (!solved) {
//       // ...
//       // 2) 브루트포스 (현재 고정된 텍스트 목록 기반)
//       const triedTexts = new Set();
//       // ...

const oldSnippet = `    let solved = false;
    let aiAttempted = false;

    while (!solved) {`;

const newSnippet = `    let solved = false;
    let aiAttempted = false;
    const triedTexts = new Set(); // Hoisted outside the loop

    while (!solved) {`;

content = content.replace(oldSnippet, newSnippet);

const oldTriedTextsInit = `      // 2) 브루트포스 (현재 고정된 텍스트 목록 기반)
      const triedTexts = new Set();`;

const newTriedTextsInit = `      // 2) 브루트포스 (현재 고정된 텍스트 목록 기반)
      // triedTexts is now persisted across reloads`;

content = content.replace(oldTriedTextsInit, newTriedTextsInit);

fs.writeFileSync(botPath, content);
console.log('Fixed triedTexts amnesia!');
