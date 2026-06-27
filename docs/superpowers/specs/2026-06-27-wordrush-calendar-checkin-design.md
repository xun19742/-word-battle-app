# WordRush 日历打卡与云同步设计

## 目标

把现有按日期排列的打卡列表升级成月历式学习记录，并支持本地优先、云端同步：

1. 用户可以按月查看学习打卡。
2. 只有当天同时完成新词目标和复习目标，日期才被点亮。
3. 点击日期可以查看当天学习详情。
4. 断网时本地日历立即更新。
5. 联网后同步云端，换设备登录仍可恢复历史记录。

视觉参考扇贝单词常见的“月历 + 绿色完成标记 + 连续天数 + 每日明细”结构，但沿用 WordRush 当前蓝紫色主色和薄荷绿色完成色。

本期不做补打卡、社交分享、勋章商城和好友打卡排行。

## 打卡成功规则

当天必须同时满足：

```text
newCompleted >= dailyNewTarget
reviewCompleted >= dailyReviewTarget
```

才设置：

```js
checked: true
```

规则说明：

- 只完成新词，不算打卡成功。
- 只完成复习，不算打卡成功。
- 未完成目标仍保存当天学习数据，日历不点亮。
- 完成目标后保持已打卡，不会因为设置变化变回未完成。
- 第一版不支持手工补打卡。

## 当日目标快照

用户在当天第一次完成学习轮次时，锁定当天目标：

```js
{
  dailyNewTarget: settings.dailyNewWords,
  dailyReviewTarget: settings.dailyNewWords * settings.reviewRatio
}
```

当天中途修改学习设置：

- 不改变当天已锁定目标。
- 新设置从次日开始生效。
- 历史日期始终按当日目标快照判断，不按当前设置重新计算。

这样可以避免通过当天临时降低目标点亮打卡，也避免历史记录随设置变化。

## 页面结构

保留现有 `pages/checkin/index` 路由，替换为月历布局。

### 顶部统计

展示三个指标：

- 连续打卡：当前连续成功天数。
- 累计打卡：历史成功打卡天数。
- 本月打卡：当前展示月份的成功天数。

### 月份导航

- 左箭头：上个月。
- 中间：`2026 年 6 月`。
- 右箭头：下个月。
- 不允许切换到未来月份。

### 月历

固定七列：

```text
日 一 二 三 四 五 六
```

日期状态：

- 已打卡：薄荷绿色圆形背景。
- 今天：蓝紫色边框。
- 选中日期：加深蓝紫色边框。
- 有学习但未达标：灰色小圆点。
- 无学习：普通日期。
- 其他月份补位日期：低透明度或留空。

### 日期详情

点击日期后在月历下方展示：

- 是否打卡成功。
- 新词：`newCompleted / dailyNewTarget`。
- 复习：`reviewCompleted / dailyReviewTarget`。
- 学习轮次：`rounds`。
- 当日得分：`score`。

没有学习数据时显示“当天暂无学习记录”。

## 日历计算

新增 `miniprogram/utils/calendar-grid.js`，只负责纯日期计算：

- 输入年份、月份和每日记录。
- 计算该月第一天是星期几。
- 计算当月天数。
- 生成 35 或 42 个格子。
- 标记今天、选中日期、打卡状态和是否有学习。
- 支持闰年和跨年切换。

日期统一使用本地日期字符串：

```text
YYYY-MM-DD
```

不使用 UTC 截断生成用户日历日期，避免北京时间午夜附近错一天。

## 本地数据

继续复用 `miniprogram/services/checkin-service.js`，扩展每日记录：

```js
{
  date: '2026-06-27',
  checked: true,
  dailyNewTarget: 25,
  dailyReviewTarget: 50,
  newCompleted: 25,
  reviewCompleted: 50,
  rounds: 8,
  score: 620,
  processedRoundIds: ['round-a', 'round-b'],
  updatedAt: '2026-06-27T12:00:00.000Z',
  syncPending: true
}
```

本地写入流程：

1. 学习总结页调用 `applyCheckinSummary(summary, settings)`。
2. 服务读取当天记录。
3. 相同 `roundId` 不重复累计。
4. 首次写入时保存目标快照。
5. 更新新词、复习、轮数和得分。
6. 重新计算 `checked`。
7. 标记 `syncPending: true`。
8. 立即更新首页和日历页。

## 云端数据

新增集合 `checkin_records`。

文档 ID：

```text
${openid}_${date}
```

字段：

```js
{
  _openid: string,
  date: '2026-06-27',
  checked: boolean,
  dailyNewTarget: number,
  dailyReviewTarget: number,
  newCompleted: number,
  reviewCompleted: number,
  rounds: number,
  score: number,
  processedRoundIds: string[],
  createdAt: Date,
  updatedAt: Date
}
```

权限建议：

- 客户端不直接写。
- 云函数按可信 OpenID 写入。
- 客户端读取通过云函数完成。

## 云端同步

### 写入路径

学习轮次已经通过 `sync-learning` 云函数同步，因此日历云端聚合复用同一条可靠链路：

1. 客户端同步学习 summary 时增加：
   - `dailyNewTarget`
   - `dailyReviewTarget`
2. `sync-learning` 已按 `roundId` 写入 `learning_rounds` 去重。
3. 同一事务中读取当日 `checkin_records`。
4. 仅当轮次未处理时累计当日数据。
5. 首次记录保存目标快照。
6. 计算 `checked` 并写回。

这样不需要再维护第二条独立上传队列，也避免同一轮学习重复计入打卡。

### 读取路径

新增 `cloudfunctions/checkins`，只负责读取：

- `listMonth`：读取指定月份记录。
- `getStats`：读取连续、累计和指定月份打卡统计。

所有查询使用云端 `OPENID`，客户端不能读取其他用户打卡。

客户端 `checkin-service`：

1. 先返回本地月份数据，页面立即渲染。
2. 云能力可用时调用 `checkins`。
3. 按日期合并本地和云端数据。
4. `processedRoundIds` 取并集。
5. 计数使用云端已确认数据和本地未同步轮次合并。
6. 合并结果写回本地缓存。

## 合并策略

避免简单“取最大值”导致多设备数据丢失，记录按 `processedRoundIds` 合并。

本地服务需要保留每个已处理轮次的最小贡献：

```js
{
  roundId: string,
  studyType: 'new' | 'review',
  total: number,
  score: number
}
```

合并步骤：

1. 云端记录是已确认基线。
2. 找出本地存在、云端不存在的轮次。
3. 只把这些未确认轮次叠加到云端基线。
4. 重新计算 `checked`。
5. 同步成功后清除本地 `syncPending`。

本期不处理两个设备完全离线且同时学习后的实时冲突；两端联网后由 `roundId` 去重并最终收敛。

## 连续打卡计算

连续天数只计算 `checked: true` 的日期：

1. 如果今天已打卡，从今天向前连续计算。
2. 如果今天未打卡，从昨天向前连续计算。
3. 遇到第一天未打卡即停止。

累计天数是历史 `checked: true` 记录数量。

本月天数是当前显示月份 `checked: true` 记录数量。

## 首页变化

首页打卡卡片继续展示：

- 今日已打卡 / 今日未打卡。
- 连续天数。
- 今日新词和复习完成情况。

未同时完成两个目标时，首页显示：

```text
今日未打卡
新词 20/25 · 复习 35/50
```

两个目标完成后显示：

```text
今日已打卡
连续 7 天
```

## 错误处理

- 无云能力：使用本地日历，不阻断学习。
- 云端读取失败：保留本地数据并显示“云端记录暂未同步”。
- 同步失败：保留 `syncPending`，联网后自动重试。
- 重复 `roundId`：本地和云端都不重复累计。
- 非法月份：回落到当前月份。
- 未来日期：不允许选中未来记录。
- 缺少旧目标快照：使用该记录首次出现时的当前设置补齐并固定。
- 损坏缓存：忽略损坏项，其余日期继续展示。

## 测试策略

### 日历工具测试

- 平年二月天数正确。
- 闰年二月天数正确。
- 月首星期偏移正确。
- 跨年切换正确。
- 今天、选中、已打卡和未达标状态正确。
- 生成 35 或 42 个稳定格子。

### 打卡规则测试

- 只完成新词不点亮。
- 只完成复习不点亮。
- 两个目标都完成才点亮。
- 当天首次学习锁定目标快照。
- 中途修改设置不改变当天目标。
- 相同 `roundId` 不重复累计。
- 连续天数遇到未打卡日期停止。

### 云同步测试

- `sync-learning` 把目标快照写入 `checkin_records`。
- 云端相同 `roundId` 不重复累计。
- 本地未同步轮次能合并到云端基线。
- 多次拉取月份数据不会重复累计。
- 无云环境安全降级。

### 页面测试

- 打卡页包含月份导航、星期标题和月历网格。
- 已打卡、今天、未达标有独立样式。
- 点击日期更新详情区域。
- 首页只有双目标完成时显示“今日已打卡”。

## 实施顺序

1. 新增日历网格纯工具和测试。
2. 扩展本地打卡记录与双目标判定。
3. 扩展 `sync-learning` 聚合 `checkin_records`。
4. 新增 `checkins` 读取云函数。
5. 增加本地与云端月份数据合并。
6. 重做打卡页月历 UI。
7. 调整首页打卡状态。
8. 更新 README、集合和部署说明。
9. 全量测试并部署 `sync-learning` 与 `checkins`。
