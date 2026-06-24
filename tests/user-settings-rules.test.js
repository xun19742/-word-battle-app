// 用户设置和资料规则测试保证云端只接受小程序支持的完整参数。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createDefaultUser,
  getPublicUserProfile,
  normalizeProfileInput,
  validateCloudSettings,
} = require('../cloudfunctions/login/user-rules');

test('登录云函数返回完整新设置字段且不再返回旧 roundSize', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'login', 'index.js'),
    'utf8',
  );
  assert.match(source, /selectedWordbookId/);
  assert.match(source, /dailyNewWords/);
  assert.match(source, /reviewRatio/);
  assert.doesNotMatch(source, /roundSize/);
});

test('首次登录创建新的默认用户设置', () => {
  const user = createDefaultUser('openid-1');
  assert.equal(user._openid, 'openid-1');
  assert.equal(user.defaultMode, 'flashcard');
  assert.equal(user.selectedWordbookId, 'cet4');
  assert.equal(user.dailyNewWords, 25);
  assert.equal(user.reviewRatio, 2);
  assert.equal(user.totalScore, 0);
});

test('云端接受完整合法设置', () => {
  const settings = {
    defaultMode: 'quiz',
    selectedWordbookId: 'ielts',
    dailyNewWords: 500,
    reviewRatio: 3,
  };
  assert.deepEqual(validateCloudSettings(settings), settings);
});

test('云端拒绝非法词书、数量和比例', () => {
  const base = {
    defaultMode: 'flashcard',
    selectedWordbookId: 'cet4',
    dailyNewWords: 25,
    reviewRatio: 2,
  };
  assert.throws(
    () => validateCloudSettings({ ...base, selectedWordbookId: 'missing' }),
    /设置参数无效/,
  );
  assert.throws(
    () => validateCloudSettings({ ...base, dailyNewWords: 27 }),
    /设置参数无效/,
  );
  assert.throws(
    () => validateCloudSettings({ ...base, reviewRatio: 4 }),
    /设置参数无效/,
  );
});

test('云端标准化用户头像昵称并补齐对战统计字段', () => {
  const profile = normalizeProfileInput({
    nickname: ' 小词王 ',
    avatarUrl: 'https://example.com/avatar.png',
  });
  assert.deepEqual(profile, {
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
  });

  assert.deepEqual(getPublicUserProfile({
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
    battleScore: 20,
    battleWins: 2,
    battleLosses: 1,
    battleDraws: 1,
    battlePlayed: 4,
  }), {
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
    battleScore: 20,
    battleWins: 2,
    battleLosses: 1,
    battleDraws: 1,
    battlePlayed: 4,
  });
});

test('云端拒绝异常头像昵称', () => {
  assert.throws(
    () => normalizeProfileInput({ nickname: '', avatarUrl: '' }),
    /用户资料无效/,
  );
  assert.throws(
    () => normalizeProfileInput({ nickname: 'a'.repeat(33), avatarUrl: '' }),
    /用户资料无效/,
  );
  assert.throws(
    () => normalizeProfileInput({ nickname: '小词王', avatarUrl: 12 }),
    /用户资料无效/,
  );
});

test('登录云函数支持保存资料并返回公开资料', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'login', 'index.js'),
    'utf8',
  );
  assert.match(source, /event\.action === 'saveProfile'/);
  assert.match(source, /normalizeProfileInput\(event\.profile\)/);
  assert.match(source, /profile:\s*getPublicUserProfile\(user\)/);
});
