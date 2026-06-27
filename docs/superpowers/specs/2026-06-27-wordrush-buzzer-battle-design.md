# WordRush 抢答对战设计

## 目标

把现有“双方各自完成 10 题”的好友对战改造成真正的实时抢答：

1. 双方始终看到同一道英文单词和相同的四个中文选项。
2. 双方可以直接点击选项，不设置额外的“抢答”按钮。
3. 最先答对的玩家得分并结束当前题。
4. 答错的玩家扣分并锁定当前题，另一方仍可继续回答。
5. 每题具有统一的 10 秒云端倒计时。
6. 使用云数据库事务处理并发提交，保证同一题只产生一个有效胜者。

本期继续沿用好友邀请房间，不做陌生人匹配、聊天、观战、复杂段位和强反作弊。

## 对战规则

- 1v1 好友邀请。
- 每局固定 10 题。
- 每题固定 10 秒。
- 双方同时看到英文单词和四个中文选项。
- 答对：`+10` 分。
- 答错：`-5` 分，允许出现负分。
- 答错后本人当前题锁定，对手仍可继续回答。
- 一方答对后，当前题结束并进入下一题。
- 双方都答错后，当前题结束并进入下一题。
- 10 秒结束仍无人答对，当前题结束并进入下一题。
- 第 10 题结束后立即结算。
- 总分高者获胜，分数相同则平局。

## 用户流程

### 等待阶段

房间创建、邀请、加入和准备流程保持不变：

1. 房主创建房间并分享。
2. 好友加入房间。
3. 双方分别点击“我准备好了”。
4. 双方都准备后，房主点击“开始对战”。

页面只在房主、两名玩家均已准备时显示可用的“开始对战”按钮。其他状态显示“双方准备后由房主开始”，避免把业务校验错误直接暴露给用户。

### 抢答阶段

房间进入 `playing` 后：

1. 双方 `watch` 到相同的 `currentQuestionIndex`。
2. 页面展示该题单词、四个选项和 10 秒倒计时。
3. 玩家点击选项后调用 `submitAnswer`，携带 `roomId`、`questionIndex`、`selected`。
4. 云函数在事务中重新读取房间并验证提交。
5. 正确提交会加 10 分并推进下一题。
6. 错误提交会扣 5 分并把该玩家加入本题锁定列表。
7. 如果另一方还未锁定，题目保持开放。
8. 如果双方都锁定，云端推进下一题。

页面不能依赖本机点击顺序判断胜负；所有得分、锁定和推进必须以事务提交后的云端房间状态为准。

### 超时推进

每题开始时云端写入 `questionStartedAt` 和 `questionDeadlineAt`。

客户端倒计时只负责显示：

```text
remaining = max(0, questionDeadlineAt - serverNow)
```

倒计时到 0 后，客户端调用 `advanceTimeout`。云函数在事务中重新验证：

- 当前题号仍与请求一致。
- 当前题仍为 `open`。
- 云端截止时间已经到达。

验证通过后推进下一题。多个客户端同时提交超时请求时，事务保证只有第一个有效推进。

## 房间状态

`battle_rooms` 在原字段基础上调整为：

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
      score: number
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
  currentQuestionIndex: number,
  questionStatus: 'open' | 'resolved',
  lockedOpenids: string[],
  questionWinnerOpenid: string,
  questionStartedAt: Date,
  questionDeadlineAt: Date,
  lastQuestionResult: {
    questionIndex: number,
    result: 'correct' | 'both-wrong' | 'timeout',
    winnerOpenid: string
  },
  answers: {
    [questionIndex]: [
      {
        openid: string,
        selected: string,
        isCorrect: boolean,
        scoreDelta: number,
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

首版继续把 `correctOption` 存在房间文档中，不做强反作弊。正式竞技版本可把答案迁移到客户端不可读的独立集合。

## 云端事务

### submitAnswer

`battle` 云函数的 `submitAnswer` 必须使用 `db.runTransaction`：

1. 事务内读取 `battle_rooms/{roomId}`。
2. 校验房间状态为 `playing`。
3. 校验提交玩家属于房间。
4. 校验 `questionIndex === currentQuestionIndex`。
5. 校验当前题为 `open`。
6. 校验玩家未在 `lockedOpenids`。
7. 判断选项是否正确。
8. 正确时加 10 分并推进题目。
9. 错误时扣 5 分并锁定玩家。
10. 双方均锁定时推进题目。
11. 第 10 题完成时结算房间和战绩。

事务冲突由 CloudBase 自动重试。后到的并发请求会在重试时看到题目已经推进或玩家已经锁定，从而成为无效提交。

### advanceTimeout

新增 action：

- `advanceTimeout`：到达云端截止时间后推进当前题。

该 action 同样使用事务，客户端不能通过修改本机时间提前结束题目。

### 业务错误

业务规则失败不再向客户端抛出完整云函数堆栈。云函数返回：

```js
{
  success: false,
  message: '双方准备后才能开始'
}
```

客户端只展示短提示。

## 纯规则模块

`cloudfunctions/battle/battle-rules.js` 调整为共享题目状态，而不是每个玩家独立答题：

- `startBattleRoom(room, openid, now)`
- `submitBuzzerAnswer(room, payload)`
- `advanceQuestion(room, reason, now)`
- `advanceTimedOutQuestion(room, payload)`
- `settleBattleRoom(room, now)`

规则函数保持纯函数，数据库事务只负责读取、调用规则、写回。

## 客户端服务

`miniprogram/services/battle-service.js`：

- 保留 `createRoom`、`joinRoom`、`setReady`、`startRoom`、`getRoom`、`watchRoom`。
- `submitAnswer` 继续传递题号和选项。
- 新增 `advanceTimeout(roomId, questionIndex)`。
- 业务失败返回云端短消息。
- `watch` 不可用时继续降级为 2 秒轮询。

## 房间页面

`pages/battle-room/index` 的 `playing` 状态改为：

- 顶部展示双方昵称和总分。
- 中间展示统一的当前题号：`第 n / 10 题`。
- 展示 10 秒倒计时。
- 直接展示英文单词和四个选项。
- 未锁定玩家可以点击选项。
- 本人答错后所有选项变灰，显示“答错 -5，等待好友作答”。
- 对手答对、双方答错或超时后自动切换到下一题。
- `lastQuestionResult` 变化时显示短反馈。
- 房间完成后展示双方总分、胜负和排行榜入口。

页面使用 `submitting` 防止连续点击，但不能把客户端防抖当作最终幂等保障。

## 错误处理

- 玩家点击旧题：返回最新房间，不改变得分。
- 玩家重复点击：忽略重复提交。
- 已锁定玩家再次提交：返回“本题已锁定”。
- 双方同时答对：事务只允许一个正确提交生效。
- 网络中断：页面保留当前状态，恢复后重新读取房间。
- `watch` 失败：自动降级轮询。
- 云端业务错误：展示短消息，不展示函数堆栈。
- 房间过期：返回对战首页。

## 测试策略

### 规则测试

- 开始房间后当前题为第 0 题并有 10 秒截止时间。
- 答对加 10 分并推进下一题。
- 答错扣 5 分并锁定本人。
- 锁定玩家不能重复作答。
- 对手在另一方答错后仍可答题。
- 双方都答错后推进下一题。
- 超时后推进下一题。
- 旧题请求不影响当前题。
- 第 10 题完成后结算。
- 负分能够正常参与最终胜负计算。

### 云函数测试

- `submitAnswer` 使用 `db.runTransaction`。
- `advanceTimeout` 使用事务并校验截止时间。
- 业务错误转换为 `{ success: false, message }`。
- 并发提交不会重复计分或跳过两题。

### 页面和服务测试

- 房间页直接展示选项，不显示单独抢答按钮。
- 锁定后选项禁用。
- 倒计时到 0 调用 `advanceTimeout`。
- 服务正确传递 `questionIndex`。
- `watch` 和轮询都能推进相同页面状态。

## 实施顺序

1. 重写抢答纯规则并补测试。
2. 把 `submitAnswer` 改为事务写入。
3. 增加 `advanceTimeout`。
4. 调整服务层。
5. 调整房间页和倒计时。
6. 补业务错误短提示。
7. 全量测试并重新部署 `battle` 云函数。
