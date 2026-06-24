# WordRush 微信授权、好友邀请对战与排行榜设计

## 目标

在现有背词 MVP 之上，增加三个互相衔接的能力：

1. 用户可以主动授权头像昵称，形成可展示的对战身份。
2. 用户可以创建 1v1 好友邀请房间，通过微信分享邀请好友加入。
3. 对战结束后记录战绩，并提供排行榜入口。

本期不做陌生人快速匹配，不做手机号授权，不做复杂实时通信。优先保证小程序可运行、流程闭环、云端数据可追踪。

## 用户流程

### 微信授权

用户从首页进入“我的”页面。页面展示当前登录状态：

- 未授权：展示默认头像、`WordRush 用户`、授权按钮。
- 已授权：展示微信头像、昵称、累计积分、胜场。

授权按钮由用户主动点击触发。小程序保存用户资料到本地缓存，并调用 `login` 云函数写入 `users` 集合。`openid` 仍由云函数从可信上下文获取，客户端不传入自报身份。

### 好友邀请对战

用户从首页点击“好友对战”进入对战首页。

1. 用户点击“创建房间”。
2. 云函数创建 `battle_rooms` 文档，状态为 `waiting`。
3. 房主进入房间等待页。
4. 房主点击“邀请好友”，使用小程序分享卡片带上 `roomId`。
5. 好友从分享链接进入 `pages/battle-room/index?roomId=...`。
6. 好友调用云函数加入房间。
7. 满 2 人后，房主点击“开始对战”。
8. 房间状态切为 `playing`，双方进入答题。
9. 全部题目结束后切为 `finished`，展示比分和胜负。

### 排行榜

首页新增“排行榜”入口。排行榜首版展示：

- 对战积分榜：按 `battleScore` 倒序。
- 胜场榜：按 `battleWins` 倒序。

排行榜只读 `users` 集合的聚合字段，不在客户端直接扫描对战记录。

## 对战规则

首版规则固定，不做可配置项：

- 1v1 好友房间。
- 每局 10 题。
- 每题 10 秒。
- 双方题目相同，题目来自当前词书。
- 每题第一个答对的玩家得 10 分。
- 答错 0 分，不扣分。
- 超时 0 分。
- 总分高者胜。
- 平分为平局。

为了降低首版复杂度，题目推进由云端房间状态决定，客户端定时轮询房间状态。后续如果需要更强实时性，再替换为更实时的同步方案。

## 数据模型

### users

现有字段继续保留，新增：

```js
{
  nickname: string,
  avatarUrl: string,
  battleScore: number,
  battleWins: number,
  battleLosses: number,
  battleDraws: number,
  battlePlayed: number
}
```

旧用户缺少字段时按默认值补齐。

### battle_rooms

```js
{
  _id: roomId,
  ownerOpenid: string,
  status: 'waiting' | 'playing' | 'finished' | 'cancelled',
  wordbookId: string,
  players: [
    { openid, nickname, avatarUrl, score, answeredCount }
  ],
  questions: [
    { wordId, word, meaning, options }
  ],
  currentIndex: number,
  questionStartedAt: Date,
  answers: {
    [questionIndex]: [
      { openid, wordId, selected, isCorrect, answeredAt }
    ]
  },
  winnerOpenid: string,
  createdAt: Date,
  updatedAt: Date,
  finishedAt: Date
}
```

房间只允许 2 人加入。`questions` 在创建或开始时固定，避免双方题目不一致。

### battle_records

```js
{
  _id: `${roomId}_${openid}`,
  roomId: string,
  openid: string,
  opponentOpenid: string,
  result: 'win' | 'lose' | 'draw',
  score: number,
  opponentScore: number,
  battleScoreDelta: number,
  createdAt: Date
}
```

结算时写入每个玩家一条记录，便于后续做历史战绩页。

## 云函数

### login

新增 `saveProfile` action：

- 校验 `nickname`、`avatarUrl` 类型和长度。
- 使用云端 `OPENID` 定位用户。
- 更新用户资料和默认对战统计字段。
- 返回标准化用户资料。

### battle

提供以下 action：

- `createRoom`：创建等待房间。
- `joinRoom`：加入好友房间。
- `getRoom`：读取房间状态。
- `startRoom`：房主开始对战。
- `submitAnswer`：提交答案并计算本题是否得分。
- `finishRoom`：结算房间并写入用户统计。

所有写操作都必须使用云端 `OPENID` 判断操作者身份。客户端不能传入自己是谁。

### ranking

提供以下 action：

- `battleScore`：返回对战积分榜前 50。
- `battleWins`：返回胜场榜前 50。

返回字段只包含展示所需数据：昵称、头像、分数、胜场、局数。

## 页面结构

新增页面：

- `pages/profile/index`：用户授权和个人战绩。
- `pages/battle/index`：创建好友房间、查看对战说明。
- `pages/battle-room/index`：等待、答题、结算。
- `pages/ranking/index`：排行榜。

首页新增入口：

- 我的
- 排行榜
- 好友对战

## 客户端服务

新增服务层：

- `profile-service.js`：本地资料缓存、调用 `saveProfile`。
- `battle-service.js`：封装 `battle` 云函数调用。
- `ranking-service.js`：封装 `ranking` 云函数调用。

页面只调用服务层，避免把云函数细节散落在页面中。

## 轮询策略

房间页每 2 秒调用一次 `getRoom`。以下情况停止轮询：

- 页面卸载。
- 房间进入 `finished`。
- 房间进入 `cancelled`。

答题提交后立即拉取一次房间状态，降低用户等待感。

## 错误处理

- 未开通云开发：页面提示“对战需要登录并开启云服务”，背词功能不受影响。
- 用户未授权头像昵称：允许进入，但展示默认头像昵称；创建房间前提示授权可提升体验。
- 房间不存在：提示后返回对战首页。
- 房间已满：提示后返回对战首页。
- 非房主开始：提示“只有房主可以开始”。
- 重复提交同一题：云端忽略重复答案，返回当前房间状态。
- 超时提交：不计分，返回当前房间状态。

## 测试策略

使用现有 `node:test`：

- 资料规则测试：保存资料时校验昵称头像。
- 对战规则测试：创建、加入、开始、答题、计分、结算。
- 排行榜规则测试：按积分和胜场排序。
- 页面结构测试：新增页面注册、首页入口、分享参数。
- 服务降级测试：无 `wx.cloud` 时返回清晰失败结果。

## 实施顺序

1. 微信授权和用户资料页。
2. 排行榜基础页和 `ranking` 云函数。
3. 好友对战房间创建、分享、加入。
4. 对战答题、计分、结算。
5. 首页入口和 README 更新。

这样排序的原因是：授权提供用户身份，排行榜依赖用户统计，对战结算再把统计写入排行榜。
