# WordRush Multi-Wordbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加四级、六级、考研、雅思四本离线词书，并提供每日 5-500 个新词和 `1:1 / 1:2 / 1:3` 复习计划。

**Architecture:** 构建脚本从固定版本 ECDICT CSV 生成一份去重共享词条表和四份索引，运行时由词书服务还原单本词书。设置服务、学习计划服务和学习仓库分别负责参数标准化、下一轮选词和按词书隔离进度；页面只展示状态并调用这些服务。

**Tech Stack:** 原生微信小程序、Node.js、`node:test`、项目内流式 CSV 解析器、微信云开发

---

## 执行修订

Windows 隔离环境无法读取由提权包管理器创建的依赖文件，因此执行时移除了 `csv-parse`。Task 1 改为先用 `tests/csv-parser.test.js` 驱动 `scripts/csv-parser.js`，覆盖引号逗号、双引号和字段内换行；`tests/wordbook-builder.test.js` 使用 `parseCsvText` 读取固定样例。`build-exam-wordbooks.js` 使用 `createCsvParser` 流式处理 UTF-8 CSV，不在内存保存完整 66 MB 数据文件。此修订不改变生成数据格式、ECDICT 固定版本或后续任务接口。

## 文件结构

- Create: `scripts/csv-parser.js`：零依赖流式解析 ECDICT CSV。
- Create: `scripts/wordbook-builder.js`：纯函数清洗、去重、排序和验证 ECDICT 行。
- Create: `scripts/build-exam-wordbooks.js`：流式读取 CSV 并写出紧凑词书数据。
- Create: `tests/fixtures/ecdict-sample.csv`：生成器固定测试样例。
- Create: `tests/csv-parser.test.js`：验证 CSV 引号、逗号和字段内换行。
- Create: `tests/wordbook-builder.test.js`：验证标签、去重、稳定排序和大小门槛。
- Create: `miniprogram/data/exam-wordbooks.generated.js`：机械生成的四本完整词书数据。
- Create: `THIRD_PARTY_NOTICES.md`：ECDICT 来源和 MIT 许可声明。
- Create: `miniprogram/services/study-plan-service.js`：选择新词或复习词并限制每轮 10 词。
- Create: `tests/study-plan-service.test.js`：验证目标余量和复习优先级。
- Create: `miniprogram/pages/wordbooks/index.js|json|wxml|wxss`：词书选择页。
- Modify: `package.json`：增加词书构建命令。
- Modify: `miniprogram/services/wordbook-service.js`：多词书清单、读取与兼容验证。
- Modify: `miniprogram/services/settings-service.js`：新设置结构与旧设置迁移。
- Modify: `miniprogram/services/learning-repository.js`：按词书隔离记录并区分新词/复习。
- Modify: `miniprogram/utils/round-engine.js`：轮次和总结携带词书及学习类型。
- Modify: `miniprogram/pages/home/*`：双进度、双入口和当前词书。
- Modify: `miniprogram/pages/settings/*`：新词数量与复习比例。
- Modify: `miniprogram/pages/summary/index.js`、`miniprogram/pages/wrong-words/index.js`：继续当前词书计划。
- Modify: `miniprogram/pages/flashcard/index.wxml`、`miniprogram/pages/quiz/index.wxml`：隐藏缺失例句。
- Modify: `miniprogram/app.json`：注册词书选择页。
- Modify: `cloudfunctions/login/user-rules.js`、`cloudfunctions/login/index.js`：同步新设置。
- Modify: `cloudfunctions/sync-learning/learning-rules.js`、`cloudfunctions/sync-learning/index.js`：同步词书和学习类型。
- Modify: affected tests：迁移旧断言并增加回归覆盖。

### Task 1: ECDICT 词书生成器与许可声明

**Files:**
- Create: `scripts/wordbook-builder.js`
- Create: `scripts/build-exam-wordbooks.js`
- Create: `tests/fixtures/ecdict-sample.csv`
- Create: `tests/wordbook-builder.test.js`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`
- Create/Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 安装固定 CSV 解析器**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' add -D csv-parse@7.0.0
```

Expected: `package.json` 出现 `devDependencies.csv-parse: "7.0.0"`，生成或更新 `pnpm-lock.yaml`。

- [ ] **Step 2: 写入生成器失败测试和固定 CSV 样例**

创建 `tests/fixtures/ecdict-sample.csv`：

```csv
word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
alpha,ˈælfə,,n. 阿尔法,,,,cet4 cet6,100,90,,,
beta,ˈbiːtə,,n. 贝塔,,,,cet4 ky,200,180,,,
gamma,ˈɡæmə,,n. 伽马,,,,cet6 ielts,300,250,,,
delta,ˈdeltə,,n. 德尔塔,,,,ky ielts,400,350,,,
empty,,, ,,,,cet4,500,450,,,
```

创建 `tests/wordbook-builder.test.js`：

```js
// 生成器测试保证考试标签、共享词条和稳定输出都可重复。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const {
  buildWordbookData,
  serializeWordbookData,
  validateBuiltData,
} = require('../scripts/wordbook-builder');

function loadRows() {
  const source = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'ecdict-sample.csv'),
    'utf8',
  );
  return parse(source, { columns: true, skip_empty_lines: true });
}

test('按四类考试标签生成共享词条和词书索引', () => {
  const data = buildWordbookData(loadRows());
  assert.equal(data.entries.length, 4);
  assert.deepEqual(
    data.books.map((book) => [book.id, book.indexes.length]),
    [['cet4', 2], ['cet6', 2], ['postgraduate', 2], ['ielts', 2]],
  );
  assert.equal(data.entries.filter((entry) => entry[0] === 'alpha').length, 1);
});

test('生成结果稳定且拒绝损坏索引', () => {
  const data = buildWordbookData(loadRows());
  assert.deepEqual(buildWordbookData(loadRows()), data);
  assert.doesNotThrow(() => validateBuiltData(data, 1024 * 1024));
  const broken = JSON.parse(JSON.stringify(data));
  broken.books[0].indexes.push(999);
  assert.throws(() => validateBuiltData(broken), /词书索引无效/);
  assert.match(serializeWordbookData(data), /^\/\/ 此文件由构建脚本生成/);
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
$node = 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --test tests\wordbook-builder.test.js
```

Expected: FAIL with `Cannot find module '../scripts/wordbook-builder'`。

- [ ] **Step 4: 创建纯生成器模块**

创建 `scripts/wordbook-builder.js`：

```js
const BOOKS = [
  { id: 'cet4', tag: 'cet4', name: '大学英语四级', description: '大学英语四级考试词汇' },
  { id: 'cet6', tag: 'cet6', name: '大学英语六级', description: '大学英语六级考试词汇' },
  { id: 'postgraduate', tag: 'ky', name: '考研英语', description: '全国硕士研究生招生考试英语词汇' },
  { id: 'ielts', tag: 'ielts', name: '雅思词汇', description: 'IELTS 考试词汇' },
];

function compactText(value) {
  return String(value || '').trim().replace(/\r?\n+/g, '；');
}

function normalizeRow(row) {
  const word = compactText(row.word).toLowerCase();
  const meaning = compactText(row.translation);
  if (!word || !meaning) return null;
  const tags = new Set(compactText(row.tag).split(/\s+/).filter(Boolean));
  const rank = Number(row.frq) || Number(row.bnc) || Number.MAX_SAFE_INTEGER;
  return { word, phonetic: compactText(row.phonetic), meaning, tags, rank };
}

function createWordbookAccumulator() {
  const words = new Map();
  return {
    addRow(row) {
      const item = normalizeRow(row);
      if (!item || !BOOKS.some((book) => item.tags.has(book.tag))) return;
      const current = words.get(item.word);
      if (!current) {
        words.set(item.word, item);
        return;
      }
      item.tags.forEach((tag) => current.tags.add(tag));
      if (item.rank < current.rank) {
        current.rank = item.rank;
        current.phonetic = item.phonetic || current.phonetic;
        current.meaning = item.meaning;
      }
    },
    build() {
      const ordered = [...words.values()].sort((left, right) => (
        left.rank - right.rank
        || (left.word < right.word ? -1 : left.word > right.word ? 1 : 0)
      ));
      const positions = new Map(ordered.map((item, index) => [item.word, index]));
      return {
        source: {
          name: 'ECDICT',
          license: 'MIT',
          commit: 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b',
        },
        entries: ordered.map((item) => [item.word, item.phonetic, item.meaning]),
        books: BOOKS.map((book) => ({
          ...book,
          indexes: ordered
            .filter((item) => item.tags.has(book.tag))
            .map((item) => positions.get(item.word)),
        })),
      };
    },
  };
}

function buildWordbookData(rows) {
  const accumulator = createWordbookAccumulator();
  rows.forEach((row) => accumulator.addRow(row));
  return accumulator.build();
}

function serializeWordbookData(data) {
  return `// 此文件由构建脚本生成，请勿手工修改。\nmodule.exports=${JSON.stringify(data)};\n`;
}

function validateBuiltData(data, maxBytes = 1.8 * 1024 * 1024) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.books)) {
    throw new Error('生成词书格式错误');
  }
  data.books.forEach((book) => {
    if (!book.indexes.length) throw new Error(`词书为空：${book.id}`);
    if (book.indexes.some((index) => !data.entries[index])) {
      throw new Error(`词书索引无效：${book.id}`);
    }
  });
  if (Buffer.byteLength(serializeWordbookData(data), 'utf8') > maxBytes) {
    throw new Error('生成词书超过 1.8 MB');
  }
}

module.exports = {
  BOOKS,
  buildWordbookData,
  createWordbookAccumulator,
  serializeWordbookData,
  validateBuiltData,
};
```

- [ ] **Step 5: 创建流式构建入口**

创建 `scripts/build-exam-wordbooks.js`：

```js
// 从固定 ECDICT CSV 生成小程序可直接 require 的紧凑词书数据。
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse');
const {
  createWordbookAccumulator,
  serializeWordbookData,
  validateBuiltData,
} = require('./wordbook-builder');

const source = process.argv[2];
const target = process.argv[3] || path.join(
  __dirname,
  '..',
  'miniprogram',
  'data',
  'exam-wordbooks.generated.js',
);
if (!source) throw new Error('请提供 ECDICT CSV 路径');

const accumulator = createWordbookAccumulator();
fs.createReadStream(source)
  .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }))
  .on('data', (row) => accumulator.addRow(row))
  .on('end', () => {
    const data = accumulator.build();
    validateBuiltData(data);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serializeWordbookData(data));
    console.log(`已生成 ${data.books.length} 本词书，共 ${data.entries.length} 个共享词条`);
  });
```

在 `package.json` 的 `scripts` 中增加：

```json
"build:wordbooks": "node scripts/build-exam-wordbooks.js"
```

- [ ] **Step 6: 添加第三方声明**

创建 `THIRD_PARTY_NOTICES.md`，写明 ECDICT、仓库链接、固定提交 `bc015ed...`、MIT License，并附完整 MIT 许可证正文。

- [ ] **Step 7: 运行测试并提交**

Run:

```powershell
& $node --test tests\wordbook-builder.test.js
```

Expected: 2 tests PASS。

Commit:

```powershell
git add package.json pnpm-lock.yaml scripts tests/fixtures tests/wordbook-builder.test.js THIRD_PARTY_NOTICES.md
git commit -m "feat: add licensed wordbook generator"
```

### Task 2: 生成完整词书并升级词书服务

**Files:**
- Create: `miniprogram/data/exam-wordbooks.generated.js`
- Modify: `miniprogram/services/wordbook-service.js`
- Modify: `tests/wordbook-service.test.js`

- [ ] **Step 1: 增加失败的多词书服务测试**

在 `tests/wordbook-service.test.js` 增加：

```js
const {
  listWordbooks,
  getWordbook,
  isValidWordbookId,
} = require('../miniprogram/services/wordbook-service');

test('列出四本完整考试词书并读取独立副本', () => {
  const books = listWordbooks();
  assert.deepEqual(books.slice(0, 4).map((book) => book.id), [
    'cet4', 'cet6', 'postgraduate', 'ielts',
  ]);
  assert.equal(books.every((book) => book.wordCount > 0), true);
  const first = getWordbook('cet4');
  const second = getWordbook('cet4');
  first.words[0].meaning = '已修改';
  assert.notEqual(second.words[0].meaning, '已修改');
  assert.equal(isValidWordbookId('ielts'), true);
  assert.equal(isValidWordbookId('missing'), false);
});

test('多词书允许缺少例句但拒绝空释义', () => {
  const valid = {
    id: 'sample', name: '样例',
    words: [{ id: 'sample-a', word: 'alpha', phonetic: '', meaning: 'n. 阿尔法', order: 1 }],
  };
  assert.deepEqual(validateWordbook(valid), []);
  valid.words[0].meaning = '';
  assert.match(validateWordbook(valid)[0], /meaning/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\wordbook-service.test.js`

Expected: FAIL because `listWordbooks` is not exported。

- [ ] **Step 3: 下载固定 CSV 并生成数据**

Run:

```powershell
$source = Join-Path $env:TEMP 'wordrush-ecdict-bc015ed.csv'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv' -OutFile $source
& $node scripts\build-exam-wordbooks.js $source
```

Expected: 输出 `已生成 4 本词书，共 7836 个共享词条`；四本词数分别为 3849、5407、4801、5040，生成文件小于 1.8 MB。

- [ ] **Step 4: 完整替换词书服务**

将 `miniprogram/services/wordbook-service.js` 改为：

```js
const legacyBook = require('../data/cet4-core-100');
const generated = require('../data/exam-wordbooks.generated');

const REQUIRED_FIELDS = ['id', 'word', 'meaning', 'order'];

function expandBook(book) {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    source: generated.source.name,
    words: book.indexes.map((entryIndex, order) => {
      const [word, phonetic, meaning] = generated.entries[entryIndex];
      return {
        id: `ecdict-${entryIndex}`, word, phonetic, meaning,
        example: '', exampleTranslation: '', difficulty: 1, order: order + 1,
      };
    }),
  };
}

function listWordbooks() {
  return [
    ...generated.books.map((book) => ({
      id: book.id, name: book.name, description: book.description,
      wordCount: book.indexes.length, source: generated.source.name,
    })),
    {
      id: legacyBook.id, name: legacyBook.name,
      description: legacyBook.description, wordCount: legacyBook.words.length,
      source: 'WordRush',
    },
  ];
}

function isValidWordbookId(bookId) {
  return listWordbooks().some((book) => book.id === bookId);
}

function getWordbook(bookId = 'cet4') {
  if (bookId === legacyBook.id) {
    return { ...legacyBook, words: legacyBook.words.map((word) => ({ ...word })) };
  }
  const book = generated.books.find((item) => item.id === bookId)
    || generated.books.find((item) => item.id === 'cet4');
  return expandBook(book);
}

function getBuiltinWordbook() {
  return getWordbook('cet4-core-100');
}

function validateWordbook(book) {
  if (!book || !Array.isArray(book.words) || !book.words.length) return ['词书格式错误'];
  const errors = [];
  const seen = new Set();
  book.words.forEach((word, index) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (word[field] === undefined || word[field] === '') {
        errors.push(`第 ${index + 1} 个单词缺少 ${field}`);
      }
    });
    if (seen.has(word.word)) errors.push(`单词重复：${word.word}`);
    seen.add(word.word);
  });
  return errors;
}

module.exports = {
  getBuiltinWordbook,
  getWordbook,
  isValidWordbookId,
  listWordbooks,
  validateWordbook,
};
```

- [ ] **Step 5: 运行测试、检查体积并提交**

Run:

```powershell
& $node --test tests\wordbook-service.test.js tests\wordbook-builder.test.js
(Get-Item miniprogram\data\exam-wordbooks.generated.js).Length
```

Expected: all tests PASS；文件大小小于 1,887,437 bytes。

Commit:

```powershell
git add miniprogram/data/exam-wordbooks.generated.js miniprogram/services/wordbook-service.js tests/wordbook-service.test.js
git commit -m "feat: add four built-in exam wordbooks"
```

### Task 3: 新设置模型和云端设置规则

**Files:**
- Modify: `miniprogram/services/settings-service.js`
- Modify: `tests/settings-service.test.js`
- Modify: `cloudfunctions/login/user-rules.js`
- Modify: `tests/user-settings-rules.test.js`

- [ ] **Step 1: 将设置测试改为新模型**

替换 `tests/settings-service.test.js` 的三个断言，覆盖默认值、边界、步长和旧数据迁移：

```js
test('空设置使用默认词书、25 个新词和一比二复习', () => {
  assert.deepEqual(normalizeSettings({}), {
    defaultMode: 'flashcard', selectedWordbookId: 'cet4',
    dailyNewWords: 25, reviewRatio: 2,
  });
});

test('新词数量限制到五至五百并对齐五的倍数', () => {
  assert.equal(normalizeSettings({ dailyNewWords: 2 }).dailyNewWords, 5);
  assert.equal(normalizeSettings({ dailyNewWords: 503 }).dailyNewWords, 500);
  assert.equal(normalizeSettings({ dailyNewWords: 27 }).dailyNewWords, 25);
});

test('旧设置保留模式并迁移到新默认值', () => {
  assert.deepEqual(normalizeSettings({ defaultMode: 'quiz', roundSize: 20 }), {
    defaultMode: 'quiz', selectedWordbookId: 'cet4',
    dailyNewWords: 25, reviewRatio: 2,
  });
});
```

在 `tests/user-settings-rules.test.js` 把默认值和合法设置改为同一字段集合，并增加非法词数、比例、词书 ID 的拒绝断言。

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\settings-service.test.js tests\user-settings-rules.test.js`

Expected: FAIL because current settings still return `roundSize`。

- [ ] **Step 3: 实现本地设置标准化**

在 `settings-service.js` 中使用：

```js
const { isValidWordbookId } = require('./wordbook-service');
const SETTINGS_KEY = 'wordrush.settings';

function normalizeDailyNewWords(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 25;
  return Math.min(500, Math.max(5, Math.round(number / 5) * 5));
}

function normalizeSettings(input = {}) {
  return {
    defaultMode: ['flashcard', 'quiz'].includes(input.defaultMode)
      ? input.defaultMode : 'flashcard',
    selectedWordbookId: isValidWordbookId(input.selectedWordbookId)
      ? input.selectedWordbookId : 'cet4',
    dailyNewWords: normalizeDailyNewWords(input.dailyNewWords),
    reviewRatio: [1, 2, 3].includes(Number(input.reviewRatio))
      ? Number(input.reviewRatio) : 2,
  };
}
```

保留现有 `loadSettings`、`saveSettings`，额外导出 `normalizeDailyNewWords`。

- [ ] **Step 4: 更新云端规则并验证**

`cloudfunctions/login/user-rules.js` 使用相同默认值；`validateCloudSettings` 明确检查模式、受支持词书 ID、5-500 且为 5 的倍数、比例 1-3。云函数不能引用小程序服务，因此在规则文件内维护 `WORDBOOK_IDS = ['cet4','cet6','postgraduate','ielts','cet4-core-100']`。

Run: `& $node --test tests\settings-service.test.js tests\user-settings-rules.test.js`

Expected: all tests PASS。

- [ ] **Step 5: 提交设置模型**

```powershell
git add miniprogram/services/settings-service.js cloudfunctions/login/user-rules.js tests/settings-service.test.js tests/user-settings-rules.test.js
git commit -m "feat: add daily word and review settings"
```

### Task 4: 学习计划服务与轮次元数据

**Files:**
- Create: `miniprogram/services/study-plan-service.js`
- Create: `tests/study-plan-service.test.js`
- Modify: `miniprogram/utils/round-engine.js`
- Modify: `tests/round-engine.test.js`

- [ ] **Step 1: 写学习计划失败测试**

创建 `tests/study-plan-service.test.js`，覆盖：新词排除已有记录；复习词中错词优先、再按 `lastStudiedAt` 升序；每日剩余不足 10 时缩短轮次；目标完成返回 `goal-complete`；没有候选返回 `no-words`。

测试调用接口固定为：

```js
const result = buildStudyPlan({
  book, records, today: { newCompleted: 20, reviewCompleted: 40 },
  settings: { dailyNewWords: 25, reviewRatio: 2 },
  studyType: 'new',
});
assert.equal(result.words.length, 5);
assert.equal(result.remaining, 5);
assert.equal(result.reason, 'ready');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\study-plan-service.test.js`

Expected: FAIL with missing module。

- [ ] **Step 3: 创建纯学习计划服务**

创建 `miniprogram/services/study-plan-service.js`：

```js
const ROUND_LIMIT = 10;

function recordKey(wordbookId, wordId) {
  return `${wordbookId}:${wordId}`;
}

function buildStudyPlan({ book, records = {}, today = {}, settings, studyType }) {
  const target = studyType === 'review'
    ? settings.dailyNewWords * settings.reviewRatio
    : settings.dailyNewWords;
  const completed = studyType === 'review'
    ? (today.reviewCompleted || 0) : (today.newCompleted || 0);
  const remaining = Math.max(0, target - completed);
  if (!remaining) return { words: [], remaining: 0, reason: 'goal-complete' };

  const candidates = book.words.filter((word) => {
    const record = records[recordKey(book.id, word.id)];
    return studyType === 'review' ? Boolean(record) : !record;
  });
  if (studyType === 'review') {
    candidates.sort((left, right) => {
      const leftRecord = records[recordKey(book.id, left.id)];
      const rightRecord = records[recordKey(book.id, right.id)];
      return Number(rightRecord.isWrongWord) - Number(leftRecord.isWrongWord)
        || String(leftRecord.lastStudiedAt || '').localeCompare(String(rightRecord.lastStudiedAt || ''));
    });
  }
  if (!candidates.length) return { words: [], remaining, reason: 'no-words' };
  return {
    words: candidates.slice(0, Math.min(ROUND_LIMIT, remaining)),
    remaining,
    reason: 'ready',
  };
}

module.exports = { ROUND_LIMIT, buildStudyPlan, recordKey };
```

- [ ] **Step 4: 给轮次和总结增加上下文**

扩展 `createRound(words, size, mode, random, context = {})`，返回对象加入：

```js
wordbookId: context.wordbookId || 'cet4-core-100',
studyType: ['new', 'review'].includes(context.studyType) ? context.studyType : 'new',
```

将每轮最大值从 20 改为 10。`getSummary` 原样返回 `wordbookId` 和 `studyType`。在 `tests/round-engine.test.js` 增加上下文与旧调用默认值断言。

- [ ] **Step 5: 运行测试并提交**

Run: `& $node --test tests\study-plan-service.test.js tests\round-engine.test.js`

Expected: all tests PASS。

Commit:

```powershell
git add miniprogram/services/study-plan-service.js miniprogram/utils/round-engine.js tests/study-plan-service.test.js tests/round-engine.test.js
git commit -m "feat: build daily new and review rounds"
```

### Task 5: 按词书迁移学习仓库

**Files:**
- Modify: `miniprogram/services/learning-repository.js`
- Modify: `tests/learning-repository.test.js`

- [ ] **Step 1: 增加失败的迁移和隔离测试**

增加测试：

```js
test('相同单词在不同词书中使用独立记录', () => {
  const { repository } = buildRepository();
  repository.applySummary({
    roundId: 'r1', wordbookId: 'cet4', studyType: 'new', score: 10, total: 1,
    answers: [{ wordId: 'ability', isCorrect: true, mode: 'flashcard' }],
  });
  repository.applySummary({
    roundId: 'r2', wordbookId: 'ielts', studyType: 'review', score: 0, total: 1,
    answers: [{ wordId: 'ability', isCorrect: false, mode: 'quiz' }],
  });
  assert.equal(repository.getRecord('cet4', 'ability').lastResult, 'correct');
  assert.equal(repository.getRecord('ielts', 'ability').lastResult, 'wrong');
  assert.deepEqual(repository.getTodaySummary(), {
    completed: 2, newCompleted: 1, reviewCompleted: 1, score: 10,
  });
});
```

增加旧 `records: { w1: {...} }` 自动迁移到 `cet4-core-100:w1` 的测试。

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\learning-repository.test.js`

Expected: FAIL because `getRecord` only accepts one ID and daily fields are absent。

- [ ] **Step 3: 实现迁移和新 API**

在仓库中引入 `recordKey`。`normalizeState` 遍历旧记录：已有冒号的键保持；无冒号的键使用记录内 `wordbookId` 或 `cet4-core-100` 生成新键。`applySummary` 使用 `summary.wordbookId || 'cet4-core-100'` 和 `summary.studyType || 'new'`，把这两个字段写入每条记录；每日分别增加 `newCompleted` 或 `reviewCompleted`，同时增加 `completed`。

API 改为：

```js
getRecord(wordbookId, wordId)
listRecords(wordbookId)
listWrongWordIds(wordbookId)
getTodaySummary()
```

`listRecords` 返回以 `${wordbookId}:${wordId}` 为键的对象，供学习计划服务直接使用。

- [ ] **Step 4: 运行全部仓库测试并提交**

Run: `& $node --test tests\learning-repository.test.js tests\round-storage.test.js`

Expected: all tests PASS。

Commit:

```powershell
git add miniprogram/services/learning-repository.js tests/learning-repository.test.js
git commit -m "feat: isolate learning progress by wordbook"
```

### Task 6: 词书选择页和首页双计划

**Files:**
- Create: `miniprogram/pages/wordbooks/index.js|json|wxml|wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/index.js|wxml|wxss`
- Modify: `tests/project-structure.test.js`
- Create: `tests/home-page.test.js`

- [ ] **Step 1: 增加失败的页面结构测试**

验证 `app.json` 注册 `pages/wordbooks/index`；首页包含 `openWordbooks`、`startNewWords`、`startReview`、`newProgressPercent`、`reviewProgressPercent`；词书页包含 `listWordbooks` 和 `selectWordbook`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\project-structure.test.js tests\home-page.test.js`

Expected: FAIL because page and handlers do not exist。

- [ ] **Step 3: 创建词书选择页**

页面 `onShow` 调用 `listWordbooks()` 和 `loadSettings()`；`selectWordbook` 调用 `saveSettings({...settings, selectedWordbookId})`、`saveSettingsToCloud`，成功后 `wx.navigateBack()`。WXML 用单列卡片展示名称、词数、来源和当前标记，所有代码注释使用中文。

- [ ] **Step 4: 改造首页数据与启动方法**

首页 `onShow` 读取 `getWordbook(settings.selectedWordbookId)`、仓库 `listRecords(book.id)` 和 `getTodaySummary()`。分别计算新词与复习百分比。

新增统一方法：

```js
startStudyType(studyType) {
  const settings = this.data.settings;
  const book = getWordbook(settings.selectedWordbookId);
  const repository = createWxLearningRepository();
  const plan = buildStudyPlan({
    book,
    records: repository.listRecords(book.id),
    today: repository.getTodaySummary(),
    settings,
    studyType,
  });
  if (plan.reason !== 'ready') {
    wx.showToast({
      title: plan.reason === 'goal-complete' ? '今日目标已完成' : '暂无可学习单词',
      icon: 'none',
    });
    return;
  }
  const mode = settings.defaultMode === 'quiz' && plan.words.length < 4
    ? 'flashcard' : settings.defaultMode;
  const round = createRound(plan.words, plan.words.length, mode, Math.random, {
    wordbookId: book.id,
    studyType,
  });
  saveRound(round);
  this.openRound(round);
}
```

`startNewWords()` 和 `startReview()` 分别调用该方法。首页 WXML 显示双进度、两个按钮和可点击词书卡片。

- [ ] **Step 5: 运行测试并提交**

Run: `& $node --test tests\project-structure.test.js tests\home-page.test.js`

Expected: all tests PASS。

Commit:

```powershell
git add miniprogram/app.json miniprogram/pages/home miniprogram/pages/wordbooks tests/project-structure.test.js tests/home-page.test.js
git commit -m "feat: add wordbook picker and daily plan home"
```

### Task 7: 设置页、总结页、错词页和可选例句

**Files:**
- Modify: `miniprogram/pages/settings/index.js|wxml|wxss`
- Modify: `miniprogram/pages/summary/index.js`
- Modify: `miniprogram/pages/wrong-words/index.js`
- Modify: `miniprogram/pages/flashcard/index.wxml`
- Modify: `miniprogram/pages/quiz/index.wxml`
- Create: `tests/settings-page.test.js`
- Modify: `tests/flashcard-page.test.js`

- [ ] **Step 1: 增加失败的 UI 测试**

验证设置页存在 `slider min="5" max="500" step="5"`、数字输入和比例 1/2/3；验证背词与答题页用 `wx:if="{{currentWord.example}}"` 包住例句区域；验证总结和错词页不再调用 `getBuiltinWordbook()`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\settings-page.test.js tests\flashcard-page.test.js`

Expected: FAIL on missing slider and conditional examples。

- [ ] **Step 3: 改造设置页**

设置页数据增加 `reviewTarget`。滑块 `changeDailyNewWords`、输入框 `inputDailyNewWords` 均调用 `persist`；比例 `changeReviewRatio` 保存 1/2/3。每次保存后用标准化结果更新 `reviewTarget = dailyNewWords * reviewRatio`。保留默认模式设置。

- [ ] **Step 4: 更新总结与错词流程**

总结页“再练一轮”根据 `summary.wordbookId`、`summary.studyType`、当前仓库和设置调用 `buildStudyPlan`；没有下一轮时返回首页并提示。错词页只读取当前 `selectedWordbookId`，使用 `getWordbook`、`listWrongWordIds(book.id)` 和 `getRecord(book.id, word.id)`，创建轮次时标记 `studyType: 'review'`。

- [ ] **Step 5: 隐藏缺失例句并验证**

卡片页和答题反馈中，只有 `currentWord.example` 非空时才渲染例句；翻译需要同时存在才渲染。

Run: `& $node --test tests\settings-page.test.js tests\flashcard-page.test.js`

Expected: all tests PASS。

- [ ] **Step 6: 提交页面联动**

```powershell
git add miniprogram/pages/settings miniprogram/pages/summary/index.js miniprogram/pages/wrong-words/index.js miniprogram/pages/flashcard/index.wxml miniprogram/pages/quiz/index.wxml tests/settings-page.test.js tests/flashcard-page.test.js
git commit -m "feat: connect daily settings and wordbook progress"
```

### Task 8: 云同步携带词书和学习类型

**Files:**
- Modify: `cloudfunctions/login/index.js`
- Modify: `cloudfunctions/sync-learning/learning-rules.js`
- Modify: `cloudfunctions/sync-learning/index.js`
- Modify: `tests/sync-learning.test.js`
- Modify: `tests/user-settings-rules.test.js`

- [ ] **Step 1: 增加失败的云同步测试**

`validateSummary` 合法样例必须返回 `wordbookId` 和 `studyType`；非法词书或类型抛错；旧样例缺失字段时回落到 `cet4-core-100` 和 `new`。设置规则测试覆盖完整新模型。

- [ ] **Step 2: 运行测试并确认失败**

Run: `& $node --test tests\sync-learning.test.js tests\user-settings-rules.test.js`

Expected: FAIL because cloud rules still use `roundSize` and sync hardcodes legacy book。

- [ ] **Step 3: 更新云端规则和写入字段**

`validateSummary` 复制并返回标准化对象，不直接信任原输入。允许的词书与 Task 3 一致，允许类型为 `new/review`。`sync-learning/index.js` 的记录 ID 改为 `${OPENID}_${wordbookId}_${wordId}`，写入真实 `wordbookId` 和 `studyType`；轮次文档也保存这两个字段。用户文档保存 `defaultMode`、`selectedWordbookId`、`dailyNewWords` 和 `reviewRatio`。

`login/index.js` 使用新字段创建和更新用户，读取旧用户时通过 `validateCloudSettings` 迁移默认值。

- [ ] **Step 4: 运行测试并提交**

Run: `& $node --test tests\sync-learning.test.js tests\user-settings-rules.test.js tests\cloud-api.test.js`

Expected: all tests PASS。

Commit:

```powershell
git add cloudfunctions/login cloudfunctions/sync-learning tests/sync-learning.test.js tests/user-settings-rules.test.js
git commit -m "feat: sync wordbook learning metadata"
```

### Task 9: 文档、全量验证与微信开发者工具验收

**Files:**
- Modify: `README.md`
- Verify: all changed files

- [ ] **Step 1: 更新 README**

记录四本词书的来源、词数、固定 ECDICT 提交、生成命令、默认每日 25 个新词和 1:2 复习规则。说明个人 CSV 导入不在本期。

- [ ] **Step 2: 运行全部测试**

Run:

```powershell
& $node --test
```

Expected: 全部测试 PASS，0 failures。

- [ ] **Step 3: 检查 JavaScript、JSON 与生成数据**

Run:

```powershell
Get-ChildItem miniprogram,cloudfunctions,scripts,tests -Recurse -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript 语法检查失败：$($_.FullName)" }
}
Get-ChildItem miniprogram,cloudfunctions -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Encoding UTF8 -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
if ((Get-Item miniprogram\data\exam-wordbooks.generated.js).Length -gt 1887437) {
  throw '生成词书超过 1.8 MB'
}
```

Expected: 退出码 0；生成数据约 774 KB。

- [ ] **Step 4: 在微信开发者工具手工验收**

1. 编译无红色错误。
2. 依次切换四级、六级、考研、雅思，首页名称与词数正确。
3. 设置新词为 500，确认保存；恢复 25，比例选择 1:1、1:2、1:3 时复习目标分别为 25、50、75。
4. 学习一轮新词，首页新词进度增加，复习进度不增加。
5. 学习一轮复习词，复习进度增加；没有旧词时显示明确提示。
6. 同一个单词在两本词书中的记录互不覆盖。
7. 没有例句的词只显示单词、音标和释义，布局无空洞。

- [ ] **Step 5: 检查提交范围并提交文档**

Run:

```powershell
git diff --check
git status --short
```

Expected: 仅出现本功能文件；主目录中的 `project.config.json` 和 `project.private.config.json` 不进入功能提交。

Commit:

```powershell
git add README.md
git commit -m "docs: document built-in exam wordbooks"
```
