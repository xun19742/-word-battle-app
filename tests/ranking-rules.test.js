// 排行榜纯规则测试保证云函数只返回公开字段，并按指定榜单稳定排序。
const test = require('node:test');
const assert = require('node:assert/strict');

function loadRules() {
  const rulesPath = require.resolve('../cloudfunctions/ranking/ranking-rules');
  delete require.cache[rulesPath];
  return require(rulesPath);
}

const sampleUsers = [
  {
    _openid: 'hidden-1',
    nickname: '低分用户',
    avatarUrl: 'a.png',
    battleScore: 10,
    battleWins: 5,
    battlePlayed: 6,
    selectedWordbookId: 'cet4',
  },
  {
    _openid: 'hidden-2',
    nickname: '高分用户',
    avatarUrl: '',
    battleScore: 30,
    battleWins: 2,
    battlePlayed: 3,
  },
  {
    _openid: 'hidden-3',
    nickname: '',
    battleScore: '20',
    battleWins: '9',
    battlePlayed: 'bad',
  },
];

test('积分榜按 battleScore 降序并只返回公开字段', () => {
  const { buildRankingList } = loadRules();
  const list = buildRankingList(sampleUsers, 'battleScore');

  assert.deepEqual(list.map((item) => item.nickname), ['高分用户', 'WordRush 用户', '低分用户']);
  assert.deepEqual(list.map((item) => item.rank), [1, 2, 3]);
  assert.equal(list[0].battleScore, 30);
  assert.equal(list[1].battleScore, 20);
  assert.equal(list[1].battlePlayed, 0);
  assert.equal(Object.hasOwn(list[0], '_openid'), false);
  assert.equal(Object.hasOwn(list[0], 'selectedWordbookId'), false);
});

test('胜场榜按 battleWins 降序', () => {
  const { buildRankingList } = loadRules();
  const list = buildRankingList(sampleUsers, 'battleWins');

  assert.deepEqual(list.map((item) => item.nickname), ['WordRush 用户', '低分用户', '高分用户']);
  assert.deepEqual(list.map((item) => item.battleWins), [9, 5, 2]);
});

test('榜单类型和排序字段可校验', () => {
  const { getRankingSortField, isValidRankingType } = loadRules();

  assert.equal(isValidRankingType('battleScore'), true);
  assert.equal(isValidRankingType('battleWins'), true);
  assert.equal(isValidRankingType('other'), false);
  assert.equal(getRankingSortField('battleScore'), 'battleScore');
  assert.equal(getRankingSortField('battleWins'), 'battleWins');
  assert.throws(() => getRankingSortField('other'), /排行榜类型无效/);
});

test('限制最多返回五十条排行记录', () => {
  const { buildRankingList } = loadRules();
  const users = Array.from({ length: 60 }, (_, index) => ({
    nickname: `用户${index}`,
    battleScore: index,
    battleWins: index,
    battlePlayed: index,
  }));
  const list = buildRankingList(users, 'battleScore');

  assert.equal(list.length, 50);
  assert.equal(list[0].nickname, '用户59');
  assert.equal(list[49].nickname, '用户10');
});

test('排行榜云函数读取 users 集合并按榜单字段排序', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'ranking', 'index.js'),
    'utf8',
  );

  assert.match(source, /collection\('users'\)/);
  assert.match(source, /getRankingSortField\(type\)/);
  assert.match(source, /orderBy\(sortField,\s*'desc'\)/);
  assert.match(source, /limit\(50\)/);
  assert.match(source, /buildRankingList\(snapshot\.data,\s*type\)/);
  assert.match(source, /排行榜类型无效/);
});
