require('dotenv').config();

// --- 사용자 환경 설정 ---
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// --- 타겟 설정 ---
const CURRICULUM_URL = process.env.CURRICULUM_URL || 'https://dreamhack.io/euser/curriculums/916'; // 수강할 코스 커리큘럼 URL (bot.js에서 재정의됨)
const EXAM_URL = process.env.EXAM_URL || null; // 수료 퀴즈 직접 URL (예: https://learn.dreamhack.io/exam/916)

// --- 퀴즈 건너뛰기 모드 ---
const SKIP_QUIZ = process.env.SKIP_QUIZ === '1' || process.argv.includes('--skip-quiz') || false; // 기본값: false (퀴즈 풀이), SKIP_QUIZ=1으로 설정 시 퀴즈 건너뛰기

// --- 자동 로그인 모드 ---
const AUTO_LOGIN = process.env.AUTO_LOGIN === '1' || false; // 기본값: false (수동 로그인), AUTO_LOGIN=1으로 설정 시 자동 로그인

// --- 딜레이 설정 (밀리초) ---
const IS_TEST = process.env.TEST_MODE === '1';
const DELAY = {
  // 강의 체류 시간: 30초~3분 (난이도별로 추가 조정됨)
  PAGE_STAY_MIN: IS_TEST ? 500 : 30000,   // 30초
  PAGE_STAY_MAX: IS_TEST ? 1000 : 180000, // 3분
  
  // 강의 간 전환: 5~20초
  BETWEEN_LECTURES_MIN: IS_TEST ? 500 : 5000,   // 5초
  BETWEEN_LECTURES_MAX: IS_TEST ? 1000 : 20000, // 20초
  
  // 스크롤 대기: 1~3초
  SCROLL_PAUSE_MIN: IS_TEST ? 100 : 1000,  // 1초
  SCROLL_PAUSE_MAX: IS_TEST ? 300 : 3000,  // 3초
  
  // 타이핑 딜레이
  TYPE_CHAR_MIN: 50,
  TYPE_CHAR_MAX: 200,
  
  // 퀴즈 읽기: 10~30초
  QUIZ_READ_MIN: IS_TEST ? 500 : 10000,  // 10초
  QUIZ_READ_MAX: IS_TEST ? 1000 : 30000, // 30초
  
  // 퀴즈 재시도: 3~8초
  QUIZ_RETRY_MIN: IS_TEST ? 300 : 3000,  // 3초
  QUIZ_RETRY_MAX: IS_TEST ? 500 : 8000,  // 8초
};

// --- CSS 셀렉터 ---
const SELECTORS = {
  // 커리큘럼 페이지 (dreamhack.io/euser/curriculums/*)
  LECTURE_ITEM: '.entity',
  INCOMPLETE_INDICATOR: '.action-text:not(.completed)',
  LECTURE_LINK: '.entity-body a',

  // 강의 페이지 (learn.dreamhack.io/*)
  COMPLETE_BTN: 'button.btn.btn-primary', // "진행하기" 또는 "다음 주제로" 버튼
  POPUP_HEADER: '.popup-header', // "축하합니다!" 팝업 헤더
  SLOT_WRAPPER: '.slot-wrapper', // "커리큘럼으로" 또는 "다음 목표로" 버튼을 감싸는 div

  // 퀴즈 페이지 (learn.dreamhack.io/quiz/*)
  QUIZ_TITLE: '.quiz-title',
  QUIZ_STEP: '.step',
  QUIZ_STEP_CURRENT: '.step.is-current',
  QUIZ_STEP_ACCESSIBLE: '.step.is-accessible',
  QUIZ_STEP_COMPLETED: '.check-icon',
  QUIZ_QUESTION: '.quiz-question',
  QUIZ_CHOICE: '.choice',
  QUIZ_CHOICE_ACTIVE: '.choice.is-active',
  QUIZ_SUBMIT_BTN: '.btn.btn-primary',
  QUIZ_SUBMIT_DISABLED: '.btn.btn-primary.disabled',
  QUIZ_RETRY_BTN: '.btn.btn-primary', // 재도전 버튼 (텍스트로 구분)
};

module.exports = {
  CHROME_PATH,
  CURRICULUM_URL,
  EXAM_URL,
  SKIP_QUIZ,
  AUTO_LOGIN,
  DELAY,
  SELECTORS,
};
