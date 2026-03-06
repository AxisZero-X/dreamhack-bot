const blessed = require('blessed');
const contrib = require('blessed-contrib');
const logger = require('./logger');
const { retryManager } = require('./retryManager');
const { errorHandler } = require('./errorHandler');

/**
 * 터미널 대시보드 클래스
 * 실시간 모니터링 및 제어 인터페이스 제공
 */
class TerminalDashboard {
  constructor() {
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.stats = {
      lectures: { total: 0, completed: 0, failed: 0 },
      quizzes: { total: 0, solved: 0, failed: 0 },
      wargames: { total: 0, solved: 0, failed: 0 },
      errors: { total: 0, recovered: 0, critical: 0 },
      performance: { avgTime: 0, speed: 0, efficiency: 0 }
    };
    this.isRunning = false;
    this.startTime = null;
    this.updateInterval = null;
  }

  /**
   * 대시보드 초기화
   */
  initialize() {
    // Blessed 스크린 생성
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Dreamhack Bot Dashboard',
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true
      }
    });

    // 그리드 레이아웃 생성
    this.grid = new contrib.grid({ 
      rows: 12, 
      cols: 12, 
      screen: this.screen 
    });

    // 위젯 생성
    this.createWidgets();

    // 키 바인딩
    this.setupKeyBindings();

    // 업데이트 인터벌 시작
    this.startTime = Date.now();
    this.updateInterval = setInterval(() => this.updateDashboard(), 1000);

    logger.info('📊 터미널 대시보드 초기화 완료');
  }

  /**
   * 위젯 생성
   */
  createWidgets() {
    // 1. 헤더 (상태 표시줄)
    this.widgets.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      label: ' 🚀 Dreamhack Bot Dashboard ',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'white'
        }
      },
      content: '{center}상태: {bold}{green-fg}준비됨{/green-fg}{/bold} | 시작 시간: - | 실행 시간: -{/center}'
    });

    // 2. 진행률 표시줄
    this.widgets.progress = this.grid.set(1, 0, 1, 12, contrib.gauge, {
      label: '전체 진행률',
      stroke: 'green',
      fill: 'white',
      percent: 0
    });

    // 3. 통계 박스 (왼쪽)
    this.widgets.statsBox = this.grid.set(2, 0, 4, 6, blessed.box, {
      label: ' 📊 통계 ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      },
      content: this.generateStatsContent()
    });

    // 4. 에러 박스 (오른쪽)
    this.widgets.errorBox = this.grid.set(2, 6, 4, 6, blessed.box, {
      label: ' ⚠️ 에러 현황 ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        }
      },
      content: this.generateErrorContent()
    });

    // 5. 로그 박스 (하단)
    this.widgets.logBox = this.grid.set(6, 0, 4, 12, blessed.log, {
      label: ' 📝 실시간 로그 ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'gray',
        border: {
          fg: 'magenta'
        }
      },
      scrollable: true,
      scrollbar: {
        ch: ' ',
        inverse: true
      },
      keys: true,
      vi: true,
      alwaysScroll: true,
      scrollback: 100
    });

    // 6. 제어 패널 (하단)
    this.widgets.controlPanel = this.grid.set(10, 0, 2, 12, blessed.box, {
      label: ' 🎮 제어 ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      },
      content: '{center}[{bold}Q{/bold}] 종료 | [{bold}P{/bold}] 일시정지/재개 | [{bold}R{/bold}] 통계 리셋 | [{bold}L{/bold}] 로그 클리어{/center}'
    });

    // 7. 상태 아이콘 (우측 상단)
    this.widgets.statusIcons = this.grid.set(0, 10, 1, 2, blessed.box, {
      tags: true,
      content: '🔴 🟡 🟢'
    });
  }

  /**
   * 통계 내용 생성
   */
  generateStatsContent() {
    const stats = this.stats;
    return `
{bold}강의:{/bold}
  • 전체: ${stats.lectures.total}
  • 완료: {green-fg}${stats.lectures.completed}{/green-fg}
  • 실패: {red-fg}${stats.lectures.failed}{/red-fg}

{bold}퀴즈:{/bold}
  • 전체: ${stats.quizzes.total}
  • 해결: {green-fg}${stats.quizzes.solved}{/green-fg}
  • 실패: {red-fg}${stats.quizzes.failed}{/red-fg}

{bold}워게임:{/bold}
  • 전체: ${stats.wargames.total}
  • 해결: {green-fg}${stats.wargames.solved}{/green-fg}
  • 실패: {red-fg}${stats.wargames.failed}{/red-fg}

{bold}성능:{/bold}
  • 평균 시간: ${stats.performance.avgTime.toFixed(1)}초
  • 속도: ${stats.performance.speed.toFixed(1)}/시간
  • 효율: ${stats.performance.efficiency.toFixed(1)}%`;
  }

  /**
   * 에러 내용 생성
   */
  generateErrorContent() {
    const errorStats = errorHandler.getStats();
    const retryStats = retryManager.getStats();
    
    return `
{bold}에러 통계:{/bold}
  • 총 에러: {yellow-fg}${errorStats.totalErrors}{/yellow-fg}
  • 복구 시도: ${errorStats.recoveryAttempts}
  • 복구 성공률: ${errorStats.recoveryRate}

{bold}에러 분류:{/bold}
${errorStats.errorRate.map(e => `  • ${e.category}: ${e.count} (${e.percentage})`).join('\n') || '  • 없음'}

{bold}재시도 통계:{/bold}
  • 총 시도: ${retryStats.totalAttempts}
  • 성공률: ${retryStats.successRate}
  • 평균 딜레이: ${retryStats.averageDelay}ms`;
  }

  /**
   * 키 바인딩 설정
   */
  setupKeyBindings() {
    // 종료 (Q)
    this.screen.key('q', () => {
      this.shutdown();
      process.exit(0);
    });

    // 일시정지/재개 (P)
    this.screen.key('p', () => {
      this.isRunning = !this.isRunning;
      this.updateHeader();
      this.widgets.logBox.log(`⏸️  ${this.isRunning ? '재개됨' : '일시정지됨'}`);
    });

    // 통계 리셋 (R)
    this.screen.key('r', () => {
      this.resetStats();
      this.widgets.logBox.log('🔄 통계 리셋됨');
    });

    // 로그 클리어 (L)
    this.screen.key('l', () => {
      this.widgets.logBox.setContent('');
      this.widgets.logBox.log('🧹 로그 클리어됨');
    });

    // ESC 키
    this.screen.key('escape', () => {
      this.shutdown();
      process.exit(0);
    });

    // 화면 리프레시 (F5)
    this.screen.key('f5', () => {
      this.screen.render();
      this.widgets.logBox.log('🔄 화면 새로고침됨');
    });
  }

  /**
   * 대시보드 업데이트
   */
  updateDashboard() {
    if (!this.screen) return;

    try {
      // 헤더 업데이트
      this.updateHeader();

      // 진행률 업데이트
      this.updateProgress();

      // 통계 박스 업데이트
      this.widgets.statsBox.setContent(this.generateStatsContent());

      // 에러 박스 업데이트
      this.widgets.errorBox.setContent(this.generateErrorContent());

      // 상태 아이콘 업데이트
      this.updateStatusIcons();

      // 화면 렌더링
      this.screen.render();
    } catch (error) {
      console.error('대시보드 업데이트 에러:', error.message);
    }
  }

  /**
   * 헤더 업데이트
   */
  updateHeader() {
    if (!this.widgets.header) return;

    const elapsed = this.getElapsedTime();
    const status = this.isRunning ? '{bold}{green-fg}실행 중{/green-fg}{/bold}' : '{bold}{yellow-fg}일시정지{/yellow-fg}{/bold}';
    
    this.widgets.header.setContent(`{center}상태: ${status} | 시작 시간: ${this.formatTime(this.startTime)} | 실행 시간: ${elapsed}{/center}`);
  }

  /**
   * 진행률 업데이트
   */
  updateProgress() {
    if (!this.widgets.progress) return;

    const totalTasks = this.stats.lectures.total + this.stats.quizzes.total + this.stats.wargames.total;
    const completedTasks = this.stats.lectures.completed + this.stats.quizzes.solved + this.stats.wargames.solved;
    
    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // 진행률에 따라 색상 변경
    let color = 'red';
    if (percent >= 70) color = 'green';
    else if (percent >= 30) color = 'yellow';
    
    this.widgets.progress.setPercent(percent);
    this.widgets.progress.options.stroke = color;
  }

  /**
   * 상태 아이콘 업데이트
   */
  updateStatusIcons() {
    if (!this.widgets.statusIcons) return;

    const errorStats = errorHandler.getStats();
    const retryStats = retryManager.getStats();
    
    // 에러 상태 (빨간색: 치명적 에러, 노란색: 경고, 초록색: 정상)
    let errorIcon = '🟢';
    if (errorStats.totalErrors > 10) errorIcon = '🔴';
    else if (errorStats.totalErrors > 3) errorIcon = '🟡';
    
    // 재시도 상태
    let retryIcon = '🟢';
    const retryRate = parseFloat(retryStats.successRate);
    if (retryRate < 50) retryIcon = '🔴';
    else if (retryRate < 80) retryIcon = '🟡';
    
    // 실행 상태
    const runIcon = this.isRunning ? '🟢' : '🟡';
    
    this.widgets.statusIcons.setContent(`${errorIcon} ${retryIcon} ${runIcon}`);
  }

  /**
   * 로그 추가
   */
  log(message, level = 'info') {
    if (!this.widgets.logBox) return;

    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    let prefix = '';
    
    switch (level) {
      case 'error':
        prefix = '{red-fg}❌{/red-fg}';
        break;
      case 'warn':
        prefix = '{yellow-fg}⚠️{/yellow-fg}';
        break;
      case 'success':
        prefix = '{green-fg}✅{/green-fg}';
        break;
      case 'info':
      default:
        prefix = '{cyan-fg}ℹ️{/cyan-fg}';
        break;
    }
    
    this.widgets.logBox.log(`${prefix} [${timestamp}] ${message}`);
    
    // 자동 스크롤
    this.widgets.logBox.setScrollPerc(100);
  }

  /**
   * 통계 업데이트
   */
  updateStats(category, data) {
    if (!this.stats[category]) {
      this.stats[category] = data;
    } else {
      Object.assign(this.stats[category], data);
    }
    
    // 성능 통계 재계산
    this.calculatePerformance();
  }

  /**
   * 성능 통계 계산
   */
  calculatePerformance() {
    const elapsedHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    
    if (elapsedHours > 0) {
      const totalCompleted = this.stats.lectures.completed + this.stats.quizzes.solved + this.stats.wargames.solved;
      this.stats.performance.speed = totalCompleted / elapsedHours;
      
      const totalTasks = this.stats.lectures.total + this.stats.quizzes.total + this.stats.wargames.total;
      if (totalTasks > 0) {
        this.stats.performance.efficiency = (totalCompleted / totalTasks) * 100;
      }
    }
  }

  /**
   * 경과 시간 계산
   */
  getElapsedTime() {
    if (!this.startTime) return '00:00:00';
    
    const elapsedMs = Date.now() - this.startTime;
    const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
    const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * 시간 포맷팅
   */
  formatTime(timestamp) {
    if (!timestamp) return '-';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * 통계 리셋
   */
  resetStats() {
    this.stats = {
      lectures: { total: 0, completed: 0, failed: 0 },
      quizzes: { total: 0, solved: 0, failed: 0 },
      wargames: { total: 0, solved: 0, failed: 0 },
      errors: { total: 0, recovered: 0, critical: 0 },
      performance: { avgTime: 0, speed: 0, efficiency: 0 }
    };
    
    retryManager.resetStats();
    errorHandler.resetStats();
    
    this.startTime = Date.now();
  }

  /**
   * 대시보드 시작
   */
  start() {
    this.isRunning = true;
    this.initialize();
    this.screen.render();
    
    this.log('대시보드 시작됨', 'success');
    this.log('Dreamhack Bot 모니터링 중...', 'info');
    
    // 로그 리다이렉션 설정
    this.setupLogRedirection();
  }

  /**
   * 로그 리다이렉션 설정
   */
  setupLogRedirection() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args) => {
      originalLog.apply(console, args);
      this.log(args.join(' '), 'info');
    };
    
    console.error = (...args) => {
      originalError.apply(console, args);
      this.log(args.join(' '), 'error');
    };
    
    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.log(args.join(' '), 'warn');
    };
  }

  /**
   * 대시보드 종료
   */
  shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    if (this.screen) {
      this.screen.destroy();
    }
    
    logger.info('📊 터미널 대시보드 종료됨');
  }
}

// 싱글톤 인스턴스 생성
const dashboard = new TerminalDashboard();

module.exports = {
  TerminalDashboard,
  dashboard
};