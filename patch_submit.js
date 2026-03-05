const fs = require('fs');

let botCode = fs.readFileSync('bot.js', 'utf8');

const oldSubmitLog = `      const targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') &&
        !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기')
      );`;

const newSubmitLog = `      const targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') &&
        !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기')
      );
      
      if (!targetBtn) {
        // Log all visible buttons to help debug
        const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
        console.log("DEBUG_VISIBLE_BTNS:", JSON.stringify(allBtnTexts));
      }`;

botCode = botCode.replace(oldSubmitLog, newSubmitLog);

const oldBtnTextCheck = `    if (btnText) {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);`;

const newBtnTextCheck = `    if (btnText && typeof btnText === 'string') {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else if (btnText) {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);`;

// We need to return the debug object from page.evaluate
const oldEvalReturn = `      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;
    });`;

const newEvalReturn = `      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      
      const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
      return { debugBtns: allBtnTexts };
    });`;

botCode = botCode.replace(oldEvalReturn, newEvalReturn);
botCode = botCode.replace(oldBtnTextCheck, newBtnTextCheck);

// Let's also add "결과 보기", "결과보기", "채점", "학습 완료", "수강 완료" to submitKeywords
const oldKeywords = `const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done'];`;
const newKeywords = `const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done', '채점', '완료'];`;
botCode = botCode.replace(oldKeywords, newKeywords);

// Also update clickCompleteButton
const oldClickCompleteBtn = `      // '진행하기' 버튼을 우선적으로 찾음
      let targetBtn = visibleBtns.find(btn => btn.innerText.includes('진행하기'));

      // 없으면 '다음 주제로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => btn.innerText.includes('다음 주제로'));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;`;

const newClickCompleteBtn = `      // '진행하기' 버튼을 우선적으로 찾음
      let targetBtn = visibleBtns.find(btn => btn.innerText.includes('진행하기'));

      // 없으면 '다음 주제로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => btn.innerText.includes('다음 주제로'));
      }
      
      // 없으면 '목록으로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => btn.innerText.includes('목록으로'));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      
      const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
      return { debugBtns: allBtnTexts };`;
      
botCode = botCode.replace(oldClickCompleteBtn, newClickCompleteBtn);

const oldClickCompleteBtnCheck = `    if (btnText) {
      console.log(\`🖱️  [\${btnText}] 버튼 클릭 완료\`);
    } else {
      console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다.');
    }`;
    
const newClickCompleteBtnCheck = `    if (btnText && typeof btnText === 'string') {
      console.log(\`🖱️  [\${btnText}] 버튼 클릭 완료\`);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else {
      console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다.');
    }`;
botCode = botCode.replace(oldClickCompleteBtnCheck, newClickCompleteBtnCheck);

// Wait, the "button, .btn, .el-button" selector might miss <a> tags that look like buttons.
// Let's add 'a.btn', 'a.el-button'
const oldQuerySel = `const btns = Array.from(document.querySelectorAll('button, .btn, .el-button, .el-button--primary, .el-button--success'));`;
const newQuerySel = `const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button'));`;
botCode = botCode.replaceAll(oldQuerySel, newQuerySel);

fs.writeFileSync('bot.js', botCode);
console.log('Patched final submit and complete logic!');
