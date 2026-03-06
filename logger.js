const winston = require('winston');
const path = require('path');

// ANSI 색상 코드 정의 (chalk 대신 직접 사용)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// 로그 레벨별 색상 정의
const levelColors = {
  error: colors.red + colors.bright,
  warn: colors.yellow,
  info: colors.cyan,
  debug: colors.gray,
  verbose: colors.magenta,
};

// 구조화된 로그 포맷 (파일용)
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// 사용자 친화적인 콘솔 포맷
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const color = levelColors[level] || colors.white;
    const levelStr = `${color}${level.toUpperCase().padEnd(7)}${colors.reset}`;
    
    // 메타데이터가 있으면 추가 정보 표시
    let extra = '';
    if (Object.keys(meta).length > 0 && level === 'info') {
      const metaStr = Object.entries(meta)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      extra = ` ${colors.dim}(${metaStr})${colors.reset}`;
    }
    
    return `${colors.dim}[${timestamp}]${colors.reset} ${levelStr} ${message}${extra}`;
  })
);

// 진행률 바 생성 함수 (모듈 내보내기)
function createProgressBar(current, total, width = 30) {
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percentage}%`;
}

// 진행률 트래커 클래스
class ProgressTracker {
  constructor(totalLectures) {
    this.totalLectures = totalLectures;
    this.completedLectures = 0;
    this.startTime = Date.now();
    this.lectureTimes = [];
    this.lastLoggedPercentage = -1;
  }

  update(current, message = '') {
    this.completedLectures = current;
    
    // 진행률 계산
    const percentage = this.totalLectures > 0 ? 
      Math.min(100, Math.round((this.completedLectures / this.totalLectures) * 100)) : 0;
    
    // 중요한 진행률 업데이트만 로깅 (10% 단위 또는 강의 완료 시)
    const shouldLog = message && (
      percentage === 100 || // 완료 시
      percentage % 10 === 0 || // 10% 단위
      this.completedLectures === 1 || // 첫 강의
      this.completedLectures === this.totalLectures || // 마지막 강의
      percentage !== this.lastLoggedPercentage // 백분율이 변경된 경우
    );
    
    if (shouldLog) {
      this.lastLoggedPercentage = percentage;
      const summary = this.getSummary();
      // logger.info 대신 직접 포맷팅하여 색상 유지
      const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      const levelStr = `${colors.cyan}INFO   ${colors.reset}`;
      console.log(`${colors.dim}[${timestamp}]${colors.reset} ${levelStr} 📊 ${message} ${summary.progressBar} (${summary.completed}/${summary.total}) ${colors.dim}경과: ${summary.elapsed}, 예상 남은: ${summary.remaining}${colors.reset}`);
    }
  }

  addCompletedLecture(timeMs) {
    this.completedLectures++;
    this.lectureTimes.push(timeMs);
    
    // 최근 10개 강의 시간만 유지
    if (this.lectureTimes.length > 10) {
      this.lectureTimes.shift();
    }
  }

  getProgressBar() {
    return createProgressBar(this.completedLectures, this.totalLectures);
  }

  getEstimatedRemainingTime() {
    if (this.lectureTimes.length === 0) return '계산 중...';
    
    const avgTime = this.lectureTimes.reduce((a, b) => a + b, 0) / this.lectureTimes.length;
    const remaining = this.totalLectures - this.completedLectures;
    const remainingMs = avgTime * remaining;
    
    if (remainingMs < 60000) {
      return `${Math.ceil(remainingMs / 1000)}초`;
    } else if (remainingMs < 3600000) {
      return `${Math.ceil(remainingMs / 60000)}분`;
    } else {
      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.ceil((remainingMs % 3600000) / 60000);
      return `${hours}시간 ${minutes}분`;
    }
  }

  getElapsedTime() {
    const elapsedMs = Date.now() - this.startTime;
    if (elapsedMs < 60000) {
      return `${Math.floor(elapsedMs / 1000)}초`;
    } else if (elapsedMs < 3600000) {
      const minutes = Math.floor(elapsedMs / 60000);
      const seconds = Math.floor((elapsedMs % 60000) / 1000);
      return `${minutes}분 ${seconds}초`;
    } else {
      const hours = Math.floor(elapsedMs / 3600000);
      const minutes = Math.floor((elapsedMs % 3600000) / 60000);
      return `${hours}시간 ${minutes}분`;
    }
  }

  getSummary() {
    return {
      progressBar: this.getProgressBar(),
      completed: this.completedLectures,
      total: this.totalLectures,
      elapsed: this.getElapsedTime(),
      remaining: this.getEstimatedRemainingTime(),
      percentage: this.totalLectures > 0 ? 
        Math.min(100, Math.round((this.completedLectures / this.totalLectures) * 100)) : 0
    };
  }

  complete(message = '완료!') {
    const summary = this.getSummary();
    console.log(`${colors.green}✅ ${message}${colors.reset} ${summary.progressBar} (${summary.completed}/${summary.total}) ${colors.dim}총 소요: ${summary.elapsed}${colors.reset}`);
  }

  logSummary(logger) {
    const summary = this.getSummary();
    logger.info('📊 진행 현황', {
      progress: summary.progressBar,
      completed: `${summary.completed}/${summary.total}`,
      elapsed: summary.elapsed,
      remaining: summary.remaining,
      percentage: summary.percentage
    });
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredFormat,
  transports: [
    // 콘솔 출력 (개발용)
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.CONSOLE_LOG_LEVEL || 'info',
    }),
    // 에러 로그 파일
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'error.log'),
      level: 'error',
      format: structuredFormat,
    }),
    // 전체 로그 파일
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'bot.log'),
      format: structuredFormat,
    }),
    // 구조화된 로그 파일 (분석용)
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'structured.log'),
      format: structuredFormat,
    }),
  ],
});

// 헬퍼 메서드 추가
logger.progress = (current, total, message = '진행 중') => {
  const progressBar = createProgressBar(current, total);
  logger.info(`${message} ${progressBar}`, { current, total });
};

// 진행률 트래커 생성 함수
logger.createProgressTracker = (totalLectures) => {
  return new ProgressTracker(totalLectures);
};

module.exports = logger;
