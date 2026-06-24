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

test('页面主体点击显示词义并隔离答题按钮事件', () => {
  const wxmlPath = path.join(
    __dirname,
    '..',
    'miniprogram',
    'pages',
    'flashcard',
    'index.wxml',
  );
  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  assert.match(wxml, /class="page flashcard-page"[^>]*bindtap="revealCard"/);
  assert.match(wxml, /点击屏幕查看词义/);
  assert.doesNotMatch(wxml, />查看释义<\/button>/);
  assert.match(wxml, /catchtap="markUnknown"/);
  assert.match(wxml, /catchtap="markKnown"/);
  assert.match(wxml, /catchtap="next"/);
});

test('背词页使用独立深色主题和薄荷绿强调色', () => {
  const pageDir = path.join(
    __dirname,
    '..',
    'miniprogram',
    'pages',
    'flashcard',
  );
  const wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
  const pageConfig = JSON.parse(
    fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8'),
  );

  assert.match(wxss, /linear-gradient\(160deg, #171d3c, #343b77\)/);
  assert.match(wxss, /#a9f0d1/);
  assert.match(wxss, /animation: meaning-fade-in 200ms ease-out/);
  assert.equal(pageConfig.navigationBarBackgroundColor, '#171D3C');
  assert.equal(pageConfig.backgroundColor, '#171D3C');
});

test('背词页和答题页只在存在例句时渲染例句区域', () => {
  const flashcardWxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'flashcard', 'index.wxml'),
    'utf8',
  );
  const quizWxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'quiz', 'index.wxml'),
    'utf8',
  );

  assert.match(flashcardWxml, /wx:if="{{currentWord\.example}}"/);
  assert.match(flashcardWxml, /wx:if="{{currentWord\.exampleTranslation}}"/);
  assert.match(quizWxml, /wx:if="{{currentWord\.example}}"/);
  assert.match(quizWxml, /wx:if="{{currentWord\.exampleTranslation}}"/);
});
