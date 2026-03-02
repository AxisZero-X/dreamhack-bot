/**
 * 최초 로그인 설정 스크립트
 * 디버깅 포트 없이 Chrome을 실행하여 구글 로그인을 허용합니다.
 * 로그인 후 Enter를 누르면 Chrome이 종료되고 세션이 저장됩니다.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');

require('dotenv').config();

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_PROFILE = path.join(__dirname, '.chrome_profile');

console.log('🔑 드림핵 로그인 설정');
console.log('━'.repeat(50));
console.log(`📂 프로필 경로: ${USER_PROFILE}`);
console.log('');
console.log('Chrome이 실행됩니다. dreamhack.io에 로그인 후');
console.log('이 터미널에서 Enter를 눌러 세션을 저장하세요.\n');

// 기존 Chrome 종료
try {
  execSync('pkill -f "Google Chrome" 2>/dev/null');
} catch {}

setTimeout(() => {
  const chrome = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${USER_PROFILE}`,
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check',
      'https://dreamhack.io/login',
    ],
    { stdio: 'ignore', detached: true },
  );
  chrome.unref();

  console.log('✅ Chrome 실행됨. dreamhack.io/login 에서 로그인하세요.');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('로그인 완료 후 Enter 입력: ', () => {
    rl.close();
    try {
      execSync('pkill -f "Google Chrome" 2>/dev/null');
    } catch {}
    console.log('\n✅ 세션 저장 완료! 이제 node bot.js 를 실행하세요.');
    process.exit(0);
  });
}, 2000);
