// 词书测试防止数据缺失、重复或无法支撑两种学习模式。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getBuiltinWordbook,
  validateWordbook,
} = require('../miniprogram/services/wordbook-service');

test('内置四级词书包含 100 个唯一单词', () => {
  const book = getBuiltinWordbook();
  assert.equal(book.id, 'cet4-core-100');
  assert.equal(book.words.length, 100);
  assert.equal(new Set(book.words.map((item) => item.word)).size, 100);
});

test('每个单词都具备学习所需字段', () => {
  const errors = validateWordbook(getBuiltinWordbook());
  assert.deepEqual(errors, []);
});

test('返回词书副本，页面修改不会污染源数据', () => {
  const first = getBuiltinWordbook();
  first.words[0].meaning = '已修改';
  const second = getBuiltinWordbook();
  assert.notEqual(second.words[0].meaning, '已修改');
});
