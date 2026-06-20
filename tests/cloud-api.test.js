// 客户端云边界测试确保游客 AppID 下仍可使用本地学习功能。
const test = require('node:test');
const assert = require('node:assert/strict');

test('没有云能力时登录和同步安全降级', async () => {
  global.wx = {};
  const { login, syncLearning } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), { cloudAvailable: false, openid: '' });
  assert.equal(await syncLearning({ roundId: 'r1' }), false);
  delete global.wx;
});

test('云能力可用时调用对应云函数', async () => {
  const calls = [];
  global.wx = {
    cloud: {
      callFunction: async (options) => {
        calls.push(options);
        if (options.name === 'login') return { result: { openid: 'openid-1' } };
        return { result: { success: true } };
      },
    },
  };
  const { login, syncLearning } = require('../miniprogram/services/cloud-api');
  assert.deepEqual(await login(), { cloudAvailable: true, openid: 'openid-1' });
  assert.equal(await syncLearning({ roundId: 'r1' }), true);
  assert.deepEqual(calls.map((item) => item.name), ['login', 'sync-learning']);
  delete global.wx;
});
