# WordRush 排行榜 MVP 设计

## 目标

在现有 WordRush 背词 MVP 上增加一个可运行的排行榜基础页，为后续好友邀请对战提供展示入口。首版排行榜读取 `users` 集合中的对战统计字段，展示积分榜和胜场榜。

本期不做好友房间、不做对战结算、不做历史战绩页。排行榜可以在暂无数据时显示空状态，也可以在未开通云开发时安全降级，不影响背词、打卡和资料页。

## 用户流程

1. 用户从首页点击“排行榜”。
2. 小程序进入 `pages/ranking/index`。
3. 页面默认展示“积分榜”。
4. 用户可以切换到“胜场榜”。
5. 如果云开发可用，页面调用 `ranking` 云函数读取前 50 名。
6. 如果云开发不可用或请求失败，页面展示提示：`排行榜需要云服务`。
7. 如果云端暂无对战数据，页面展示空状态：`还没有排行榜数据`。

## 排行榜内容

首版包含两个榜单：

- 积分榜：按 `battleScore` 降序排列。
- 胜场榜：按 `battleWins` 降序排列。

每个用户条目展示：

- 排名。
- 头像；没有头像时展示 `W` 占位。
- 昵称；没有昵称时展示 `WordRush 用户`。
- 对战积分。
- 胜场。
- 总局数。

## 数据来源

排行榜只读 `users` 集合，不扫描 `battle_records`。原因是首版对战结算尚未实现，`users` 已经在资料授权阶段预留了聚合字段：

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

旧用户缺少字段时，云函数返回默认值：

```js
{
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0
}
```

## 云函数

新增 `cloudfunctions/ranking`。

支持 action：

- `battleScore`：按 `battleScore` 降序返回前 50 名。
- `battleWins`：按 `battleWins` 降序返回前 50 名。

返回结构：

```js
{
  success: true,
  list: [
    {
      rank: 1,
      nickname: '小词王',
      avatarUrl: '',
      battleScore: 120,
      battleWins: 8,
      battlePlayed: 10
    }
  ]
}
```

非法 action 返回：

```js
{
  success: false,
  message: '排行榜类型无效'
}
```

云函数不接受客户端传入 openid。排行榜是公开展示数据，只返回昵称、头像和聚合战绩，不返回 `_openid`、用户设置、学习记录。

## 客户端服务

新增 `miniprogram/services/ranking-service.js`。

提供：

- `loadRanking(type)`：读取指定榜单。
- `normalizeRankingItem(item, index)`：清洗云端返回字段。

降级规则：

- 没有 `wx.cloud`：返回 `{ success: false, list: [], message: '排行榜需要云服务' }`。
- 云函数返回失败：透传 `message`，没有 message 时使用 `排行榜加载失败`。
- 云函数异常：捕获异常并返回 `排行榜加载失败`。

页面只调用服务层，不直接写 `wx.cloud.callFunction`。

## 页面结构

新增页面：

- `pages/ranking/index`

首页新增入口：

- “排行榜”按钮，放在“我的”和设置按钮附近或打卡卡片下方，保持当前首页不拥挤。

排行榜页结构：

- 标题：`排行榜`
- 榜单切换：`积分榜` / `胜场榜`
- 状态提示：加载中、错误、空状态
- 列表：排名、头像、昵称、积分、胜场、局数

## 错误处理

- 未开通云开发：显示 `排行榜需要云服务`。
- 云函数不存在或请求失败：显示 `排行榜加载失败`。
- 返回空列表：显示 `还没有排行榜数据`。
- 头像为空：显示圆形 `W` 占位。
- 昵称为空：显示 `WordRush 用户`。
- 数字字段异常：按 0 展示。

## 测试策略

继续使用现有 `node:test`：

- 云函数规则测试：
  - 按积分排序。
  - 按胜场排序。
  - 过滤并清洗公开字段。
  - 拒绝非法榜单类型。
- 客户端服务测试：
  - 无 `wx.cloud` 时安全降级。
  - 云函数成功时返回清洗后的列表。
  - 云函数失败或抛错时返回错误消息。
- 页面结构测试：
  - `app.json` 注册 `pages/ranking/index`。
  - 首页存在排行榜入口和 `openRanking()`。
  - 排行榜页存在榜单切换、加载状态、错误状态、空状态和列表字段。

## 实施顺序

1. 新增云函数排序规则和测试。
2. 新增 `cloudfunctions/ranking`。
3. 新增客户端 `ranking-service` 和测试。
4. 新增排行榜页面和页面结构测试。
5. 首页增加排行榜入口。
6. 更新 README 和发布前验收清单。

这样排序的原因是：先保证数据规则正确，再接客户端服务，最后接 UI。每一步都可以独立测试，避免排行榜页面只做出样子但没有可靠数据来源。
