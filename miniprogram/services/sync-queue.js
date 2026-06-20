const QUEUE_KEY = 'wordrush.syncQueue';

function createQueue(read, write) {
  return {
    list() {
      return [...read()];
    },

    enqueue(item) {
      const current = read();
      if (!current.some((entry) => entry.roundId === item.roundId)) {
        write([...current, item]);
      }
    },

    async flush(send) {
      const remaining = [];
      for (const item of read()) {
        try {
          const success = await send(item);
          if (!success) {
            remaining.push(item);
          }
        } catch (error) {
          // 网络或云函数错误时保留原记录，等待下一次重试。
          remaining.push(item);
        }
      }
      write(remaining);
      return remaining;
    },
  };
}

function createWxQueue() {
  return createQueue(
    () => wx.getStorageSync(QUEUE_KEY) || [],
    (value) => wx.setStorageSync(QUEUE_KEY, value),
  );
}

module.exports = {
  createQueue,
  createWxQueue,
};
