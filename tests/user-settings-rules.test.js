// 用户设置规则测试保证云端只接受小程序支持的枚举值。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDefaultUser,
  validateCloudSettings,
} = require('../cloudfunctions/login/user-rules');

test('首次登录创建默认用户设置', () => {
  const user = createDefaultUser('openid-1');
  assert.equal(user._openid, 'openid-1');
  assert.equal(user.defaultMode, 'flashcard');
  assert.equal(user.roundSize, 10);
  assert.equal(user.totalScore, 0);
});

test('云端只接受两种模式和 10/20 词', () => {
  assert.deepEqual(
    validateCloudSettings({ defaultMode: 'quiz', roundSize: 20 }),
    { defaultMode: 'quiz', roundSize: 20 },
  );
  assert.throws(
    () => validateCloudSettings({ defaultMode: 'other', roundSize: 30 }),
    /设置参数无效/,
  );
});
