// 项目结构测试保证微信开发者工具读取正确的目录和首页。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('项目配置指向小程序与云函数目录', () => {
  const configPath = path.join(__dirname, '..', 'project.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.miniprogramRoot, 'miniprogram/');
  assert.equal(config.cloudfunctionRoot, 'cloudfunctions/');
});

test('首页是应用的第一个页面', () => {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  assert.equal(app.pages[0], 'pages/home/index');
});

test('应用注册学习设置页', () => {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  assert.equal(app.pages.includes('pages/settings/index'), true);
});

test('应用注册单词卡片页', () => {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  assert.equal(app.pages.includes('pages/flashcard/index'), true);
});
