<div align="center">

[English](README.en.md) | **简体中文**

</div>

<div align="center">

![superpowers-dsh](static/home.png)

</div>

# superpowers-dsh

为 **DeepSeek Harness (DSH)** 打造的 Superpowers 插件包：把
[obra/superpowers](https://github.com/obra/superpowers) 的核心技能
（Claude-Code 技能库：TDD、调试、规划、协作模式）移植到 DSH 的 Cordis
插件架构上。

插件会向 `ctx.skills` 注册表的 **host 层** 注册一个技能提供者，因此每个
agent preset 的作用域链都会合并这些技能。技能正文随包分发
（`skills/<name>/SKILL.md`），通过 `import.meta.url` 定位——这是包的
组装事实，不需要任何用户配置。

## 目录

- [在 DeepSeek Harness 中安装与使用](#在-deepseek-harness-中安装与使用)
- [DSH 版本兼容性](#dsh-版本兼容性)
- [技能列表](#技能列表)
- [工作原理](#工作原理)
- [上游同步](#上游同步)
- [移植说明](#移植说明)
- [添加自己的技能](#添加自己的技能)
- [许可证](#许可证)

## 在 DeepSeek Harness 中安装与使用

这是 DeepSeek Harness 的**插件包**。安装后会把下面的 15 个技能注册进
host 技能注册表，你 profile 里的每个 agent 会话都能在技能目录中看到它们，
并可用 `skill` 工具加载。技能内容同步自上游 **obra/superpowers v7.0.0**。

### 最简单：一条命令

不需要先全局安装 `dsh`，在任意目录执行：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:StartOver000/SuperPower-dsh
```

装完后重启 `npx @deepseek-ai/dsh web`（或 `dsh web`），刷新浏览器即可。

### 最推荐：直接让 DeepSeek Harness 帮你安装

打开 DeepSeek Harness（Web 界面），新建对话，把下面这句话发给它：

```
帮我安装这个链接里边的插件：https://github.com/StartOver000/SuperPower-dsh
```

Agent 会自动完成安装（`dsh plugin --profile web add` → 重启 profile →
验证技能注册），无需你手动敲任何命令。装完后你可以在对话里让它运行
`dsh --profile web --dump-config`，确认输出里有 `superpowers-dsh` 行。

### 从 npm 安装（上游发行包）

npm 上的 `superpowers-dsh@0.3.0` 由上游父仓库发布（技能同步自 obra/superpowers v7.0.0），
但它**不包含本 fork 的会话引导**（`agent/created` 注入、压缩后重注入）等改动：

```sh
dsh plugin --profile web add superpowers-dsh@0.3.0
```

要安装本仓库 v0.3.1 / 上游技能 v7.0.0，请使用上面的 GitHub 安装命令。本 fork 尚未发布独立 npm 包。

### 从 GitHub 安装

```sh
# 任意目录下执行
dsh plugin --profile web add https://github.com/StartOver000/SuperPower-dsh.git
```

### 从 tarball 或本地文件夹安装

```sh
# tarball（例如本地执行 npm pack 生成的文件）
dsh plugin --profile web add C:\路径\to\superpowers-dsh-VERSION.tgz

# 或解压后的插件文件夹（pnpm 以链接方式安装，改完重启即生效）
dsh plugin --profile web add C:\路径\to\superpowers-dsh
```

### 重启并验证

bundle 层在 profile 启动时挂载，所以需要**重启 profile**（停掉后重新运行
`dsh web` / `npx @deepseek-ai/dsh web`，再刷新浏览器）。确认层已组合：

```sh
dsh --profile web --dump-config     # 必须出现 `superpowers-dsh` 行
```

之后技能会出现在 agent 技能目录中（`using-superpowers` 是入口技能），
可以用 `skill` 工具加载。

安装成功后的界面如下：

![安装成功截图](static/install-success.png)

### 在其他 profile（headless / tui / 自定义）中使用

把 `--profile` 指向你实际运行的 profile：

```sh
dsh plugin --profile headless add https://github.com/StartOver000/SuperPower-dsh.git
dsh --profile headless --dump-config
```

### 卸载

```sh
dsh plugin --profile web remove superpowers-dsh
# 卸载后同样需要重启 profile
```

### 注意事项

- 如需安装上文所述上游 npm 包 `superpowers-dsh@0.3.0`，国内用户可先设
  npmmirror：`npm config set registry https://registry.npmmirror.com`；安装命令使用
  `dsh plugin add superpowers-dsh@0.3.0`。
- 从文件夹或 `file:` 规格安装的插件是链接安装（不是复制）：修改该文件夹后，
  下次重启 profile 生效
- 使用者**不需要 npm 账号，也不需要 2FA**——安装只是普通的包下载

## DSH 版本兼容性

**最新实测（2026-10-14）：使用本机 DeepSeek Harness `app.asar` 中的 `@deepseek-ai/dsh-skill 0.2.0-rc.2` 与真实 `SkillRegistry` 校验；15 个技能均能列出并读回，插件 rank 550 低于内置 rank 600。app.asar 未包含 manifest 声明路径下的 `.d.ts`，因此静态类型契约检查被明确跳过。**

### 支持矩阵

| 检查项 | 结果 |
| --- | --- |
| 插件依赖的 DSH 接口 | `ctx.skills.registerProvider(...)`（技能提供者注册）与 `dsh.bundle.patch`（bundle 挂载自己的 `cordis.patch.yml`） |
| 当前运行时验证 | `@deepseek-ai/dsh-skill 0.2.0-rc.2` 的真实 `SkillRegistry` 列出 15 个技能，逐个 `get()` 均返回正文与目录资源基路径 |
| 静态类型契约 | app.asar 中未包含 `lib/types/index.d.ts`；兼容检查器会标记为跳过，不能据此声称静态类型接口已验证 |
| 插件自身版本 | `0.3.1`（本地 fork，未单独发布；技能内容同步自 obra/superpowers `v7.0.0`） |
| 运行时依赖 | 无。只用 Node 内置模块，不引入任何第三方依赖 |
| Node.js | 本次实测使用 DSH 随附 Node `v24.21.0`；DSH 自身未声明 `engines`，本插件也未限制 |

### 已知兼容性说明

- **本次 v7 同步改动了 DSH provider 代码**：`lib/index.js` 增加了会话引导（`agent/created` 监听 + `agent.inject()`），以及压缩后的再注入（`session/event` 上的 `compaction/end`），其余 provider 逻辑未变；本机从 app.asar 提取出的实际 SDK 运行时检查通过。由于打包内容缺少类型声明，静态契约部分没有验证。
- 上游 DSH 从 `0.1.7-rc.2` 起加入插件兼容性闸门 `evaluatePluginCompatibility`：它**只检查插件自己声明的 `@deepseek-ai/dsh*` peerDependencies**，范围不满足就把整个 bundle 跳过并报错。本插件不声明这些 peerDependencies，因此闸门不会校验它的版本；升级 DSH 后应运行下面的复核命令。
- **同名技能的优先级是有意选择**：插件以 `PACKAGED_SKILL_RANK = 550` 注册，DSH 内置
  bundled 根为 `BUNDLED_SKILL_RANK = 600`（数值越小越优先），所以**同名时你自己的技能
  会覆盖本插件的同名技能**。DSH 内置技能里没有与本插件重名的技能。
- **Windows 提示**：技能正文里的 bash 辅助脚本需要 Git for Windows（Git Bash）；Node
  脚本（`server.cjs`、`render-graphs.js`）全平台可用。技能正文已按“经解释器调用”
  （`bash scripts/...`）编写，不依赖 Unix 可执行位。
- 安装本 fork 时，GitHub 源与本地目录链接都加载该 fork 的 bundle；npm 上的同名包属于父仓库，见上文。

### 兼容性怎么复核

默认优先使用 `$DSH_PROFILE_DIR/node_modules`（当前活动 profile 提供该变量时）；否则使用 `$DSH_HOME/profiles/node_modules`（未设置 `DSH_HOME` 时为 `~/.dsh/profiles/node_modules`）。若 profile 在其他位置，请传入实际的 `node_modules` 路径或设置 `$DSH_NODE_MODULES`：

```sh
node scripts/check-dsh-compat.mjs
# 也可指定别的 node_modules，或用 $DSH_NODE_MODULES
node scripts/check-dsh-compat.mjs D:\path\to\profile\node_modules
```

当前运行时测试输出（SDK 安装路径已缩略）：

```
dsh SDK      : @deepseek-ai/dsh-skill 0.2.0-rc.2
mounted      : 15 skills listed and read through the real SkillRegistry
rank         : PACKAGED_SKILL_RANK=550 is below BUNDLED_SKILL_RANK=600
bootstrap    : agent/created injects 3728 chars of using-superpowers; refreshed on compaction/end; subagent sessions skipped
note         : SDK type declarations are not present at .../lib/types/index.d.ts; static contract skipped

check-dsh-compat: OK — runtime contracts match; static contract was not available
```

它检查 SDK 是否存在及版本；如果 SDK 带有类型声明，则校验本插件实现的接口
（`registerProvider`、`SkillProvider.list/get`、`SkillCandidate`、`SkillResourceBase`、
`'custom'` 来源桶）；随后把 `lib/index.js` 挂进真实 `SkillRegistry` 并逐个读回技能，
再从 SDK runtime 导出的 `BUNDLED_SKILL_RANK` 比较 rank；最后用**真实 cordis
上下文**派发一次 `agent/created`（普通会话 + 子智能体会话）和一个干净的
`compaction/end`、一个失败的 `compaction/end`，确认引导消息恰好注入两次
（首注入 + 压缩后重注入），子智能体与失败压缩不注入。缺少 `.d.ts` 时只跳过
静态部分，会在输出中明确标注；运行时挂载或 rank 检查失败仍会 `exit 1`。

在**没有安装 DSH 的机器**上（例如 CI、干净容器）没有可比对的对象，它会打印
`SKIPPED` 并 `exit 0`——这是"没检查"，不是"检查失败"（发布流程因此不会被误拦）。
显式传目录或以 `--require` 运行时，找不到 SDK 仍按错误处理。想强制要求先装 SDK：
`DSH_COMPAT_REQUIRE=1 node scripts/check-dsh-compat.mjs`。

> 结论以**验证时的 DSH 版本**为准。如果你跑的是更新的 DSH，先跑一遍上面的命令；
> 上游一旦改动技能接口，它会报告可验证的具体变化，而不是等到技能悄悄消失。

## 技能列表

| 技能 | 用途 |
| --- | --- |
| `using-superpowers` | 如何查找和使用技能；入口技能 |
| `brainstorming` | 动手前先问清「你到底想要什么、为什么」，理解后再定规模和做法 |
| `writing-plans` | 根据规格编写全面的实施计划 |
| `executing-plans` | 本会话内（Native/内联）执行计划，末尾一次整分支评审 |
| `subagent-driven-development` | 每个任务派发全新子代理并评审 |
| `dispatching-parallel-agents` | 把独立工作扇出到并行代理 |
| `systematic-debugging` | 先找根因的调试纪律 |
| `test-driven-development` | RED-GREEN-REFACTOR 实施循环 |
| `verification-before-completion` | 声称成功前先拿出证据 |
| `requesting-code-review` | 合并前获得严格评审 |
| `receiving-code-review` | 核实反馈，而不是盲目照做 |
| `finishing-a-development-branch` | 安全地整合已完成的工作 |
| `using-git-worktrees` | 功能开发的隔离工作区 |
| `writing-skills` | 以 TDD 方式编写并验证新技能 |
| `diagnosing-superpowers` | 会话出问题时读磁盘上的 transcript，带 `path:line` 取证复盘 |

## 工作原理

- **Bundle 层** —— `cordis.patch.yml` 在 dsh-base 层之上插入一行
  （`- id: superpowers-dsh, name: superpowers-dsh`）。后面的层（profile 的
  `cordis.patch.yml`、`--patch` 叠加）仍可按 id 定位这一行。
- **提供者** —— `lib/index.js` 调用 `ctx.skills.registerProvider(...)`，
  注册一个提供者：
  - `list()` 扫描包内 `skills/` 目录，把每个 `<name>/SKILL.md` 作为候选，
    从 YAML frontmatter 解析出 `name`、`description`、`whenToUse`。
  - `get()` 按需读取候选技能正文，返回完整技能定义，`resourceBase` 指向
    技能所在目录，使相对引用（脚本、提示模板）可以正确解析。
- **会话引导（bootstrap）** —— 新建会话时（`agent/created` 事件）插件把
  `skills/using-superpowers/SKILL.md` 的完整正文（约 3.7 KB）作为一条
  user 消息经 `agent.inject()` 注入，落在该会话第一步之前；子智能体会话
  跳过。这样「先查技能再动手」在第一条用户消息之前就已在上下文里，
  与上游 `hooks/session-start` 对 Claude Code 的效果等价，但不依赖 bash、
  不写 hook 配置文件，也不要求 windows polyglot 脚本能跑。
- **压缩后重新注入** —— 引导消息是会话表层最前面的一条 user 消息，DSH
  压缩时它会随被替换的那段历史一起被摘要掉。上游 SessionStart 的 matcher
  是 `startup|clear|compact`，所以插件同时监听 `session/event`，在一个
  干净的 `compaction/end` 上重新注入；压缩失败时事件带 `data.error`、
  原表层并未被替换，因此不注入。`agent.inject()` 记为
  `agent/inbox/spliced`，进入下一个被接纳的 step，不唤醒 agent，因此
  在回合中途调用是安全的。
- **零运行时依赖** —— 插件只使用 Node 内置模块，消费注入的 `ctx.skills`
  服务接口。

## 上游同步

当前同步的上游版本：**obra/superpowers v7.0.0**（记录在 `package.json` 的
`dsh.superpowersUpstream`）。

`skills/` 是**生成产物**，不要手改。同步逻辑写在两个地方，改它们再重跑即可：

- `scripts/sync-from-upstream.mjs` —— 拉上游技能树 + 重放所有 DSH 适配
  （每条适配都是一个带断言的字符串改写，上游一旦改了原文就**直接报错**，
  不会静默丢适配）。
- `port/overrides/` —— 只属于 DSH 的文件（`using-superpowers/references/dsh-tools.md`），
  覆盖到同步结果上。

```sh
# 1. 取上游对应版本的源码；每个 tag 使用独立目录，避免旧文件残留
mkdir -p .upstream/superpowers-v7.0.0
curl -L https://codeload.github.com/obra/superpowers/tar.gz/refs/tags/v7.0.0 \
  | tar -xz -C .upstream/superpowers-v7.0.0 --strip-components=1

# 2. 重放同步；package.json 的 dsh.superpowersUpstream 必须与源码版本一致
node scripts/sync-from-upstream.mjs .upstream/superpowers-v7.0.0

# 3. 校验（provider 能列出全部技能、frontmatter 合法、没有悬空引用）
node scripts/verify-skills.mjs

# 4. 兼容性（对着本机安装的 DSH 真实 SDK 复跑契约与挂载检查）
node scripts/check-dsh-compat.mjs
```

同步脚本会在版本记录不匹配、技能集合、跨 harness 参考文件或适配锚点变化时停止，且不会替换当前 `skills/`。提交前旧目录会暂存为恢复目录；新目录换入失败会尝试还原，若发现遗留恢复目录则停止并要求先人工检查。GitHub Actions 会在 Linux 与 Windows 上重跑固定 v7.0.0 同步、技能校验，并检测生成目录漂移。

本次同步（v7.0.0）带来的上游变化：

- `brainstorming` 技能经过大幅改写，项目设计流程新增独立的 builder review 阶段，并随技能分发 `builder-check-prompt.md`。
- 上游已在 `brainstorming/SKILL.md` 中直接改用相对路径 `visual-companion.md`，因此 DSH 不再需要对此做文本转换；DSH 的 Windows 说明仍由同步转换补入。
- 技能目录仍为 15 个技能；同步脚本会在上游技能集合、跨 harness 参考文件或适配锚点变化时停止，要求先审查再同步。

## 移植说明

- **引导方式换了实现**：上游用 `.claude-plugin/hooks/hooks.json` 里的
  SessionStart 命令 hook（`hooks/session-start` + `run-hook.cmd` polyglot
  脚本）把 `using-superpowers` 注入会话；DSH 这里改成 Cordis 插件内的两个
  触发点：`agent/created` 监听 + `agent.inject()`（对应上游 matcher 的
  `startup`），以及 `session/event` 上干净的 `compaction/end`（对应
  `compact`；`clear` 在 DSH 侧没有等价事件）。选择理由：上游脚本要求
  `${CLAUDE_PLUGIN_ROOT}` 被展开，而 DSH 官方的
  `@deepseek-ai/dsh-hooks-claude-code` 只替换命令字符串、从不把该环境变量
  导出给 hook 进程，脚本会走错分支并静默丢失注入；插件内实现还避开了
  Windows 下 bash / polyglot 的可用性问题。`hooks/` 目录因此不随包分发。
- 去掉了命名空间前缀：`superpowers:brainstorming` → `brainstorming`
  （DSH 技能用裸名称寻址）。
- `using-superpowers` 现在介绍 DSH 的 `skill` 工具，并指向
  `skills/using-superpowers/references/dsh-tools.md`——完整的
  Claude-Code → DSH 工具映射（`pwsh`、`subagent`、`workflow`、`goal` ...）。
  上游那份“按 harness 选参考文件”的清单（Claude Code / Codex / Gemini /
  Copilot / Pi / Antigravity / Hermes / Muse）只保留 DSH 一份，其余上游
  `references/*-tools.md` 不随包分发。
- `dsh-tools.md` 的 Hooks 一行已改正（原写作 “DSH 没有 hook 系统”）：DSH 没有
  hook *文件*，但插件可以监听 harness 自己的事件（`tools/pre-execute`、
  `tools/post-execute`、`agent/created`、`agent/pre-step`、
  `system-prompt/assemble` ...），并用 `ctx.tools.guard()` 拒绝调用、
  `ctx.tools.restrict()` 收敛工具集合；官方也提供 Claude Code / Codex 两套
  hook 文件桥接包。技能本身仍不得假定这类插件已装。
- 子代理引用映射到 DSH 的 `subagent` / `subagent_fork`；上游的命名 agent
  （`superpowers:code-reviewer`）在 DSH 不存在，按技能自带的 prompt 模板派发。
- `using-superpowers` 里的 `<SUBAGENT-STOP>` 不再保留：DSH 的子代理同样需要
  遵守技能（实现者子代理必须走 TDD）。
- 跨 harness 的路径改成 DSH 路径：`~/.claude/skills/` → `$DSH_HOME/skills/`，
  `~/.superpowers/...` → `$DSH_HOME/...`（默认 `~/.dsh`）。
- `diagnosing-superpowers` 补了 DSH 的会话存储事实
  （`$DSH_HOME/sessions/<cwd-slug>/session-<uuid>/session.*.jsonl.zstd`，
  多 zstd frame 拼接，需按 frame 解压）。
- `brainstorming` 的视觉伴侣补充了 Windows 说明：Node 服务
  （`scripts/server.cjs`）全平台可跑；`.sh` 辅助脚本仅限 bash。
- `brainstorming` 在 v7.0.0 重写后，上游正文已直接写 `visual-companion.md`
  这个裸相对名，所以本 port 原先那条「把 `skills/brainstorming/...` 改写成
  裸相对名」的适配已删除（同步脚本里留有 NOTE，若上游将来回退再加回）。
- `writing-skills/examples/CLAUDE_MD_TESTING.md` 原样保留（上游示例文档，
  里面仍是 Claude Code 路径），只为让 `testing-skills-with-subagents.md`
  的引用不断链。

## 添加自己的技能

`list()` 会自动发现包里任何 `skills/<kebab-name>/SKILL.md`——只要它以 YAML
frontmatter 开头（`name` + `description`，可选 `whenToUse`），无需改代码。

注意：`skills/` 是上游同步的生成目录，**重跑 `scripts/sync-from-upstream.mjs`
会整体重建它**，直接放进去的自建技能会被删掉。两个安全位置：

- 放到 `$DSH_HOME/skills/`（用户级）或项目的 `.dsh/skills/` —— 与插件无关，
  最省事；
- 或者放进 `port/overrides/<kebab-name>/SKILL.md` —— 同步时会被复制进
  `skills/`，因此不会被清掉。

## 许可证

MIT，许可全文与上游原始版权声明见 [`LICENSE`](LICENSE)。技能内容与方法论来自
[obra/superpowers](https://github.com/obra/superpowers)（MIT，© Jesse Vincent），
经 [LayneChai/superpowers-dsh](https://github.com/LayneChai/superpowers-dsh)
移植到 DSH；完整的来源链、以及本仓库相对上游**刻意保留的差异**见
[`NOTICE`](NOTICE)。本仓库自己的改动同样以 MIT 授权。
