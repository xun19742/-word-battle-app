// 排行榜客户端服务测试保证云端不可用或异常时不会影响小程序其它功能。
const test = require('node:test');
const assert = require('node:assert/strict');

function loadService() {
  const servicePath = require.resolve('../miniprogram/services/ranking-service');
  delete require.cache[servicePath];
  return require(servicePath);
}

test('没有云能力时排行榜安全降级', async () => {
  global.wx = {};
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('battleScore'), {
    success: false,
    list: [],
    message: '排行榜需要云服务',
  });
  delete global.wx;
});

test('云函数成功时返回清洗后的排行榜', async () => {
  const calls = [];
  global.wx = {
    cloud: {
      callFunction: async (options) => {
        calls.push(options);
        return {
          result: {
            success: true,
            list: [
              {
                nickname: '小词王',
                avatarUrl: '',
                battleScore: '30',
                battleWins: '5',
                battlePlayed: '8',
                secret: 'hidden',
              },
            ],
          },
        };
      },
    },
  };
  const { loadRanking } = loadService();
  const result = await loadRanking('battleWins');

  assert.equal(calls[0].name, 'ranking');
  assert.deepEqual(calls[0].data, { action: 'battleWins' });
  assert.deepEqual(result, {
    success: true,
    list: [
      {
        rank: 1,
        nickname: '小词王',
        avatarUrl: '',
        battleScore: 30,
        battleWins: 5,
        battlePlayed: 8,
      },
    ],
    message: '',
  });
  delete global.wx;
});

test('云函数返回失败时透传错误消息', async () => {
  global.wx = {
    cloud: {
      callFunction: async () => ({
        result: {
          success: false,
          message: '排行榜类型无效',
          list: [{ nickname: '不应展示' }],
        },
      }),
    },
  };
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('other'), {
    success: false,
    list: [],
    message: '排行榜类型无效',
  });
  delete global.wx;
});

test('云函数异常时返回加载失败', async () => {
  global.wx = {
    cloud: {
      callFunction: async () => {
        throw new Error('network');
      },
    },
  };
  const { loadRanking } = loadService();

  assert.deepEqual(await loadRanking('battleScore'), {
    success: false,
    list: [],
    message: '排行榜加载失败',
  });
  delete global.wx;
});
