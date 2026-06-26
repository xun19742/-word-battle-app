# WordRush（联机背单词）

WordRush 是一个原生微信小程序 MVP。当前版本先完成单人背词闭环，支持内置考试词书、单词卡片、四选一练习、每日新词计划、每日复习计划、学习打卡记录、学习总结、错词复习、我的资料页、好友实时对战、排行榜基础页、设置页和 CloudBase 学习进度同步。

个人 CSV 导入先放到下一期，当前优先保证内置词书和好友对战 MVP 可用、可测、可运行。

## 功能

- 内置四本考试词书：四级、六级、考研、雅思。
- 默认每天背 25 个新词。
- 默认复习比例为 1:2，也就是每天复习 50 个词。
- 每日新词数量可设置为 5-500，按 5 的倍数保存。
- 每日复习比例可设置为 1:1、1:2、1:3。
- 完成任意一轮学习后自动生成当天打卡。
- 首页展示今日打卡状态、连续打卡天数和今日学习词数。
- 打卡记录页按日期倒序展示每日新词、复习、轮次和得分。
- 每轮学习最多 10 个词，避免一次学习过长。
- 单词卡片：点击屏幕显示词义，标记认识或不认识。
- 四选一练习：即时显示正确或错误。
- 当前词书独立记录学习进度和错词。
- 没有例句的词不会显示空例句区域。
- 我的资料页：用户可主动授权头像昵称，用于后续对战和排行榜展示。
- 授权资料会先保存在本地，云端可用时同步到 `users` 集合。
- 好友对战：通过房间号或微信分享邀请好友进行 1v1 对战。
- 对战房间优先使用云数据库 watch 实时同步，失败时降级轮询。
- 排行榜基础页：展示对战积分榜和胜场榜。
- 未开通云开发时排行榜会显示降级提示，不影响背词功能。
- 网络失败时学习记录保存在本机，联通后再同步。

## 内置词书

词书数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)，固定提交：

```text
bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

ECDICT 使用 MIT License，完整第三方声明见 `THIRD_PARTY_NOTICES.md`。

当前生成结果：

```text
四级 cet4：3849 词
六级 cet6：5407 词
考研 postgraduate：4801 词
雅思 ielts：5040 词
共享去重词条：7836 条
```

重新生成词书时，先下载固定版本的 `ecdict.csv`，再运行：

```powershell
node scripts/build-exam-wordbooks.js <ecdict.csv路径>
```

生成文件为：

```text
miniprogram/data/exam-wordbooks.generated.js
```

## 本地运行

1. 安装微信开发者工具。
2. 导入仓库根目录，工具会读取 `project.config.json`。
3. 使用 `touristappid` 可以直接预览本地 UI 和本地学习流程。
4. 如果要使用 CloudBase，请在开发者工具中把 AppID 切换为你自己的微信小程序 AppID。

项目没有前端三方依赖。Node.js 18 或更高版本可运行自动测试：

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
learning_records
learning_rounds
battle_rooms
battle_records
```

3. 右键 `cloudfunctions/login`，选择“上传并部署：云端安装依赖”。
4. 右键 `cloudfunctions/sync-learning`，选择相同部署方式。
5. 右键 `cloudfunctions/ranking`，选择相同部署方式。
6. 右键 `cloudfunctions/battle`，选择相同部署方式。

当前 MVP 的内置词书已经打包在小程序本地，不要求先把完整词书种到云数据库。云端只负责用户设置、头像昵称、学习记录、轮次去重、好友对战和排行榜读取。`users` 集合会保存用户设置、头像昵称和后续对战统计字段。

## 数据策略

- `miniprogram/data/exam-wordbooks.generated.js` 是四本考试词书的运行时数据。
- `miniprogram/data/cet4-core-100.js` 保留为旧版本兼容词书。
- `miniprogram/services/wordbook-service.js` 统一提供词书列表、读取和校验。
- `miniprogram/services/study-plan-service.js` 根据设置和学习记录选择下一轮新词或复习词。
- `miniprogram/services/checkin-service.js` 管理本地打卡记录，完成学习后自动累计每日词数、得分和连续天数。
- `miniprogram/services/profile-service.js` 管理本地头像昵称缓存，并在云端可用时同步用户资料。
- `miniprogram/services/ranking-service.js` 管理排行榜云调用和无云环境降级。
- `miniprogram/services/battle-service.js` 管理对战云调用、房间 watch 和轮询降级。
- `cloudfunctions/ranking` 只读取 `users` 集合的公开战绩字段，不返回 OpenID 和学习设置。
- `cloudfunctions/battle` 负责创建房间、加入房间、准备、开始、提交答案和结算战绩。
- `learning_records` 使用用户 OpenID、词书 ID 和单词 ID 组成文档 ID，避免不同词书的同一个单词互相覆盖。
- `learning_rounds` 使用用户 OpenID、词书 ID 和 `roundId` 去重，避免重复提交积分。
- `battle_rooms` 保存 1v1 房间状态和实时比分。
- `battle_records` 保存每个玩家的对战结算记录，避免重复累计战绩。

## 发布前验收

```text
[ ] 首页显示当前词书名称和词数
[ ] 可以切换四级、六级、考研、雅思
[ ] 我的资料页可以选择头像、输入昵称并保存
[ ] 设置每日新词为 500 后保存成功
[ ] 复习比例 1:1、1:2、1:3 分别显示正确复习目标
[ ] 完成一轮学习后首页显示今日已打卡
[ ] 打卡记录页显示当天学习词数和得分
[ ] 卡片模式点击屏幕后显示词义
[ ] 四选一模式每题有四个不重复选项
[ ] 学习一轮新词后，新词进度增加
[ ] 学习一轮复习词后，复习进度增加
[ ] 答错单词出现在当前词书的错词页
[ ] 没有例句的词不会留下空白例句区域
[ ] 可以创建好友对战房间并看到房间号
[ ] 好友可以通过房间号或分享链接进入房间
[ ] 双方准备后可以开始 10 题对战
[ ] 对战结束后排行榜数据增加
[ ] 排行榜页可以在无云环境显示“排行榜需要云服务”
[ ] 排行榜页可以切换积分榜和胜场榜
[ ] 断网提交会保留，联网后自动同步
```

## 代码约定

- 业务 JavaScript 使用中文注释说明规则和原因。
- JSON 不支持注释，不写入非法注释。
- 生成文件不要手工编辑，修改生成逻辑后重新运行构建脚本。
