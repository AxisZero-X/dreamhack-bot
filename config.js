// --- 사용자 환경 설정 ---
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// --- 타겟 설정 ---
const CURRICULUM_URL = 'https://dreamhack.io/euser/curriculums/916'; // 수강할 코스 커리큘럼 URL

// --- 딜레이 설정 (밀리초) ---
const IS_TEST = process.env.TEST_MODE === '1';
const DELAY = {
  PAGE_STAY_MIN: IS_TEST ? 3000 : 3 * 60 * 1000,
  PAGE_STAY_MAX: IS_TEST ? 5000 : 7 * 60 * 1000,
  BETWEEN_LECTURES_MIN: IS_TEST ? 1000 : 5000,
  BETWEEN_LECTURES_MAX: IS_TEST ? 2000 : 15000,
  SCROLL_PAUSE_MIN: IS_TEST ? 500 : 3000,
  SCROLL_PAUSE_MAX: IS_TEST ? 1000 : 10000,
  TYPE_CHAR_MIN: 50,
  TYPE_CHAR_MAX: 200,
  QUIZ_READ_MIN: IS_TEST ? 1000 : 5000,
  QUIZ_READ_MAX: IS_TEST ? 2000 : 15000,
  QUIZ_RETRY_MIN: IS_TEST ? 500 : 2000,
  QUIZ_RETRY_MAX: IS_TEST ? 1000 : 5000,
};

// --- CSS 셀렉터 ---
const SELECTORS = {
  // 커리큘럼 페이지 (dreamhack.io/euser/curriculums/*)
  LECTURE_ITEM: '.entity',
  INCOMPLETE_INDICATOR: '.action-text:not(.completed)',
  LECTURE_LINK: '.entity-body a',

  // 강의 페이지 (learn.dreamhack.io/*)
  COMPLETE_BTN: 'button.btn.btn-primary', // "진행하기" 또는 "다음 주제로" 버튼
  POPUP_HEADER: '.popup-header',          // "축하합니다!" 팝업 헤더
  SLOT_WRAPPER: '.slot-wrapper',          // "커리큘럼으로" 또는 "다음 목표로" 버튼을 감싸는 div

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
  CURRICULUM_URL,
  DELAY,
  SELECTORS,
};
