const CHECKIN_KEY = 'wordrush.checkins';

function emptyDay(date = '') {
  return {
    date,
    completed: 0,
    newCompleted: 0,
    reviewCompleted: 0,
    score: 0,
    rounds: 0,
    lastCheckedAt: '',
  };
}

function emptyState() {
  return {
    processedRoundIds: [],
    days: {},
  };
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeDay(date, value = {}) {
  return {
    ...emptyDay(date),
    ...value,
    date,
    completed: safeNumber(value.completed),
    newCompleted: safeNumber(value.newCompleted),
    reviewCompleted: safeNumber(value.reviewCompleted),
    score: safeNumber(value.score),
    rounds: safeNumber(value.rounds),
    lastCheckedAt: typeof value.lastCheckedAt === 'string'
      ? value.lastCheckedAt
      : '',
  };
}

function normalizeCheckinState(value) {
  if (!value || typeof value !== 'object') {
    return emptyState();
  }
  const days = {};
  if (value.days && typeof value.days === 'object') {
    Object.entries(value.days).forEach(([date, day]) => {
      days[date] = normalizeDay(date, day);
    });
  }
  return {
    processedRoundIds: Array.isArray(value.processedRoundIds)
      ? [...value.processedRoundIds]
      : [],
    days,
  };
}

function getDate(timestamp) {
  return String(timestamp || '').slice(0, 10);
}

function shiftDate(date, offset) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function calculateStreak(days, today) {
  let streak = 0;
  let cursor = today;
  while (days[cursor] && days[cursor].completed > 0) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function createCheckinStore(read, write, now = () => new Date().toISOString()) {
  function readState() {
    return normalizeCheckinState(read());
  }

  function writeState(state) {
    write(normalizeCheckinState(state));
  }

  return {
    applyCheckinSummary(summary = {}) {
      const total = safeNumber(summary.total);
      if (!summary.roundId || total <= 0) {
        return { applied: false };
      }
      const state = readState();
      if (state.processedRoundIds.includes(summary.roundId)) {
        return { applied: false };
      }

      const timestamp = now();
      const date = getDate(timestamp);
      const currentDay = state.days[date] || emptyDay(date);
      const score = safeNumber(summary.score);
      const studyType = summary.studyType === 'review' ? 'review' : 'new';
      const nextDay = {
        ...currentDay,
        completed: currentDay.completed + total,
        newCompleted: currentDay.newCompleted + (studyType === 'new' ? total : 0),
        reviewCompleted: currentDay.reviewCompleted + (studyType === 'review' ? total : 0),
        score: currentDay.score + score,
        rounds: currentDay.rounds + 1,
        lastCheckedAt: timestamp,
      };
      const nextState = {
        processedRoundIds: [...state.processedRoundIds, summary.roundId],
        days: {
          ...state.days,
          [date]: nextDay,
        },
      };
      writeState(nextState);
      return {
        applied: true,
        day: nextDay,
        stats: this.loadCheckinStats(date),
      };
    },

    loadCheckinStats(today = getDate(now())) {
      const state = readState();
      const todayDay = state.days[today] || emptyDay(today);
      return {
        checkedToday: todayDay.completed > 0,
        streak: calculateStreak(state.days, today),
        todayCompleted: todayDay.completed,
        todayScore: todayDay.score,
        totalDays: Object.values(state.days)
          .filter((day) => day.completed > 0)
          .length,
      };
    },

    listCheckinDays(limit = 30) {
      return Object.values(readState().days)
        .filter((day) => day.completed > 0)
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, limit);
    },
  };
}

function createWxCheckinStore(now) {
  // 打卡记录先保存在本地，保证离线学习完成后也能看到连续学习状态。
  return createCheckinStore(
    () => wx.getStorageSync(CHECKIN_KEY),
    (value) => wx.setStorageSync(CHECKIN_KEY, value),
    now,
  );
}

module.exports = {
  CHECKIN_KEY,
  createCheckinStore,
  createWxCheckinStore,
  normalizeCheckinState,
};
