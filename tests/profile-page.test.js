// 我的资料页结构测试保证微信授权入口和保存逻辑不会被遗漏。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProfile(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'profile', `index.${extension}`),
    'utf8',
  );
}

test('我的资料页提供头像昵称授权和保存入口', () => {
  const js = readProfile('js');
  const wxml = readProfile('wxml');
  assert.match(js, /loadProfile/);
  assert.match(js, /chooseAvatar/);
  assert.match(js, /inputNickname/);
  assert.match(js, /saveProfile/);
  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /bindchooseavatar="chooseAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.match(wxml, /bindtap="saveProfile"/);
});
