// 存储适配测试使用内存替代微信环境，验证保存、恢复与清理契约。
const test = require('node:test');
const assert = require('node:assert/strict');

test('未完成轮次可以保存、恢复和清理', () => {
  const memory = new Map();
  global.wx = {
    setStorageSync: (key, value) => memory.set(key, value),
    getStorageSync: (key) => memory.get(key),
    removeStorageSync: (key) => memory.delete(key),
  };
  const { saveRound, loadRound, clearRound } = require('../miniprogram/utils/round-storage');
  const round = { roundId: 'round-1', currentIndex: 2 };
  saveRound(round);
  assert.deepEqual(loadRound(), round);
  clearRound();
  assert.equal(loadRound(), null);
  delete global.wx;
});
