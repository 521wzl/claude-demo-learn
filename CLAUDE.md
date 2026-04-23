# CLAUDE.md - 微信小程序云开发 (个人开发·AI 友好版 v2.1)

## 1. 技术栈与项目角色
- **平台**：微信小程序原生 + 微信云开发（CloudBase）
- **云环境 ID**：`你的环境ID`（在 `app.js` 中通过 `wx.cloud.init({ env: 'xxx' })` 配置）
- **云函数运行环境**：Node.js 18+
- **数据库**：NoSQL（类 MongoDB）
- **AI 定位**：你负责生成完整、可直接运行的代码片段，我会遵守下面的所有约束。

## 2. 目录结构（AI 生成文件时必须遵循）
miniprogram/
├── pages/ 每个页面一个文件夹，包含 .js, .json, .wxml, .wxss
├── components/ 全局自定义组件
├── utils/ 工具函数（如 api.js, format.js）
└── app.js / app.json / app.wxss

cloudfunctions/
├── 函数A/ 每个云函数独立文件夹
│ ├── index.js 入口（必须包含初始化代码）
│ └── package.json 有依赖时必须存在
└── 函数B/

## 3. 前端开发规范（让 AI 不瞎写）

### 3.1 数据请求
- **唯一方式**：`wx.cloud.callFunction({ name: '函数名', data: {...} })`
- **禁止**：`wx.request`、`fetch`、`axios` 以及前端直接操作数据库（`db.collection(...).get` 等一律不许）。
- **标准调用模板**（带重试）：
```javascript
async function callFunction(name, data, retry = 2) {
  try {
    const res = await wx.cloud.callFunction({ name, data })
    return res.result
  } catch (err) {
    if (retry > 0 && err.errCode === -1) { // 网络超时或断网
      return callFunction(name, data, retry - 1)
    }
    console.error(`云函数 ${name} 调用失败`, err)
    throw err
  }
}
### 3.2 样式
单位：rpx，命名：BEM，安全区：env(safe-area-inset-bottom)

### 3.3 性能
setData 只传变化路径：this.setData({ 'obj.key': val })

避免高频调用，非首页使用分包加载

## 4. 云函数规范
### 4.1 初始化（每个云函数入口必须）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
### 4.2 依赖管理
需要第三方包时，在函数目录生成 package.json 并 npm install

wx-server-sdk 无需安装，但要 require

压缩后依赖总大小 ≤50MB

### 4.3 数据库操作模板
// 普通查询
exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const res = await db.collection('orders').where({ _openid: OPENID }).get()
    return { code:0, data: res.data }
  } catch(err) { return { code:-1, errMsg: err.message } }
}
// 事务示例
exports.main = async (event) => {
  const transaction = await db.startTransaction()
  try {
    // 检查库存、更新等
    await transaction.commit()
    return { code:0 }
  } catch(err) {
    await transaction.rollback()
    return { code:-1, errMsg: err.message }
  }
}
### 4.4 索引
任何 where + orderBy 查询需在控制台创建复合索引

## 5. 安全与权限
### 5.1 数据库权限
集合权限设为“仅创建者可读写”或“所有用户不可读写”

禁止前端直接 add/update/remove

### 5.2 身份校验
const { OPENID } = cloud.getWXContext()
const record = await db.collection('orders').doc(orderId).get()
if (record.data._openid !== OPENID) return { code:403, errMsg:'无权操作' }
### 5.3 内容安全
用户文本/图片需调用 cloud.openapi.security.msgSecCheck / imgSecCheck

### 6.1 返回格式统一
云函数返回：{ code:0, data?:any, errMsg?:string }（0=成功）

前端 try-catch + wx.showToast

### 7.1 AI 文件操作指令
生成页面：miniprogram/pages/页面名/页面名.js + .json + .wxml + .wxss

生成组件：miniprogram/components/组件名/组件名.js + .json + .wxml + .wxss

生成云函数：cloudfunctions/函数名/index.js + package.json（内容：{"name":"函数名","dependencies":{"wx-server-sdk":"~2.6.3"}}）

修改已有文件：优先 edit_file 局部修改，禁止直接覆盖（除非明确要求）

代码示例：必须含 try-catch 和标准返回格式，关键注释

### 8.1 调试与日志
云函数：console.log(event)，console.error(err)

前端：wx.getLogManager()（可选）

报错时先 console.error 再返回友好错误

### 9.1 并发提醒
单函数默认 1000次/分钟，个人项目足够

避免在 onShow / onScroll 高频调用（加防抖）

### 10.1 完整示例
云函数 getUserInfo/index.js

javascript
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    const res = await db.collection('users').where({ _openid: OPENID }).get()
    return { code:0, data: res.data[0] || null }
  } catch(err) {
    return { code:-1, errMsg: err.message }
  }
}
前端调用

javascript
async loadUser() {
  try {
    const res = await wx.cloud.callFunction({ name: 'getUserInfo' })
    if (res.result.code === 0) this.setData({ user: res.result.data })
    else wx.showToast({ title: res.result.errMsg, icon: 'none' })
  } catch {
    wx.showToast({ title: '网络异常', icon: 'none' })
  }
}
备注：本规范专为个人开发者 + AI 辅助编程设计，请严格遵循。

---

## 11. Git 版本控制与协作规范

### 11.1 核心规则 (AI Execution Rules)
> 💡 **致 AI 助手的特别指令**：在执行任何 Git 相关操作时，请严格遵守以下底线以节省 Token 并防止环境破坏：
- **绝对禁止推送敏感信息**：在暂存（Stage）或提交（Commit）前，必须主动扫描代码。绝不允许 `.env`、`*-lock.json`、`~/.claude.json` 或个人 IDE 配置被推送到远程仓库。
- **提交前先拉取（Pull First）**：在进行任何分支切换或代码推送前，必须先执行 `git pull --rebase`，确保本地代码处于最新状态，避免产生不必要的合并冲突（Merge Conflicts）。
- **原子化提交**：一次 Commit 只做一件事。不要将重构代码和新功能代码混在同一个 Commit 中，以便后续进行 Code Review 或版本回退。

### 11.2 分支管理策略 (Branch Strategy)
项目采用 **"主干保护 + 功能分支"** 的轻量级工作流：

- **`main` (生产主干)**
  - **规则**：永远处于可编译、可部署的稳定状态。
  - **保护**：禁止直接 Push。所有修改必须通过 Pull Request (PR) 合并。
- **`dev` / `develop` (集成开发分支)**
  - **规则**：日常开发集成分支。团队所有成员在此分支上进行代码同步。
- **`feature/*` (功能分支)**
  - **命名**：`feature/login-module`、`feature/cloud-function-refactor`
  - **规则**：从 `dev` 分支切出，开发完成后合并回 `dev`，随后删除该分支。
- **`fix/*` (修复分支)**
  - **命名**：`fix/nanoid-collision-bug`
  - **规则**：用于紧急修复 Bug，完成后合并回 `dev` 和 `main`。

### 11.3 Commit 提交信息规范 (Conventional Commits)
**格式**：`<类型>(范围): <描述>`

- **主要类型**：
  - `feat`: 新功能 (e.g., `feat(auth): 添加微信小程序登录云函数`)
  - `fix`: 修复 Bug (e.g., `fix(db): 修复云数据库事务死锁问题`)
  - `refactor`: 重构 (既不新增功能也不修复 Bug，比如代码优化)
  - `docs`: 仅修改文档 (e.g., `docs: 更新 Claude.md 的 Git 规范`)
  - `chore`: 构建过程或辅助工具的变动 (e.g., `chore: 更新 .gitignore 忽略 Claude 配置`)
  - `test`: 增加或修改测试代码
- **示例**：`feat(swarm): 集成分布式任务调度模块，降低 Token 消耗`

### 11.4 必须纳入版本控制的核心文件 (Tracked)
- `CLAUDE.md` (项目最高指导法则)
- `.claude/agents/*.md` (团队共享的子代理/专家配置)
- `.claude/refs/*.md` (按需加载的业务逻辑/数据库结构档案)
- `cloudfunctions/**` (云函数核心逻辑)
- `miniprogram/**` (小程序前端核心业务代码)

### 11.5 绝对禁止纳入版本控制的文件 (Untracked)
以下内容**必须**留在开发者的本地机器上，切勿提交：
- `node_modules/`、`dist/`、`build/` (依赖与构建产物)
- `.env`、`.env.local` (包含 API Key、云环境 ID 等绝密信息)
- `~/.claude/`、`~/.claude.json` (AI 的个人级全局配置)
- `package-lock.json`、`yarn.lock` (为避免跨平台依赖树冲突，通常不提交，除非项目强制锁定)

### 11.6 自动提交并推送规则 (Auto-Commit & Push)
每次完成功能修复、代码改动并获得用户确认后，**自动完成 git add + commit + push，无需再询问**。流程如下：

1. 先 `git status` + `git diff` 查看改动范围
2. 告知用户改动了哪些文件 + 提交信息
3. `git add` 对应文件 + `git commit -m "提交信息"` + `git push`
4. 提交信息遵循 Conventional Commits 规范（11.3）
5. 禁止自动提交未读取过内容的文件
6. 推送到 origin/main 分支（项目为个人开发，默认 push 到 main）

---

## 12. AI 编码行为准则（减少常见 LLM 编程错误）

> 以下准则用于减少常见 LLM 编程错误。如有冲突，项目级规范优先。

**权衡**：这些准则偏向谨慎而非速度。简单任务请自行判断。

### 12.1 编码前先思考

**不要假设。不要隐藏困惑。要暴露权衡。**

实现前：
- 明确陈述你的假设。不确定时，要问。
- 如果存在多种解释，要提出——不要默默选择。
- 如果存在更简单的方案，要说出来。有必要时反驳。
- 如果有不清楚的地方，停下来。说出什么让你困惑。要问。

### 12.2 简洁优先

**最小代码解决问题。不做投机性代码。**

- 不要添加需求之外的功能。
- 不要为单次使用的代码创建抽象。
- 不要添加未被要求的"灵活性"或"可配置性"。
- 不要为不可能发生的场景添加错误处理。
- 如果写了 200 行而可以用 50 行完成，重写。

问自己："一位高级工程师会说这过于复杂吗？"如果是，简化。

### 12.3 精准修改

**只触碰必须改的地方。只清理自己的烂摊子。**

编辑现有代码时：
- 不要"改进"相邻代码、注释或格式。
- 不要重构没有坏的东西。
- 匹配现有风格，即使你会有不同做法。
- 如果注意到无关的死代码，提出来——不要删除。

当你的修改造成孤立代码时：
- 移除因你的修改而不再使用的 imports/variables/functions。
- 不要移除已存在的死代码，除非被要求。

检验标准：每一行修改都应该直接追溯到用户的需求。

### 12.4 目标驱动执行

**定义成功标准。循环验证直到完成。**

将任务转化为可验证的目标：
- "添加验证" → "为无效输入写测试，然后让它们通过"
- "修复 bug" → "写一个复现 bug 的测试，然后让它通过"
- "重构 X" → "确保测试在重构前后都通过"

多步骤任务，简要说明计划：
```
1. [步骤] → 验证：[检查]
2. [步骤] → 验证：[检查]
3. [步骤] → 验证：[检查]
```

强有力的成功标准让你能独立循环。弱标准（"让它工作"）需要持续澄清。

---

**这些准则生效的表现是**：diff 中不必要的修改减少，因过度复杂而重写的情况减少，以及澄清问题出现在实施错误之前而非之后。
