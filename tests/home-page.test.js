// 首页结构测试保证多词书和双学习计划入口不会被遗漏。
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

test('首页提供词书选择、双进度和两个学习入口', () => {
  const js = readPage('home', 'js');
  const wxml = readPage('home', 'wxml');
  assert.match(js, /getWordbook/);
  assert.match(js, /buildStudyPlan/);
  assert.match(js, /startNewWords\(\)/);
  assert.match(js, /startReview\(\)/);
  assert.match(js, /openWordbooks\(\)/);
  assert.match(wxml, /newProgressPercent/);
  assert.match(wxml, /reviewProgressPercent/);
  assert.match(wxml, /bindtap="startNewWords"/);
  assert.match(wxml, /bindtap="startReview"/);
  assert.match(wxml, /bindtap="openWordbooks"/);
});

test('词书页列出并保存用户选择', () => {
  const js = readPage('wordbooks', 'js');
  const wxml = readPage('wordbooks', 'wxml');
  assert.match(js, /listWordbooks/);
  assert.match(js, /selectWordbook/);
  assert.match(js, /selectedWordbookId/);
  assert.match(wxml, /wx:for="{{books}}"/);
  assert.match(wxml, /bindtap="selectWordbook"/);
});

test('首页双计划卡片在窄屏中不会横向溢出', () => {
  const wxss = readPage('home', 'wxss');

  assert.match(wxss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(wxss, /\.plan-card\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(wxss, /\.plan-card\s*\{[^}]*min-width:\s*0/);
  assert.match(wxss, /\.plan-button\s*\{[^}]*width:\s*100%/);
});
