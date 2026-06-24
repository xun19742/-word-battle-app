// 用户资料服务测试保证授权信息可以本地缓存，云端不可用时也不影响小程序使用。
const test = require('node:test');
const assert = require('node:assert/strict');

function setupStorage(initial = {}) {
  const storage = { ...initial };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => {
      storage[key] = value;
    },
  };
  return storage;
}

function loadService() {
  const servicePath = require.resolve('../miniprogram/services/profile-service');
  delete require.cache[servicePath];
  return require(servicePath);
}

test('空资料返回默认展示身份', () => {
  setupStorage();
  const { loadProfile } = loadService();
  assert.deepEqual(loadProfile(), {
    nickname: 'WordRush 用户',
    avatarUrl: '',
    battleScore: 0,
    battleWins: 0,
    battleLosses: 0,
    battleDraws: 0,
    battlePlayed: 0,
  });
  delete global.wx;
});

test('保存资料时会清洗昵称并写入本地缓存', () => {
  const storage = setupStorage();
  const { saveProfileLocal } = loadService();
  const profile = saveProfileLocal({ nickname: ' 小词王 ', avatarUrl: 'avatar.png' });
  assert.equal(profile.nickname, '小词王');
  assert.deepEqual(storage['wordrush.profile'], profile);
  delete global.wx;
});
