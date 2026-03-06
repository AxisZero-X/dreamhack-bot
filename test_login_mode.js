const { spawn } = require('child_process');
const readline = require('readline');

// 테스트용 자동 입력
const inputs = [
  '920\n',      // 커리큘럼 ID
  '100\n',      // 목표 수강률
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
      console.log(`\n[자동 입력: ${inputs[inputIndex].trim()}]`);
      bot.stdin.write(inputs[inputIndex]);
      inputIndex++;
    }
  }
});

bot.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

// 30초 후 종료
setTimeout(() => {
  console.log('\n=== 30초 경과, 프로세스 종료 ===');
  bot.kill();
  
  console.log('\n=== 로그인 관련 출력 분석 ===');
  const lines = output.split('\n');
  
  // 로그인 관련 라인 찾기
  const loginKeywords = ['로그인', 'AUTO_LOGIN', '자동', '수동', '이메일', '비밀번호', '모드', '활성화'];
  const loginLines = lines.filter(line => 
    loginKeywords.some(keyword => line.includes(keyword))
  );
  
  console.log('로그인 관련 라인:');
  loginLines.forEach((line, i) => {
    console.log(`${i + 1}. ${line}`);
  });
  
  // AUTO_LOGIN 조건이 어떻게 평가되었는지 확인
  const autoLoginLine = lines.find(line => line.includes('AUTO_LOGIN') || line.includes('자동 로그인') || line.includes('수동 로그인'));
  console.log('\nAUTO_LOGIN 조건 평가 결과:');
  console.log(autoLoginLine || 'AUTO_LOGIN 관련 라인을 찾을 수 없음');
  
  process.exit(0);
}, 30000);

bot.on('close', (code) => {
  console.log(`\n프로세스 종료 코드: ${code}`);
});