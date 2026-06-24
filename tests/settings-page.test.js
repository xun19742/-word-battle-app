// 页面静态测试用于约束设置页、总结页和错词页必须接入新的词书计划模型。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('设置页提供每日新词数量和复习比例入口', () => {
  const js = read('miniprogram/pages/settings/index.js');
  const wxml = read('miniprogram/pages/settings/index.wxml');

  assert.match(js, /changeDailyNewWords/);
  assert.match(js, /inputDailyNewWords/);
  assert.match(js, /changeReviewRatio/);
  assert.match(js, /reviewTarget/);
  assert.doesNotMatch(js, /roundSize/);
  assert.doesNotMatch(js, /changeRoundSize/);

  assert.match(wxml, /slider[^>]*min="5"[^>]*max="500"[^>]*step="5"/);
  assert.match(wxml, /type="number"/);
  assert.match(wxml, /bindchange="changeDailyNewWords"/);
  assert.match(wxml, /bindblur="inputDailyNewWords"/);
  assert.match(wxml, /bindchange="changeReviewRatio"/);
  assert.match(wxml, /value="1"/);
  assert.match(wxml, /value="2"/);
  assert.match(wxml, /value="3"/);
});

test('总结页继续当前词书和学习类型的下一轮计划', () => {
  const js = read('miniprogram/pages/summary/index.js');

  assert.match(js, /getWordbook/);
  assert.match(js, /buildStudyPlan/);
  assert.match(js, /summary\.wordbookId/);
  assert.match(js, /summary\.studyType/);
  assert.match(js, /listRecords\(book\.id\)/);
  assert.doesNotMatch(js, /getBuiltinWordbook/);
  assert.doesNotMatch(js, /settings\.roundSize/);
});

test('错词页只读取当前词书的错词记录', () => {
  const js = read('miniprogram/pages/wrong-words/index.js');

  assert.match(js, /loadSettings/);
  assert.match(js, /getWordbook/);
  assert.match(js, /listWrongWordIds\(book\.id\)/);
  assert.match(js, /getRecord\(book\.id, word\.id\)/);
  assert.match(js, /studyType:\s*'review'/);
  assert.doesNotMatch(js, /getBuiltinWordbook/);
  assert.doesNotMatch(js, /listWrongWordIds\(\)/);
});
