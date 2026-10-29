# IELTS Tracker V2

默认简体中文、手机与电脑适配、本地优先的雅思学习记录工具。按仓库 Issue #1 实现。未取得可选原型 ZIP，本应用从零实现；仓库根 README 保持原样。

## Vocabulary Hub（V2）

新增生词 / 词组 / 难句知识库、关联词汇提取、图片对照与逐条确认批量导入、保留不同词义和语境的去重、三种间隔复习模式、7 / 30 天复习统计，以及词汇 JSON / CSV 导出和独立恢复。继续使用本地浏览器存储。

详见 [Vocabulary Hub 使用与数据规范](./VOCABULARY.md)。旧数据读取时迁移为 schemaVersion 2，首次写入前保留 V1 原始快照；全站备份包含词汇和复习历史，也兼容恢复 V1 备份。学习报告仍使用原有 schemaVersion 1。

OCR 仅预留适配接口，未配置识别服务时明确提示。图片不上传、不持久保存；免费方案由用户通过 ChatGPT 识别，再粘贴 JSON 或 Tab 分隔文本逐条核对。

V2 开发与验收使用独立分支，PR 审核合并 main 后由现有 GitHub Actions 自动发布，不直接覆盖 main。

## 本地预览

要求 Python 3；基础测试另需 Node.js 22 或更新版本。应用没有第三方运行时依赖、无需 npm install 或打包。

在仓库根目录运行：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

打开 <http://localhost:4173/ielts-tracker/>。请使用 HTTP 服务；直接双击 HTML 的 `file://` 方式不能可靠运行 ES Modules / Service Worker。

模拟 Pages 发布目录：

```bash
node ielts-tracker/tools/build-pages.mjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory work/pages
```

打开 <http://localhost:4174/>，会进入 `ielts-tracker/`。本机预览与线上网站属于不同来源，本机记录不会自动出现在 Pages，请下载 JSON 备份后恢复。

## 已完成的闭环

- **每日计划**：日期、分科、任务、计划与实际分钟、完成状态、备注，支持历史补录 / 编辑 / 删除。勾选完成不会自动填入时长，未知实际分钟始终为 null。
- **四科训练**：来源 / 套题系列、题型、难度、计时、首次作答、正确 / 总题数、分钟数；口语问题数、话题、表达反馈；写作 Task 1 / 2、四维评分与改进建议。
- **成绩含义**：明确区分练习、正式计时模考、AI 参考估计。练习不填 Band，模考必须计时。不会从题数 / 正确率换算 Band，也不估测语速、发音分或学习分钟数。
- **JSON 导入**：Schema v1 + 旧版简化格式；字段及关联约束校验、错误定位、标准化预览、人工确认。编辑原 JSON 后必须重新预览。报告 ID + 语义内容去重，跨报告的相同训练和纠错出现也去重。相同报告 ID 内容变更会提示编辑原记录。
- **纠错库**：原句、改句、分类、解释、来源日期与科目、出现 / 复发次数、掌握及恢复待复习。相同原句 + 改句 + 分类跨科目聚合，新增复发自动恢复待复习。支持更正条目。
- **趋势**：7 / 30 / 90 天时长、按任务数计算的计划完成率与每日完成率趋势、各科学习时间占比、可比听力 / 阅读正确率柱图及明细。无记录显示“待测 / 待记录”，无默认示例成绩。
- **阶段与复盘**：四科独立 Stage 1–4，每周复盘和训练调整。经过 14 天且窗口内有至少 3 个不同日期的同条件数据、表现高于起点且最近 3 次不低于起点，才建议升一级；需用户填写原因并手动确认。允许手动降低阶段。此规则是透明的训练安排启发式，不是官方雅思等级判定；AI 证据不会变成官方成绩。
- **数据**：刷新保留、本机多标签页更新通知、JSON 完整备份 / 恢复、任务与训练 CSV 导出。恢复先校验、确认替换、自动下载原数据备份；损坏存储暂停写入，并提供原文导出与有效备份恢复入口。
- **离线**：首次在 HTTPS / localhost 在线访问并完成缓存后，可离线打开和记录；仅缓存应用文件。首次离线访问不支持。不会缓存其他项目或云 API。

## 统计口径与可比性

当天存在每日任务时，时长仅统计任务的 `actualMinutes`。当天完全没有任务时，才用训练 `minutes`。同一天有任务但实际分钟未知时，不以训练时长代填；请在每日打卡补录。这样避免任务和训练描述同一次学习时重复统计。未知项显示数量，不作为真实零分钟。四科概览显示截止所选日期最近一次训练，并保留成绩类型。

听力 / 阅读的准确率只按**科目、来源或可比练习系列、题型、难度、计时、首次作答、成绩类型、总题数**完全相同分组；所有条件必须已知且为首次作答。来源可使用一组确认可比的材料系列；不同套题来源默认拆开，保持保守比较。AI 成绩与重复作答不参与准确率趋势。只有一条数据时提示等待更多记录。

口语 / 写作保留维度、反馈和 AI 参考值，不生成伪准确率。阶段证据仍需相同来源、题型 / 写作任务、难度、计时、首次作答与成绩类型；模考和 AI 不混合。同日多次数据不能充当多个不同训练日。

## 报告格式

见 [REPORT_FORMAT.md](./REPORT_FORMAT.md) 和 [report.schema.json](./report.schema.json)。页面支持粘贴 JSON、JSON Markdown 代码块或选择 JSON 文件（最大 2 MB）。备份 JSON 与学习报告是两种格式：报告走导入，备份走恢复。

不要把私人报告复制到仓库。应用初始没有学习数据；测试中的数据均为明确虚构的技术样例，与真实学习无关。

## GitHub Pages 部署

1. 审核并合并本功能 PR 到 `main`；开发分支不会部署线上版本。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions** 启用工作流；若合并时尚未配置 Pages，配置后手动运行 **IELTS Tracker checks and Pages**，分支选 `main`。
4. 检查 `check`、`deploy` 均成功。正式入口：<https://jiangshaojie753-dotcom.github.io/ai-development/>；该入口通过相对链接跳转到 <https://jiangshaojie753-dotcom.github.io/ai-development/ielts-tracker/>。

`.github/workflows/ielts-tracker-pages.yml` 会先语法检查、运行 Node 测试，再通过显式白名单生成 `work/pages/`，只上传静态应用文件。JS / CSS / Service Worker 全使用相对路径；Service Worker 作用域仅限 `/ai-development/ielts-tracker/`。仓库根入口只存在于构建产物，不会在源码根目录放置 `index.html`。

未来项目应放独立目录，统一扩展该 Pages 构建入口并把根跳转改为项目目录页；一个仓库只维护一个 Pages 发布工作流，避免多个部署相互覆盖。不要直接发布整个源码仓库或个人工作目录。

## Supabase 预留接口

**V1 尚未接入登录或实际云端同步。当前不需要任何 Supabase 配置。界面明确显示“仅本机存储”。** `app.js` 不导入同步适配器，没有向 Supabase 发起请求。切换设备请先用完整 JSON 备份恢复。

预留文件：

- `sync.js`：依赖注入式 `createSyncAdapter(client)`，接受已认证的官方 Supabase JS 客户端。pull / push 从 `auth.getUser()` 获取当前用户，不接受外部传入的用户 ID，拒绝未登录和匿名账户。插入遇到已存在数据会失败；更新使用 `revision` 乐观锁，冲突必须拉取比较，不能静默覆盖。
- `supabase/schema.sql`：新项目的一次性建表脚本，`user_id` 主键并关联 `auth.users`，仅允许登录用户读写自己的快照，UPDATE 同时有 USING 与 WITH CHECK，anon 没有表权限。此脚本不是已运行的迁移，尚未对任何数据库执行。

未来启用的人工 / 开发配置：

1. 创建自己的 Supabase 项目，在 SQL Editor 审核并运行建表脚本；不要重复对已有同名表运行。检查 Data API 已暴露 `public`。
2. 启用邮箱登录，设置生产 Site URL 与 `/ai-development/ielts-tracker/` 对应的 Auth Redirect URL。使用 publishable key；禁止在前端使用 secret key / service role。若安装 SDK，固定版本并提交 lockfile。
3. 实现登录、退出、会话管理和手动同步确认 UI，再把认证后的客户端传给适配器；退出 / 切换账户要隔离本机缓存。不能把本机所有人的学习记录自动上传给新登录的账户。
4. 首次上传、下载替换、冲突解决都应展示数据差异，并先备份；适配器不会合并冲突。密钥配置留在忽略的本地配置或安全环境配置中，不进入备份。当前 CSP 仅允许标准 `*.supabase.co`，自定义域名需审查后调整。
5. 在启用前，按 [supabase/VERIFY_RLS.md](./supabase/VERIFY_RLS.md) 用两个真实测试账户验证隔离，运行 Supabase Security Advisor。当前只做了适配器 mock 测试，**没有声称已验证线上 RLS**。

参考 [Supabase RLS 官方文档](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Auth 官方文档](https://supabase.com/docs/guides/auth/passwords)。

## 数据安全与备份

数据使用当前浏览器当前来源的 `localStorage`，无追踪、统计、AI API 或音频上传。公开仓库只存代码和虚构技术测试数据。`.gitignore` 忽略 `.env*`、本地配置、个人数据目录、备份和音频，构建也只复制明确白名单；这不能阻止人为强制添加任意私人文件，提交前仍应检查暂存文件。

在「数据与同步」点击完整 JSON 备份，下载后安全保存到仓库外。备份包含个人文字反馈，没有加密；不要发到公开 Issue 或提交 Git。CSV 只导出任务 / 训练，不能用于完整恢复；对可触发电子表格公式的文本做了转义。完整 JSON 会保留原文本。

本地存储不是账户隔离：同一设备同一浏览器的人可访问这些记录；共享设备请使用独立浏览器档案。Pages 的同源其他项目脚本也属于同一浏览器信任边界，后续项目需避免执行不可信脚本。清空站点数据、隐私模式退出、换浏览器 / 域名后需恢复备份。当前存储不可读时不覆盖原文；没有有效备份时先导出原始内容再人工修复。

## 检查与验收

```bash
npm run check --prefix ielts-tracker
npm test --prefix ielts-tracker
node ielts-tracker/tools/build-pages.mjs
```

自动测试覆盖：空数据、校验、旧版兼容、导入 / 重复导入 / ID 冲突、跨科纠错复发、掌握状态与完整恢复、存储重载、7 / 30 / 90 天与闰日计算、重复时长排除、不可比数据分组、阶段证据、CSV 转义、未认证访问拒绝、当前用户约束和同步冲突。

浏览器可重复检查脚本 `tests/browser-check.cjs` 使用 Playwright（仅开发测试需要，不参与应用运行或 Pages 打包）。本机安装测试依赖与 Chromium 后，在仓库根目录运行（测试依赖不进入应用或发布产物）：

```bash
npm install --prefix ielts-tracker --no-save --package-lock=false playwright@1.62.1
node ielts-tracker/tests/browser-check.cjs
```

默认使用 `/usr/bin/chromium`；可用 `CHROMIUM_PATH` 指定本机浏览器路径。脚本会自动构建并启动临时本地服务器，在 `/ai-development/` 前缀下验证入口；也可用 `TRACKER_BASE_URL` 指向已运行的站点。脚本会使用独立临时浏览器上下文，数据仅为虚构样例，检查桌面 / 手机页面、补录编辑、重复导入、纠错掌握 / 恢复、备份 / 恢复、刷新和离线。截图输出到忽略的 `work/qa/`。

人工验收：在 375px 与 1440px 宽度检查六页；新增实际时长留空的任务，刷新确认仍显示待记录；导入同报告两次确认不重复；更正口语纠错，标记掌握后恢复；下载备份并恢复；切至离线重新打开；确认页面无虚构成绩，且 DevTools 无学习数据上传。

## 当前限制

- Supabase 登录、实际云同步、线上数据库权限隔离测试尚未完成，仅预留接口 / RLS / 验证步骤。
- 没有 AI 教学、聊天、音频、语音指标、通知、账号系统或自动生成训练安排。
- 不提供官方 Band 换算；没有可比证据时不推荐升级。阶段规则是保守启发式。
- 纠错按规范化的原句 / 改句 / 分类准确聚合，不做 AI 语义匹配。
- 使用 localStorage，适合个人少量记录；大量报告可能达到浏览器配额，保存失败会明确提示。报告导入上限 2 MB，完整备份恢复上限 20 MB。
- PR 不产生公共 Pages 预览网址；合并并启用 Pages 后才会发布。默认不自动合并 PR。

## 本次验证记录

已通过 JavaScript 语法检查、21 项 Node 自动测试，以及 Chromium 的 1440px 桌面 / 375px 手机端操作验收。浏览器测试覆盖六页、补录编辑、未知值、刷新、重复导入、纠错更正及掌握恢复、7/30/90 天视图、备份恢复、离线刷新、`/ai-development/` 入口和相对资源加载；未观察到外部数据请求。GitHub Actions 实际运行结果以 PR 检查为准，正式 Pages 部署待合并并启用。

### V2 验证

新增迁移保护、不同词义 / 语境去重、原句关联、四档调度及闰日、掌握证据、内容修订重置、数据持久化、完整恢复和 OCR 未配置测试。独立浏览器验收：`node ielts-tracker/tests/vocabulary-browser.cjs`；覆盖 1440px 桌面与 375px 手机、逐条确认 / 更正 / 移除 / 取消、图片预览、三种复习、备份恢复和离线。
