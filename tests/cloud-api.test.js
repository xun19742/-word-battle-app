// 客户端云边界测试确保没有云能力时仍可使用本地学习功能。
const test = require('node:test');
const assert = require('node:assert/strict');

const sampleSettings = {
  defaultMode: 'quiz',
  selectedWordbookId: 'ielts',
  dailyNewWords: 25,
  reviewRatio: 3,
};

const sampleProfile = {
  nickname: '小词王',
  avatarUrl: '',
};

const cloudProfile = {
  ...sampleProfile,
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0,
};

test('没有云能力时登录、同步和资料保存安全降级', async () => {
  global.wx = {};
  const {
    login,
    saveProfileToCloud,
    syncLearning,
    saveSettingsToCloud,
  } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), { cloudAvailable: false, openid: '' });
  assert.equal(await syncLearning({ roundId: 'r1' }), false);
  assert.equal(await saveSettingsToCloud(sampleSettings), false);
  assert.equal(await saveProfileToCloud(sampleProfile), false);
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
              profile: cloudProfile,
            },
          };
        }
        if (options.data && options.data.action === 'saveProfile') {
          return { result: { success: true, profile: cloudProfile } };
        }
        return { result: { success: true } };
      },
    },
  };
  const {
    login,
    saveProfileToCloud,
    syncLearning,
    saveSettingsToCloud,
  } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), {
    cloudAvailable: true,
    openid: 'openid-1',
    settings: sampleSettings,
    profile: cloudProfile,
  });
  assert.equal(await syncLearning({ roundId: 'r1' }), true);
  assert.equal(await saveSettingsToCloud(sampleSettings), true);
  assert.deepEqual(await saveProfileToCloud(sampleProfile), cloudProfile);
  assert.deepEqual(calls.map((item) => item.name), ['login', 'sync-learning', 'login', 'login']);
  assert.equal(calls[2].data.action, 'saveSettings');
  assert.deepEqual(calls[2].data.settings, sampleSettings);
  assert.equal(calls[3].data.action, 'saveProfile');
  assert.deepEqual(calls[3].data.profile, sampleProfile);
  delete global.wx;
});
