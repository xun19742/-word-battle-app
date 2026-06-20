// 云端词书测试保证复制产物与客户端唯一源数据完全一致。
const test = require('node:test');
const assert = require('node:assert/strict');
const localWordbook = require('../miniprogram/data/cet4-core-100');
const cloudWordbook = require('../cloudfunctions/seed-wordbook/data');
const {
  validateSeedData,
  buildWordDocuments,
} = require('../cloudfunctions/seed-wordbook/seed-rules');

test('云端种子包含与客户端一致的 100 个单词', () => {
  assert.equal(cloudWordbook.words.length, 100);
  assert.deepEqual(cloudWordbook, localWordbook);
  assert.doesNotThrow(() => validateSeedData(cloudWordbook));
});

test('种子文档使用稳定 ID 和词书 ID', () => {
  const documents = buildWordDocuments(cloudWordbook);
  assert.equal(documents.length, 100);
  assert.equal(documents[0]._id, 'cet4-001');
  assert.equal(documents[0].wordbookId, 'cet4-core-100');
});

test('拒绝数量不足的词书种子', () => {
  assert.throws(
    () => validateSeedData({ ...cloudWordbook, words: cloudWordbook.words.slice(0, 99) }),
    /100 个单词/,
  );
});
