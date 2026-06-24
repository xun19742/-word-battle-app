// CSV 解析器测试覆盖 ECDICT 可能出现的引号、逗号和字段内换行。
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsvText } = require('../scripts/csv-parser');

test('解析带引号逗号、双引号和换行的 CSV', () => {
  const source = [
    'word,translation,tag',
    '"alpha, beta","第一行""引文""\n第二行","cet4 cet6"',
    'plain,普通,cet4',
    '',
  ].join('\r\n');

  assert.deepEqual(parseCsvText(source), [
    {
      word: 'alpha, beta',
      translation: '第一行"引文"\n第二行',
      tag: 'cet4 cet6',
    },
    { word: 'plain', translation: '普通', tag: 'cet4' },
  ]);
});
