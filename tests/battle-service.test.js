const test = require('node:test');
const assert = require('node:assert/strict');

function reloadService(wxMock) {
  delete require.cache[require.resolve('../miniprogram/services/battle-service')];
  global.wx = wxMock;
  return require('../miniprogram/services/battle-service');
}

test('没有云能力时创建房间安全降级', async () => {
  const { createRoom } = reloadService({});
  const result = await createRoom({ wordbookId: 'cet4', questions: [] });

  assert.deepEqual(result, {
    success: false,
    message: '对战需要云服务',
    room: null,
  });
});

test('创建房间调用 battle 云函数并传入 action', async () => {
  const calls = [];
  const { createRoom } = reloadService({
    cloud: {
      callFunction: async (payload) => {
        calls.push(payload);
        return { result: { success: true, room: { _id: '123456' } } };
      },
    },
  });
  const result = await createRoom({ wordbookId: 'cet4', questions: [{ wordId: 'a' }] });

  assert.equal(result.success, true);
  assert.equal(result.room._id, '123456');
  assert.equal(calls[0].name, 'battle');
  assert.deepEqual(calls[0].data, {
    action: 'createRoom',
    wordbookId: 'cet4',
    questions: [{ wordId: 'a' }],
  });
});

test('云函数异常时返回具体错误消息', async () => {
  const { createRoom } = reloadService({
    cloud: {
      callFunction: async () => {
        throw new Error('云函数 battle 未部署');
      },
    },
  });
  const result = await createRoom({ wordbookId: 'cet4', questions: [] });

  assert.equal(result.success, false);
  assert.equal(result.message, '对战请求失败：云函数 battle 未部署');
});

test('watchRoom 优先使用数据库 watch 并返回关闭函数', () => {
  let closed = false;
  const { watchRoom } = reloadService({
    cloud: {
      database: () => ({
        collection: () => ({
          doc: () => ({
            watch: ({ onChange }) => {
              onChange({ docs: [{ _id: '123456', status: 'waiting' }] });
              return { close: () => { closed = true; } };
            },
          }),
        }),
      }),
    },
  });
  const states = [];
  const watcher = watchRoom('123456', { onChange: (room) => states.push(room) });
  watcher.close();

  assert.equal(states[0].status, 'waiting');
  assert.equal(closed, true);
});

test('watchRoom 在 watch 不可用时降级轮询 getRoom', async () => {
  const cleared = [];
  const calls = [];
  const { watchRoom } = reloadService({
    cloud: {
      callFunction: async (payload) => {
        calls.push(payload);
        return { result: { success: true, room: { _id: '123456', status: 'playing' } } };
      },
      database: () => ({
        collection: () => ({
          doc: () => ({
            watch: () => {
              throw new Error('watch disabled');
            },
          }),
        }),
      }),
    },
  });
  const states = [];
  const watcher = watchRoom('123456', {
    onChange: (room) => states.push(room),
    setInterval: (callback) => {
      callback();
      return 7;
    },
    clearInterval: (id) => cleared.push(id),
  });
  await new Promise((resolve) => setImmediate(resolve));
  watcher.close();

  assert.equal(calls[0].data.action, 'getRoom');
  assert.equal(states[0].status, 'playing');
  assert.equal(cleared[0], 7);
});
