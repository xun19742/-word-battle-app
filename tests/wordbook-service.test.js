// 词书测试防止数据缺失、重复或无法支撑两种学习模式。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getBuiltinWordbook,
  getWordbook,
  isValidWordbookId,
  listWordbooks,
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

test('列出四本完整考试词书并读取独立副本', () => {
  const books = listWordbooks();
  assert.deepEqual(
    books.slice(0, 4).map((book) => book.id),
    ['cet4', 'cet6', 'postgraduate', 'ielts'],
  );
  assert.deepEqual(
    books.slice(0, 4).map((book) => book.wordCount),
    [3849, 5407, 4801, 5040],
  );
  const first = getWordbook('cet4');
  const second = getWordbook('cet4');
  first.words[0].meaning = '已修改';
  assert.notEqual(second.words[0].meaning, '已修改');
  assert.equal(isValidWordbookId('ielts'), true);
  assert.equal(isValidWordbookId('missing'), false);
});

test('多词书允许缺少例句但拒绝空释义', () => {
  const valid = {
    id: 'sample',
    name: '样例',
    words: [{
      id: 'sample-a',
      word: 'alpha',
      phonetic: '',
      meaning: 'n. 阿尔法',
      order: 1,
    }],
  };
  assert.deepEqual(validateWordbook(valid), []);
  valid.words[0].meaning = '';
  assert.match(validateWordbook(valid)[0], /meaning/);
});
