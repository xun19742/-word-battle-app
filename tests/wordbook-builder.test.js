// 生成器测试保证考试标签、共享词条和稳定输出都可重复。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsvText } = require('../scripts/csv-parser');
const {
  buildWordbookData,
  serializeWordbookData,
  validateBuiltData,
} = require('../scripts/wordbook-builder');

function loadRows() {
  const source = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'ecdict-sample.csv'),
    'utf8',
  );
  return parseCsvText(source);
}

test('按四类考试标签生成共享词条和词书索引', () => {
  const data = buildWordbookData(loadRows());
  assert.equal(data.entries.length, 4);
  assert.deepEqual(
    data.books.map((book) => [book.id, book.indexes.length]),
    [['cet4', 2], ['cet6', 2], ['postgraduate', 2], ['ielts', 2]],
  );
  assert.equal(data.entries.filter((entry) => entry[0] === 'alpha').length, 1);
});

test('生成结果稳定且拒绝损坏索引', () => {
  const data = buildWordbookData(loadRows());
  assert.deepEqual(buildWordbookData(loadRows()), data);
  assert.doesNotThrow(() => validateBuiltData(data, 1024 * 1024));
  const broken = JSON.parse(JSON.stringify(data));
  broken.books[0].indexes.push(999);
  assert.throws(() => validateBuiltData(broken), /词书索引无效/);
  assert.match(serializeWordbookData(data), /^\/\/ 此文件由构建脚本生成/);
});
