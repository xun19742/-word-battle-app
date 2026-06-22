// 背词页测试直接加载页面配置，验证交互状态而不依赖微信运行时。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadPageConfig() {
  let pageConfig;
  global.Page = (config) => {
    pageConfig = config;
  };
  const pagePath = require.resolve('../miniprogram/pages/flashcard/index');
  delete require.cache[pagePath];
  require(pagePath);
  delete global.Page;
  return pageConfig;
}

test('有效回忆状态下点击页面显示词义', () => {
  const pageConfig = loadPageConfig();
  const updates = [];
  const context = {
    data: {
      round: { answeredCurrent: false },
      currentWord: { word: 'achieve' },
      revealed: false,
    },
    setData(value) {
      updates.push(value);
    },
  };

  pageConfig.revealCard.call(context);

  assert.deepEqual(updates, [{ revealed: true }]);
});

test('无效或已完成的回忆状态不会重复显示词义', () => {
  const pageConfig = loadPageConfig();
  const states = [
    { round: null, currentWord: null, revealed: false },
    { round: { answeredCurrent: false }, currentWord: null, revealed: false },
    { round: { answeredCurrent: false }, currentWord: { word: 'achieve' }, revealed: true },
    { round: { answeredCurrent: true }, currentWord: { word: 'achieve' }, revealed: true },
  ];

  states.forEach((data) => {
    let updateCount = 0;
    pageConfig.revealCard.call({
      data,
      setData() {
        updateCount += 1;
      },
    });
    assert.equal(updateCount, 0);
  });
});
