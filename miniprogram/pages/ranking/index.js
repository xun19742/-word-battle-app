const { loadRanking } = require('../../services/ranking-service');

const TABS = [
  { type: 'battleScore', label: '积分榜' },
  { type: 'battleWins', label: '胜场榜' },
];

Page({
  data: {
    tabs: TABS,
    activeType: 'battleScore',
    list: [],
    loading: false,
    message: '',
  },

  onShow() {
    this.loadCurrentRanking();
  },

  switchRanking(event) {
    const type = event.currentTarget.dataset.type;
    if (!type || type === this.data.activeType) return;
    this.setData({ activeType: type });
    this.loadCurrentRanking();
  },

  async loadCurrentRanking() {
    // 页面只关心展示状态，云能力判断和异常处理统一放在 ranking-service 中。
    this.setData({ loading: true, message: '' });
    const result = await loadRanking(this.data.activeType);
    this.setData({
      loading: false,
      list: result.list,
      message: result.success ? '' : result.message,
    });
  },
});
