// 排行榜页面结构测试保证榜单切换、状态提示和列表字段不会遗漏。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRanking(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'ranking', `index.${extension}`),
    'utf8',
  );
}

test('排行榜页提供积分榜和胜场榜切换', () => {
  const js = readRanking('js');
  const wxml = readRanking('wxml');
  const wxss = readRanking('wxss');

  assert.match(js, /ranking-service/);
  assert.match(js, /loadRanking/);
  assert.match(js, /switchRanking/);
  assert.match(js, /battleScore/);
  assert.match(js, /battleWins/);
  assert.match(wxml, /积分榜/);
  assert.match(wxml, /胜场榜/);
  assert.match(wxml, /排行榜需要云服务/);
  assert.match(wxml, /还没有排行榜数据/);
  assert.match(wxml, /wx:for="{{list}}"/);
  assert.match(wxml, /battleScore/);
  assert.match(wxml, /battleWins/);
  assert.match(wxml, /battlePlayed/);
  assert.match(wxss, /\.ranking-card/);
});
