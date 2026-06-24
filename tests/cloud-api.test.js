// 客户端云边界测试确保没有云能力时仍可使用本地学习功能。
const test = require('node:test');
const assert = require('node:assert/strict');

const sampleSettings = {
  defaultMode: 'quiz',
  selectedWordbookId: 'ielts',
  dailyNewWords: 25,
  reviewRatio: 3,
};

test('没有云能力时登录和同步安全降级', async () => {
  global.wx = {};
  const {
    login,
    syncLearning,
    saveSettingsToCloud,
  } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), { cloudAvailable: false, openid: '' });
  assert.equal(await syncLearning({ roundId: 'r1' }), false);
  assert.equal(await saveSettingsToCloud(sampleSettings), false);
  delete global.wx;
});

test('云能力可用时调用对应云函数', async () => {
  const calls = [];
  global.wx = {
    cloud: {
      callFunction: async (options) => {
        calls.push(options);
        if (options.name === 'login' && !options.data) {
          return {
            result: {
              openid: 'openid-1',
              settings: sampleSettings,
            },
          };
        }
        return { result: { success: true } };
      },
    },
  };
  const {
    login,
    syncLearning,
    saveSettingsToCloud,
  } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), {
    cloudAvailable: true,
    openid: 'openid-1',
    settings: sampleSettings,
  });
  assert.equal(await syncLearning({ roundId: 'r1' }), true);
  assert.equal(await saveSettingsToCloud(sampleSettings), true);
  assert.deepEqual(calls.map((item) => item.name), ['login', 'sync-learning', 'login']);
  assert.equal(calls[2].data.action, 'saveSettings');
  assert.deepEqual(calls[2].data.settings, sampleSettings);
  delete global.wx;
});
