// --- 사용자 환경 설정 ---
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_DATA_DIR = '/Users/yoseop/Library/Application Support/Google/Chrome';
const PROFILE_NAME = 'Default';

// --- 타겟 설정 ---
const CURRICULUM_URL = 'https://dreamhack.io/euser/curriculums/916'; // 수강할 코스 커리큘럼 URL

// --- 딜레이 설정 (밀리초) ---
const DELAY = {
  PAGE_STAY_MIN: 3 * 60 * 1000,   // 강의 페이지 최소 체류 (3분)
  PAGE_STAY_MAX: 7 * 60 * 1000,   // 강의 페이지 최대 체류 (7분)
  BETWEEN_LECTURES_MIN: 5000,      // 강의 간 이동 최소 대기 (5초)
  BETWEEN_LECTURES_MAX: 15000,     // 강의 간 이동 최대 대기 (15초)
  SCROLL_PAUSE_MIN: 3000,          // 스크롤 간 최소 대기 (3초)
  SCROLL_PAUSE_MAX: 10000,         // 스크롤 간 최대 대기 (10초)
  TYPE_CHAR_MIN: 50,               // 타이핑 글자당 최소 (ms)
  TYPE_CHAR_MAX: 200,              // 타이핑 글자당 최대 (ms)
  QUIZ_READ_MIN: 5000,             // 퀴즈 읽기 최소 (5초)
  QUIZ_READ_MAX: 15000,            // 퀴즈 읽기 최대 (15초)
  QUIZ_RETRY_MIN: 2000,            // 오답 후 재시도 대기 최소 (2초)
  QUIZ_RETRY_MAX: 5000,            // 오답 후 재시도 대기 최대 (5초)
};

// --- CSS 셀렉터 ---
const SELECTORS = {
  // 커리큘럼 페이지 (dreamhack.io/euser/curriculums/*)
  LECTURE_ITEM: '.entity',
  INCOMPLETE_INDICATOR: '.action-text:not(.completed)',
  LECTURE_LINK: '.entity-body a',

  // 강의 페이지 (learn.dreamhack.io/*)
  COMPLETE_BTN: '.complete-button-class', // TODO: 일반 강의 페이지 확인 후 매핑

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
};

module.exports = {
  CHROME_PATH,
  USER_DATA_DIR,
  PROFILE_NAME,
  CURRICULUM_URL,
  DELAY,
  SELECTORS,
};
