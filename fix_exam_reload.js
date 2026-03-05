const fs = require('fs');
const path = require('path');

const botJsPath = path.join(__dirname, 'bot.js');
let content = fs.readFileSync(botJsPath, 'utf8');

const oldRetry = `      console.log('  ⚠️ 재도전 후 상태 초기화 대기 타임아웃. 강제 초기화 및 추가 대기.');
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return;
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const removeClasses = (el) => {
          if (!el) return;
          el.classList.remove(...resultClasses);
          Array.from(el.querySelectorAll('*')).forEach(child => child.classList.remove(...resultClasses));
        };
        removeClasses(q);
      }, qIndex);
      await randomDelay(1000, 2000); // 강제 초기화 후 안정화 대기`;

const newRetry = `      console.log('  ⚠️ 재도전 버튼 타임아웃. 페이지를 강제로 새로고침하여 상태를 초기화합니다...');
      await page.reload({ waitUntil: 'networkidle2' });
      await randomDelay(2000, 3000);
      return 'RELOAD_REQUIRED'; // 상위 루프에 새로고침됨을 알림`;

content = content.replace(oldRetry, newRetry);

// clickRetry가 'RELOAD_REQUIRED'를 반환하도록 처리
const oldTryText1 = `          console.log('  ❌ 오답.');
          await clickRetry(page, cursor, qIndex);

          // 오답 후 보기가 셔플되거나 재생성되었는지 확인`;

const newTryText1 = `          console.log('  ❌ 오답.');
          const retryRes = await clickRetry(page, cursor, qIndex);
          if (retryRes === 'RELOAD_REQUIRED') {
            viewChanged = true;
            break;
          }

          // 오답 후 보기가 셔플되거나 재생성되었는지 확인`;
content = content.replace(oldTryText1, newTryText1);

const oldTryTextAI = `            console.log('  ❌ AI 오답. 브루트포스 전환...');
            await clickRetry(page, cursor, qIndex);
          }`;

const newTryTextAI = `            console.log('  ❌ AI 오답. 브루트포스 전환...');
            const retryRes = await clickRetry(page, cursor, qIndex);
            if (retryRes === 'RELOAD_REQUIRED') {
              // AI 예측 실패 후 reload된 경우 다시 바깥 for/while 루프로 넘김
              break; 
            }
          }`;
content = content.replace(oldTryTextAI, newTryTextAI);


const oldTryTextMulti2 = `            } else {
              await clickRetry(page, cursor, qIndex);

              const nextData = await page.evaluate((idx) => {`;
const newTryTextMulti2 = `            } else {
              const retryRes = await clickRetry(page, cursor, qIndex);
              if (retryRes === 'RELOAD_REQUIRED') {
                viewChanged = true;
                break;
              }

              const nextData = await page.evaluate((idx) => {`;
content = content.replace(oldTryTextMulti2, newTryTextMulti2);

const oldTryTextMulti3 = `              } else {
                await clickRetry(page, cursor, qIndex);

                const nextData = await page.evaluate((idx) => {`;
const newTryTextMulti3 = `              } else {
                const retryRes = await clickRetry(page, cursor, qIndex);
                if (retryRes === 'RELOAD_REQUIRED') {
                  viewChanged = true;
                  break;
                }

                const nextData = await page.evaluate((idx) => {`;
content = content.replace(oldTryTextMulti3, newTryTextMulti3);

// clickRetry 함수가 반환값을 가지도록
const oldClickRetryDef = `  const handle = await page.evaluateHandle((idx) => {`;
const newClickRetryDef = `  let isReloaded = false;\n  const handle = await page.evaluateHandle((idx) => {`;
content = content.replace(oldClickRetryDef, newClickRetryDef);

const oldReturnHandleDispose = `    }
  }
  handle.dispose();
  await randomDelay(800, 1500); // 상태 초기화 후 약간 더 긴 대기
}`;

const newReturnHandleDispose = `    } catch (e) {
      console.log('  ⚠️ 재도전 버튼 타임아웃. 페이지를 강제로 새로고침하여 상태를 초기화합니다...');
      await page.reload({ waitUntil: 'networkidle2' });
      await randomDelay(2000, 3000);
      isReloaded = true;
    }
  }
  handle.dispose();
  await randomDelay(800, 1500); // 상태 초기화 후 약간 더 긴 대기
  if (isReloaded) return 'RELOAD_REQUIRED';
}`;

content = content.replace(oldReturnHandleDispose, newReturnHandleDispose);

fs.writeFileSync(botJsPath, content, 'utf8');
console.log('Reload fallback applied.');
