// 设置服务测试保证词书、每日新词和复习比例始终处于合法范围。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDailyNewWords,
  normalizeSettings,
  loadSettings,
  saveSettings,
} = require('../miniprogram/services/settings-service');

test('空设置使用默认词书、25 个新词和一比二复习', () => {
  assert.deepEqual(normalizeSettings({}), {
    defaultMode: 'flashcard',
    selectedWordbookId: 'cet4',
    dailyNewWords: 25,
    reviewRatio: 2,
  });
});

test('新词数量限制到五至五百并对齐五的倍数', () => {
  assert.equal(normalizeDailyNewWords(2), 5);
  assert.equal(normalizeDailyNewWords(503), 500);
  assert.equal(normalizeDailyNewWords(27), 25);
  assert.equal(normalizeDailyNewWords(28), 30);
});

test('旧设置保留模式并迁移到新默认值', () => {
  assert.deepEqual(normalizeSettings({ defaultMode: 'quiz', roundSize: 20 }), {
    defaultMode: 'quiz',
    selectedWordbookId: 'cet4',
    dailyNewWords: 25,
    reviewRatio: 2,
  });
});

test('合法设置可以保存并重新读取', () => {
  const memory = new Map();
  global.wx = {
    setStorageSync: (key, value) => memory.set(key, value),
    getStorageSync: (key) => memory.get(key),
  };
  const saved = saveSettings({
    defaultMode: 'quiz',
    selectedWordbookId: 'ielts',
    dailyNewWords: 500,
    reviewRatio: 3,
  });
  assert.deepEqual(saved, {
    defaultMode: 'quiz',
    selectedWordbookId: 'ielts',
    dailyNewWords: 500,
    reviewRatio: 3,
  });
  assert.deepEqual(loadSettings(), saved);
  delete global.wx;
});
