const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readPage(page, extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', page, `index.${extension}`),
    'utf8',
  );
}

test('对战首页提供创建房间、输入房间号和玩法说明', () => {
  const js = readPage('battle', 'js');
  const wxml = readPage('battle', 'wxml');
  const wxss = readPage('battle', 'wxss');

  assert.match(js, /battle-question-builder/);
  assert.match(js, /createRoom/);
  assert.match(js, /joinRoom/);
  assert.match(wxml, /创建好友房间/);
  assert.match(wxml, /输入房间号/);
  assert.match(wxml, /好友邀请/);
  assert.match(wxss, /\.battle-card/);
});

test('对战房间页提供等待、答题、结算和分享能力', () => {
  const js = readPage('battle-room', 'js');
  const wxml = readPage('battle-room', 'wxml');
  const wxss = readPage('battle-room', 'wxss');

  assert.match(js, /watchRoom/);
  assert.match(js, /setReady/);
  assert.match(js, /startRoom/);
  assert.match(js, /submitAnswer/);
  assert.match(js, /onShareAppMessage/);
  assert.match(js, /globalData\.openid/);
  assert.match(wxml, /等待好友/);
  assert.match(wxml, /开始对战/);
  assert.match(wxml, /等待好友完成/);
  assert.match(wxml, /查看排行榜/);
  assert.match(wxss, /\.score-board/);
});
