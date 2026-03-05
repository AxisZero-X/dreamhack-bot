const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

// I'll fix the duplicate if (btnText) branch that I accidentally introduced in line 1251
const oldBtnTextCheck = `    if (btnText && typeof btnText === 'string') {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else if (btnText) {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);
      await randomDelay(3000, 5000);

      // 혹시 모를 확인 모달 처리 (예: "정말 제출하시겠습니까?")
      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    } else {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 이미 제출되었거나 버튼 형식이 다를 수 있습니다.');
    }`;

const newBtnTextCheck = `    if (btnText && typeof btnText === 'string') {
      console.log(\`🖱️  최종 제출 버튼 [\${btnText}] 클릭 완료\`);
      await randomDelay(3000, 5000);

      // 혹시 모를 확인 모달 처리 (예: "정말 제출하시겠습니까?")
      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 이미 제출되었거나 버튼 형식이 다를 수 있습니다.');
    }`;

code = code.replace(oldBtnTextCheck, newBtnTextCheck);
fs.writeFileSync('bot.js', code);
console.log('Fixed btnText check in finishQuiz!');
