// 打卡记录页结构测试保证页面可以读取统计、展示列表和空状态。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readCheckin(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'checkin', `index.${extension}`),
    'utf8',
  );
}

test('打卡记录页读取打卡统计和最近记录', () => {
  const js = readCheckin('js');
  const wxml = readCheckin('wxml');
  assert.match(js, /checkin-service/);
  assert.match(js, /loadCheckinStats/);
  assert.match(js, /listCheckinDays\(30\)/);
  assert.match(wxml, /wx:for="{{days}}"/);
  assert.match(wxml, /连续打卡/);
  assert.match(wxml, /今日学习/);
  assert.match(wxml, /完成一轮学习后/);
});
