// 设置服务测试确保双模式和每轮数量始终处于合法范围。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSettings,
  loadSettings,
  saveSettings,
} = require('../miniprogram/services/settings-service');

test('空设置使用卡片模式和每轮 10 词', () => {
  assert.deepEqual(normalizeSettings({}), {
    defaultMode: 'flashcard',
    roundSize: 10,
  });
});

test('非法设置回落到默认值', () => {
  assert.deepEqual(
    normalizeSettings({ defaultMode: 'other', roundSize: 30 }),
    { defaultMode: 'flashcard', roundSize: 10 },
  );
});

test('合法设置可以保存并重新读取', () => {
  const memory = new Map();
  global.wx = {
    setStorageSync: (key, value) => memory.set(key, value),
    getStorageSync: (key) => memory.get(key),
  };
  const saved = saveSettings({ defaultMode: 'quiz', roundSize: 20 });
  assert.deepEqual(saved, { defaultMode: 'quiz', roundSize: 20 });
  assert.deepEqual(loadSettings(), saved);
  delete global.wx;
});
