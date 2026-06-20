// 待同步队列测试保证网络失败不会丢失或重复提交轮次。
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../miniprogram/services/sync-queue');

function createMemoryQueue(initial = []) {
  let memory = [...initial];
  return {
    queue: createQueue(() => memory, (value) => { memory = [...value]; }),
    read: () => memory,
  };
}

test('相同 roundId 只入队一次', () => {
  const { queue } = createMemoryQueue();
  queue.enqueue({ roundId: 'r1' });
  queue.enqueue({ roundId: 'r1' });
  assert.equal(queue.list().length, 1);
});

test('同步成功后移除，失败时保留', async () => {
  const { queue } = createMemoryQueue([{ roundId: 'r1' }, { roundId: 'r2' }]);
  await queue.flush(async (item) => item.roundId === 'r1');
  assert.deepEqual(queue.list().map((item) => item.roundId), ['r2']);
});

test('同步抛错时保留原轮次', async () => {
  const { queue } = createMemoryQueue([{ roundId: 'r1' }]);
  await queue.flush(async () => { throw new Error('网络错误'); });
  assert.equal(queue.list().length, 1);
});
