// 项目结构测试保证微信开发者工具读取正确目录和页面注册。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readApp() {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  return JSON.parse(fs.readFileSync(appPath, 'utf8'));
}

test('项目配置指向小程序与云函数目录', () => {
  const configPath = path.join(__dirname, '..', 'project.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.miniprogramRoot, 'miniprogram/');
  assert.equal(config.cloudfunctionRoot, 'cloudfunctions/');
});

test('首页是应用的第一个页面', () => {
  const app = readApp();
  assert.equal(app.pages[0], 'pages/home/index');
});

test('应用注册学习设置页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/settings/index'), true);
});

test('应用注册单词卡片页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/flashcard/index'), true);
});

test('应用注册四选一练习页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/quiz/index'), true);
});

test('应用注册总结与错词页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/summary/index'), true);
  assert.equal(app.pages.includes('pages/wrong-words/index'), true);
});

test('应用注册词书选择页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/wordbooks/index'), true);
});

test('应用注册我的资料页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/profile/index'), true);
});

test('应用注册打卡记录页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/checkin/index'), true);
});

test('应用注册排行榜页', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/ranking/index'), true);
});

test('应用注册好友对战页面', () => {
  const app = readApp();
  assert.equal(app.pages.includes('pages/battle/index'), true);
  assert.equal(app.pages.includes('pages/battle-room/index'), true);
});

test('首页展示云端状态提示区域', () => {
  const homePath = path.join(__dirname, '..', 'miniprogram', 'pages', 'home', 'index.wxml');
  const home = fs.readFileSync(homePath, 'utf8');
  assert.match(home, /cloudMessage/);
});
