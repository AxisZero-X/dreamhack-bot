const { spawn } = require('child_process');
const path = require('path');

const botPath = path.join(__dirname, 'bot.js');

// 입력 데이터 준비
const inputs = [
  '920',    // 커리큘럼 ID
  '40',     // 목표 수강률
  'test@example.com',  // 이메일
  'testpassword'       // 비밀번호
];

const child = spawn('node', [botPath], {
  env: { ...process.env, TEST_MODE: '1' },
  stdio: ['pipe', 'inherit', 'inherit']
});

// 입력 전송
let inputIndex = 0;
const sendInput = () => {
  if (inputIndex < inputs.length) {
    console.log(`Sending input: ${inputs[inputIndex]}`);
    child.stdin.write(inputs[inputIndex] + '\n');
    inputIndex++;
    setTimeout(sendInput, 1000);
  } else {
    child.stdin.end();
  }
};

// 시작
setTimeout(sendInput, 2000);

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});