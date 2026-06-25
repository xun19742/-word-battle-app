# WordRush 实时好友对战设计

## 目标

在现有背词、微信授权、打卡和排行榜 MVP 之上，增加一个可运行的 1v1 好友邀请对战闭环：

1. 用户可以从首页进入“好友对战”。
2. 房主创建房间并通过微信分享邀请好友。
3. 好友进入同一房间后，双方可以准备并开始答题。
4. 房间状态通过云数据库 `watch` 实时同步；`watch` 不可用时降级为 2 秒轮询。
5. 对战结束后写入战绩字段，排行榜页继续复用已有 `battleScore` 和 `battleWins` 榜单。

本期不做快速匹配、不做聊天、不做观战、不做复杂段位、不做强反作弊。优先保证小程序可运行、房间流程闭环、云端数据可追踪。

## 用户流程

### 创建房间

用户从首页点击“好友对战”，进入 `pages/battle/index`。

1. 页面读取当前设置里的词书。
2. 用户点击“创建好友房间”。
3. 客户端从当前词书抽取 10 个词，生成四选一题目。
4. 调用 `battle` 云函数的 `createRoom` action。
5. 云函数读取当前用户 OpenID 和 `users` 资料，创建 `battle_rooms` 文档。
6. 房主进入 `pages/battle-room/index?roomId=...`。
7. 房主点击“邀请好友”，小程序分享路径带上 `roomId`。

题目由房主客户端生成，是为了避免首版重复维护一份云端词库。云函数会校验题目数量、字段和选项数量，但本期不做强反作弊。后续如果要做正式竞技，可把词库迁到云端，由云函数生成题目。

### 加入房间

好友从分享链接进入房间页，或从对战首页输入房间号加入。

1. 房间页读取 `roomId`。
2. 调用 `joinRoom`。
3. 云函数校验房间存在、未满、未开始。
4. 加入后页面开始监听 `battle_rooms/{roomId}`。

如果用户未授权头像昵称，仍允许加入，展示默认资料 `WordRush 用户`。

### 准备和开始

房间页展示双方资料、准备状态和房间号。

1. 每个玩家点击“准备”。
2. 页面调用 `setReady` 更新自己的准备状态。
3. 双方都准备后，房主可以点击“开始对战”。
4. 云函数校验操作者是房主、房间人数为 2、双方已准备。
5. 房间状态从 `waiting` 切换为 `playing`。

### 答题同步

对战答题首版放在 `pages/battle-room/index` 同一页面中，不额外拆新答题页，减少路由和状态恢复复杂度。

1. 双方看到同一组 10 道题。
2. 每次选择答案后调用 `submitAnswer`。
3. 云函数判断是否正确，更新当前玩家分数、答题数和答案记录。
4. `watch` 推送房间新状态，双方实时看到对方分数和进度。
5. 当前玩家答完 10 题后显示“等待好友完成”。
6. 双方都答完后云函数结算房间，状态切为 `finished`。

首版计分固定：答对 +10 分，答错 0 分，不按速度加分。这样规则简单，测试稳定。后续可以在 `answers` 中已有的 `answeredAt` 基础上增加速度分。

### 结算和排行榜

房间进入 `finished` 后，页面展示：

- 我的分数
- 好友分数
- 胜 / 负 / 平
- 回到首页
- 查看排行榜

结算时云函数写入：

- `battle_records`：每个玩家一条对战记录。
- `users.battleScore`：胜 +30，平 +10，负 +0。
- `users.battleWins` / `battleLosses` / `battleDraws` / `battlePlayed`。

排行榜页继续读取 `users` 集合，不需要改已有排行榜展示逻辑。

## 页面结构

新增页面：

- `pages/battle/index`：对战首页，创建房间、输入房间号加入、展示玩法说明。
- `pages/battle-room/index`：等待、准备、实时答题、结算。

修改页面：

- `pages/home/index`：新增“好友对战”入口。

`pages/battle-room/index` 同时处理四种状态：

- `loading`：读取房间中。
- `waiting`：等待好友、准备、开始。
- `playing`：答题和实时比分。
- `finished`：展示结果。

## 客户端服务

新增 `miniprogram/services/battle-service.js`，封装所有对战云能力：

- `createRoom({ wordbookId, questions })`
- `joinRoom(roomId)`
- `setReady(roomId, ready)`
- `startRoom(roomId)`
- `submitAnswer({ roomId, questionIndex, selected })`
- `getRoom(roomId)`
- `watchRoom(roomId, handlers)`

`watchRoom` 策略：

1. 优先调用 `wx.cloud.database().collection('battle_rooms').doc(roomId).watch(...)`。
2. 如果 `wx.cloud` 不存在，返回“对战需要云服务”。
3. 如果 `watch` 报错或不可用，自动每 2 秒调用 `getRoom`。
4. 页面 `onUnload` 时关闭 watch 或清理轮询定时器。

新增 `miniprogram/utils/battle-question-builder.js`：

- 从当前词书随机抽 10 题。
- 每题生成 4 个不重复选项。
- 输出云函数可校验的题目结构。

## 云函数

新增 `cloudfunctions/battle`。

### actions

- `createRoom`：创建等待房间。
- `joinRoom`：加入房间。
- `setReady`：设置自己的准备状态。
- `startRoom`：房主开始对战。
- `submitAnswer`：提交答案并更新分数。
- `getRoom`：读取房间状态。
- `finishRoom`：幂等结算房间。

所有写操作都使用 `cloud.getWXContext().OPENID` 判断身份。客户端不能传入自己是谁。

### 纯规则模块

新增 `cloudfunctions/battle/battle-rules.js`，用于测试和云函数复用：

- 校验题目结构。
- 创建房间初始状态。
- 加入玩家。
- 更新准备状态。
- 判断是否可以开始。
- 提交答案并防止重复提交同一题。
- 判断双方是否完成。
- 计算胜负和平局。
- 计算用户战绩增量。

## 数据模型

### battle_rooms

```js
{
  _id: roomId,
  ownerOpenid: string,
  status: 'waiting' | 'playing' | 'finished' | 'cancelled',
  wordbookId: string,
  players: [
    {
      openid: string,
      nickname: string,
      avatarUrl: string,
      ready: boolean,
      score: number,
      answeredCount: number,
      finished: boolean
    }
  ],
  questions: [
    {
      wordId: string,
      word: string,
      meaning: string,
      options: string[],
      correctOption: string
    }
  ],
  answers: {
    [openid]: [
      {
        questionIndex: number,
        selected: string,
        isCorrect: boolean,
        answeredAt: Date
      }
    ]
  },
  winnerOpenid: string,
  result: 'owner' | 'guest' | 'draw' | '',
  createdAt: Date,
  startedAt: Date,
  finishedAt: Date,
  updatedAt: Date
}
```

说明：

- `correctOption` 会随房间文档返回，首版不做强反作弊。
- `answers` 按 OpenID 分组，便于防重复提交。
- `result` 用于页面快速展示，`winnerOpenid` 用于后续扩展。

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

### users

继续使用现有字段：

```js
{
  battleScore: number,
  battleWins: number,
  battleLosses: number,
  battleDraws: number,
  battlePlayed: number
}
```

旧用户缺字段时继续按默认值 0 处理。

## 权限和过期策略

`watch` 需要客户端可以读取对应房间文档，因此 `battle_rooms` 集合需要配置为“仅参战双方可读，客户端不可直接写”。读权限按 `ownerOpenid` 或已加入玩家 OpenID 判断；所有创建、加入、准备、开始、提交答案和结算写入都必须通过 `battle` 云函数完成。

如果当前云开发环境暂时无法配置细粒度数据库规则，页面仍可通过 `getRoom` 云函数轮询完成 MVP 流程，只是 `watch` 实时监听会降级。

房间过期策略保持简单：

- `waiting` 房间超过 30 分钟未开始，视为过期。
- `playing` 房间超过 30 分钟未完成，允许玩家返回对战首页重新开局。
- 首版不做后台定时清理，只在 `joinRoom`、`getRoom`、`submitAnswer` 时识别过期状态。

## 错误处理

- 未开通云开发：提示“对战需要云服务”，背词不受影响。
- 房间不存在或已过期：提示“房间不存在或已过期”，返回对战首页。
- 房间已满：提示“房间已满”。
- 房间已开始：新用户不能加入，只能返回对战首页。
- 非房主开始：提示“只有房主可以开始”。
- 双方未准备：提示“双方准备后才能开始”。
- 重复提交同一题：云端忽略重复提交，返回最新房间。
- `watch` 失败：自动降级轮询，不中断对战。
- 页面退出：关闭监听，房间保留，用户可通过房间号重新进入。

## 测试策略

使用现有 `node:test`，继续保持测试先行：

- `battle-question-builder.test.js`：题目数量、选项去重、缺少干扰项时报错。
- `battle-rules.test.js`：创建、加入、准备、开始、答题、防重复、结算、战绩增量。
- `battle-service.test.js`：无云降级、云函数 action 参数、watch 失败降级轮询。
- `battle-page.test.js`：页面注册、首页入口、对战首页结构、房间页状态文案。
- `README` 验收清单测试或结构测试：确保部署说明包含 `battle` 云函数和 `battle_rooms` / `battle_records` 集合。

全量验收仍以 `node --test`、JS 语法检查、JSON 解析检查和 `git diff --check` 为准。

## 实施顺序

1. 新增题目生成工具和测试。
2. 新增 `battle-rules` 纯规则模块和测试。
3. 新增 `battle` 云函数入口和 package。
4. 新增 `battle-service`，实现云函数封装和 watch 降级。
5. 新增对战首页和房间页。
6. 首页增加“好友对战”入口。
7. README 补充云集合、云函数部署和验收项。
8. 全量验证后提交并推送。

这个顺序先保证规则可测，再接云函数和页面，避免实时 UI 写完后才发现房间状态模型不稳。
