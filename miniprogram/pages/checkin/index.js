const { createWxCheckinStore } = require('../../services/checkin-service');

Page({
  data: {
    stats: {
      checkedToday: false,
      streak: 0,
      todayCompleted: 0,
      todayScore: 0,
      totalDays: 0,
    },
    days: [],
  },

  onShow() {
    // 每次进入页面都重新读取本地打卡，保证从总结页返回后数据立即刷新。
    const store = createWxCheckinStore();
    this.setData({
      stats: store.loadCheckinStats(),
      days: store.listCheckinDays(30),
    });
  },
});
