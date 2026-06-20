# WordRush（联机背单词）

WordRush 是一个原生微信小程序 MVP。当前版本先完成单人背词闭环，支持内置四级核心词汇、单词卡片、四选一、学习总结、设置、错词复习和 CloudBase 学习进度同步。

排行榜和联机抢答不在当前 MVP 范围内。

## 功能

- 内置“四级核心词汇”100 词。
- 单词卡片：先回忆，再查看释义，标记认识或不认识。
- 四选一：四个不重复选项，即时显示正误和例句。
- 设置默认学习模式和每轮 10/20 词。
- 记录今日进度、得分和错词。
- 未完成轮次恢复。
- 网络失败时保留待同步记录，联网后自动重试。
- 云端按 `roundId` 幂等同步，避免重复积分。

## 本地运行

1. 安装微信开发者工具。
2. 导入仓库根目录，工具会读取 `project.config.json`。
3. `touristappid` 可直接预览本地 UI 和本地学习流程。
4. 要使用 CloudBase，请在开发者工具中把 AppID 切换为你自己的微信小程序 AppID。

项目没有第三方前端依赖。Node.js 18 或更高版本可运行自动测试：

```powershell
node --test
```

如果本机安装了 npm，也可以运行：

```powershell
npm test
```

## 配置 CloudBase

1. 在微信开发者工具中开通云开发环境。
2. 创建以下云数据库集合：

```text
users
wordbooks
words
learning_records
learning_rounds
```

3. 右键 `cloudfunctions/login`，选择“上传并部署：云端安装依赖”。
4. 右键 `cloudfunctions/sync-learning`，选择相同部署方式。
5. 先运行词书数据生成命令：

```powershell
node scripts/prepare-cloud-wordbook.js
```

6. 右键 `cloudfunctions/seed-wordbook`，选择“上传并部署：云端安装依赖”。
7. 给 `seed-wordbook` 云函数配置环境变量 `SEED_ADMIN_OPENID`，值为你的微信 OpenID。
8. 在开发者工具中调用一次 `seed-wordbook`，确认返回：

```json
{
  "wordbookId": "cet4-core-100",
  "wordCount": 100
}
```

9. 初始化完成后可删除或停用 `seed-wordbook` 云函数，降低公共词库被修改的风险。

## 数据策略

- `miniprogram/data/cet4-core-100.js` 是词书唯一源数据。
- `scripts/prepare-cloud-wordbook.js` 机械复制数据到种子云函数，避免手工维护两份词书。
- 本地学习记录保证游客模式和断网可用。
- CloudBase 是已登录用户的正式同步数据源。
- `learning_rounds` 使用用户 OpenID 和 `roundId` 形成稳定文档 ID，实现重复提交保护。

## 发布前验收

```text
[ ] 首页显示“四级核心词汇”和 100 词
[ ] 卡片模式能完成 10 词并进入总结页
[ ] 四选一每题有四个不重复选项
[ ] 设置切换后下一轮进入新默认模式
[ ] 答错单词出现在错词页
[ ] 未完成轮次可以恢复
[ ] 断网提交会保留，联网后自动同步
[ ] 相同 roundId 重试不会重复积分
[ ] 云端 wordbooks.wordCount 和 words 实际数量都是 100
```

## 代码约定

- 业务 JavaScript 使用中文注释说明规则和原因。
- JSON 不支持注释，不写入非法注释。
- 每个功能完成测试后独立提交。
