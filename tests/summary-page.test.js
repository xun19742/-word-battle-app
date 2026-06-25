// 总结页结构测试保证完成学习后会自动写入打卡记录。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSummary(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'summary', `index.${extension}`),
    'utf8',
  );
}

test('总结页完成学习后调用打卡服务', () => {
  const js = readSummary('js');
  const wxml = readSummary('wxml');
  assert.match(js, /checkin-service/);
  assert.match(js, /createWxCheckinStore/);
  assert.match(js, /applyCheckinSummary\(summary\)/);
  assert.match(js, /checkinMessage/);
  assert.match(wxml, /checkinMessage/);
  assert.match(wxml, /今日打卡已记录/);
});
