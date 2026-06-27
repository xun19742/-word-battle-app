const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readBattleFunction() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'battle', 'index.js'),
    'utf8',
  );
}

test('对战云函数提供房间全流程 action 并使用可信 OpenID', () => {
  const source = readBattleFunction();

  assert.match(source, /cloud\.getWXContext\(\)/);
  assert.match(source, /OPENID/);
  assert.match(source, /createRoom/);
  assert.match(source, /joinRoom/);
  assert.match(source, /setReady/);
  assert.match(source, /startRoom/);
  assert.match(source, /submitAnswer/);
  assert.match(source, /finishRoom/);
  assert.match(source, /collection\('battle_rooms'\)/);
  assert.match(source, /collection\('battle_records'\)/);
  assert.match(source, /collection\('users'\)/);
  assert.match(source, /getBattleStatDelta/);
});

test('保存房间时不会把文档 _id 写入 data', () => {
  const source = readBattleFunction();

  assert.match(source, /const \{ _id, \.\.\.data \} = room/);
  assert.match(source, /\.doc\(_id\)\.set\(\{ data \}\)/);
  assert.doesNotMatch(source, /\.doc\(room\._id\)\.set\(\{ data: room \}\)/);
});
