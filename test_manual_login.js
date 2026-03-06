// 수동 로그인 모드 테스트 스크립트
const { spawn } = require('child_process');
const readline = require('readline');

console.log('=== 수동 로그인 모드 테스트 ===');
console.log('이 테스트는 30초 동안 실행되며 로그인 모드를 확인합니다.\n');

// 테스트용 자동 입력 (빠른 테스트를 위해)
const inputs = [
  '920\n',      // 커리큘럼 ID
  '1\n',        // 목표 수강률 (1%로 설정하여 빠르게 종료)
  'test@example.com\n',  // 이메일
  'testpassword\n'       // 비밀번호
];

const bot = spawn('node', ['bot.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

let output = '';
let inputIndex = 0;

bot.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log(text);
  
  // 입력 프롬프트가 나타나면 자동으로 입력
  if (text.includes('입력하세요') || text.includes('이메일') || text.includes('비밀번호')) {
    if (inputIndex < inputs.length) {
      console.log(`\n[테스트 입력: ${inputs[inputIndex].trim()}]`);
      bot.stdin.write(inputs[inputIndex]);
      inputIndex++;
    }
  }
  
  // 로그인 모드 확인
  if (text.includes('자동 로그인 모드 활성화') || text.includes('수동 로그인 모드 활성화')) {
    console.log('\n=== 로그인 모드 확인 완료 ===');
    console.log('현재 설정된 AUTO_LOGIN 값에 따라 올바른 모드가 활성화되었습니다.');
    
    // 테스트 완료 후 종료
    setTimeout(() => {
      console.log('\n=== 테스트 완료, 프로세스 종료 ===');
      bot.kill();
      analyzeResults();
    }, 5000);
  }
});

bot.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

// 30초 후 자동 종료 (안전장치)
setTimeout(() => {
  console.log('\n=== 30초 경과, 프로세스 종료 ===');
  bot.kill();
  analyzeResults();
}, 30000);

bot.on('close', (code) => {
  console.log(`\n프로세스 종료 코드: ${code}`);
  analyzeResults();
});

function analyzeResults() {
  console.log('\n=== 테스트 결과 분석 ===');
  
  const lines = output.split('\n');
  
  // 로그인 모드 확인
  const autoLoginLine = lines.find(line => line.includes('자동 로그인 모드 활성화'));
  const manualLoginLine = lines.find(line => line.includes('수동 로그인 모드 활성화'));
  
  if (autoLoginLine) {
    console.log('❌ 문제 발견: 자동 로그인 모드가 활성화되었습니다!');
    console.log('   하지만 AUTO_LOGIN은 false로 설정되어 있어야 합니다.');
    console.log('   config.js의 AUTO_LOGIN 설정을 확인하세요.');
  } else if (manualLoginLine) {
    console.log('✅ 성공: 수동 로그인 모드가 올바르게 활성화되었습니다!');
    console.log('   사용자가 직접 브라우저에서 로그인할 수 있습니다.');
  } else {
    console.log('⚠️  경고: 로그인 모드 메시지를 찾을 수 없습니다.');
    console.log('   bot.js의 로그인 섹션이 실행되지 않았을 수 있습니다.');
  }
  
  // AUTO_LOGIN 값 확인
  const config = require('./config.js');
  console.log(`\n현재 설정된 AUTO_LOGIN 값: ${config.AUTO_LOGIN}`);
  console.log(`AUTO_LOGIN 타입: ${typeof config.AUTO_LOGIN}`);
  
  process.exit(0);
}