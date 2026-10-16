<div align="center">

**English** | [简体中文](README.md)

</div>

<div align="center">

![superpowers-dsh](static/home.png)

</div>

# superpowers-dsh

Superpowers for the **DeepSeek Harness**: a plugin bundle that ports the core
skills of [obra/superpowers](https://github.com/obra/superpowers) (the
Claude-Code skills library: TDD, debugging, planning, collaboration patterns)
to DSH's Cordis plugin architecture.

The plugin registers a skill provider into the **host layer** of the
`ctx.skills` registry, so every agent preset's scope chain merges these
skills. Skill bodies ship inside the package (`skills/<name>/SKILL.md`) and
are located from `import.meta.url` — an assembly fact of the package, never
user configuration.

## Install & use in your DeepSeek Harness

A **plugin bundle** for DeepSeek Harness (DSH). Installing it registers the
15 skills below into the host skill registry, so every agent session in your
profile sees them in its skill catalog and can load them with the `skill`
tool. Skill content is synced from upstream **obra/superpowers v7.0.0**.

### Simplest: one command

No global `dsh` install required. Run this from any directory:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:StartOver000/SuperPower-dsh
```

Then restart `npx @deepseek-ai/dsh web` (or `dsh web`) and refresh the browser.

### Easiest: let the DeepSeek Harness agent install it

Open the DeepSeek Harness web UI, start a new conversation, and send this
message:

```
Please install the plugin from this link: https://github.com/StartOver000/SuperPower-dsh
```

The agent will run the install for you (`dsh plugin --profile web add` →
restart the profile → verify the skills registered), so you never have to
type a command. Afterwards you can ask it to run
`dsh --profile web --dump-config` and confirm a `superpowers-dsh` row is
present.

### Install from npm (upstream package)

The npm package `superpowers-dsh@0.2.0` is the upstream parent's v6.4.2 release; it does not include this fork's changes:

```sh
dsh plugin --profile web add superpowers-dsh@0.2.0
```

To install this repository's v0.2.1 / upstream skill v7.0.0, use the GitHub command above. This fork has not published a separate npm package.

### Install from GitHub

```sh
# from anywhere
dsh plugin --profile web add https://github.com/StartOver000/SuperPower-dsh.git
```

### Install from a tarball or a local folder

```sh
# tarball (e.g. one created locally with npm pack)
dsh plugin --profile web add C:\path\to\superpowers-dsh-VERSION.tgz

# or the unpacked package folder (pnpm links it, so edits take effect on restart)
dsh plugin --profile web add C:\path\to\superpowers-dsh
```

### Restart and verify

The bundle layer mounts at profile startup, so **restart the profile** (stop
and re-run `dsh web` / `npx @deepseek-ai/dsh web`, then refresh the browser).
To confirm the layer is composed:

```sh
dsh --profile web --dump-config     # a `superpowers-dsh` row must be present
```

The skills then appear in the agent skill catalog (`using-superpowers` is the
entry-point skill) and are loadable with the `skill` tool.

A successful install looks like this:

![Installation success screenshot](static/install-success.png)

### Using another profile (headless / tui / custom)

Point `--profile` at whichever profile you run:

```sh
dsh plugin --profile headless add https://github.com/StartOver000/SuperPower-dsh.git
dsh --profile headless --dump-config
```

### Uninstall

```sh
dsh plugin --profile web remove superpowers-dsh
# then restart the profile again
```

### Notes

- If installing the upstream npm package described above (`superpowers-dsh@0.2.0`),
  mainland China users can set the npmmirror registry first:
  `npm config set registry https://registry.npmmirror.com`; use
  `dsh plugin add superpowers-dsh@0.2.0`.
- A plugin installed from a folder or `file:` spec is linked, not copied:
  changes to that folder take effect after the next profile restart.
- Consumers need **no npm account and no 2FA** — installing is a plain
  package download.

## DSH version compatibility

**Latest runtime check (2026-10-14):** the real `SkillRegistry` from `@deepseek-ai/dsh-skill 0.2.0-rc.2` inside the local DeepSeek Harness `app.asar` listed and loaded all 15 skills. The plugin rank (550) is below the bundled rank (600). The archive omits the `.d.ts` file at the path declared by the SDK manifest, so the static type-contract check was explicitly skipped.

### Support matrix

| Check | Result |
| --- | --- |
| DSH interfaces this plugin uses | `ctx.skills.registerProvider(...)` (skill provider registration) and `dsh.bundle.patch` (a bundle mounting its own `cordis.patch.yml`) |
| Current runtime check | The real `SkillRegistry` from `@deepseek-ai/dsh-skill 0.2.0-rc.2` listed 15 skills; `get()` returned each body and directory resource base |
| Static type contract | `lib/types/index.d.ts` is absent from the `app.asar` package; the checker reports this as skipped, not as verified |
| This plugin's version | `0.2.1` (local fork, not separately published; skill content synced from obra/superpowers `v7.0.0`) |
| Runtime dependencies | None. Node built-ins only |
| Node.js | The check used the DSH-bundled Node `v24.21.0`; neither DSH nor this plugin declares an `engines` range |

### Known compatibility notes

- **This v7 sync does change the DSH provider code**: `lib/index.js` gained the session bootstrap (`agent/created` + `agent.inject()`); the rest of the provider logic is unchanged. The runtime check against the SDK extracted from `app.asar` passed. The static contract was not verified because the archive omitted the declaration file.
- DSH releases since `0.1.7-rc.2` include the `evaluatePluginCompatibility` gate. It only inspects a plugin's declared `@deepseek-ai/dsh*` peerDependencies and skips the bundle when a declared range does not match. This plugin declares none, so the gate does not version-check it; rerun the check below after a DSH upgrade.
- **Same-name precedence is deliberate**: the plugin registers at
  `PACKAGED_SKILL_RANK = 550` while DSH's bundled root is
  `BUNDLED_SKILL_RANK = 600` (lower wins), so **your own skill wins a
  same-name collision**. No in-box DSH skill shares a name with these.
- **Windows note**: the bash helpers in the skill bodies need Git for Windows
  (Git Bash); the Node helpers (`server.cjs`, `render-graphs.js`) run
  everywhere. The prose invokes bundled scripts through their interpreter
  (`bash scripts/...`), so it does not depend on Unix executable bits.
- For this fork, GitHub and a linked local folder load this fork's bundle. The same-named npm package belongs to the parent repository; see above.

### How to re-verify compatibility

The default is `$DSH_PROFILE_DIR/node_modules` when the active profile provides `DSH_PROFILE_DIR`; otherwise it is `$DSH_HOME/profiles/node_modules` (`~/.dsh/profiles/node_modules` when `DSH_HOME` is unset). If your profile uses another location, pass its actual `node_modules` path or set `$DSH_NODE_MODULES`:

```sh
node scripts/check-dsh-compat.mjs
# or point it at another node_modules, or set $DSH_NODE_MODULES
node scripts/check-dsh-compat.mjs D:\path\to\profile\node_modules
```

Current runtime check output (SDK path abbreviated):

```
dsh SDK      : @deepseek-ai/dsh-skill 0.2.0-rc.2
mounted      : 15 skills listed and read through the real SkillRegistry
rank         : PACKAGED_SKILL_RANK=550 is below BUNDLED_SKILL_RANK=600
bootstrap    : agent/created injects 3728 chars of using-superpowers; subagent sessions skipped
note         : SDK type declarations are not present at .../lib/types/index.d.ts; static contract skipped

check-dsh-compat: OK — runtime contracts match; static contract was not available
```

The checker confirms the SDK is present and reports its version. If declarations
are included, it checks the interface used by this plugin (`registerProvider`,
`SkillProvider.list/get`, `SkillCandidate`, `SkillResourceBase`, and the `'custom'`
source bucket). It then mounts `lib/index.js` in the real `SkillRegistry`, reads
back every skill, and compares ranks using the SDK runtime's exported
`BUNDLED_SKILL_RANK`. When `.d.ts` files are absent, only the static check is
skipped and clearly reported; runtime mount or rank failures still exit 1.

> The conclusion holds for the DSH version it was verified against. On a newer
> DSH, run the command above first: if upstream changes the skill interface it
> names the exact break instead of letting skills disappear quietly.

## Skills

| Skill | Purpose |
| --- | --- |
| `using-superpowers` | How to find and use skills; the entry-point skill |
| `brainstorming` | Turn ideas into designs through collaborative dialogue |
| `writing-plans` | Write comprehensive implementation plans from specs |
| `executing-plans` | Execute a plan inline (Native) in this session, one whole-branch review at the end |
| `subagent-driven-development` | Dispatch fresh subagents per task with reviews |
| `dispatching-parallel-agents` | Fan independent work out across parallel agents |
| `systematic-debugging` | Root-cause-first debugging discipline |
| `test-driven-development` | RED-GREEN-REFACTOR implementation loop |
| `verification-before-completion` | Evidence before success claims |
| `requesting-code-review` | Get rigorous review before merging |
| `receiving-code-review` | Verify feedback instead of blindly implementing it |
| `finishing-a-development-branch` | Integrate completed work safely |
| `using-git-worktrees` | Isolated workspaces for feature work |
| `writing-skills` | Author and validate new skills TDD-style |
| `diagnosing-superpowers` | Read a session's transcripts on disk and report what went wrong, with `path:line` evidence |

## How it works

- **Bundle layer** — `cordis.patch.yml` inserts one row
  (`- id: superpowers-dsh, name: superpowers-dsh`) over the dsh-base layer.
  Later layers (the profile's `cordis.patch.yml`, `--patch` overlays) can
  still address that row by id.
- **Provider** — `lib/index.js` calls `ctx.skills.registerProvider(...)`
  with a provider that:
  - `list()` scans the package's `skills/` directory for
    `<name>/SKILL.md` bundles and returns candidates parsed from YAML
    frontmatter (`name`, `description`, `whenToUse`).
  - `get()` reads the winning candidate's body on demand and returns a
    full skill definition with `resourceBase` pointing at the skill's
    directory, so relative references (scripts, prompt templates) resolve.
- **Session bootstrap** — when a session is created (`agent/created`) the
  plugin injects the full body of `skills/using-superpowers/SKILL.md`
  (~3.7 KB) as a user message via `agent.inject()`, so it lands before the
  session's first step; subagent sessions are skipped. The "check skills
  before acting" rule is therefore in context before the first user message,
  matching what upstream's `hooks/session-start` does for Claude Code — with
  no bash, no hook config file, and no Windows polyglot script.
- **Zero runtime dependencies** — the plugin imports only Node built-ins and
  consumes the injected `ctx.skills` service interface.

## Upstream sync (currently obra/superpowers v7.0.0)

`skills/` is **generated output** — do not hand-edit it. The sync lives in two
places; change those and re-run:

- `scripts/sync-from-upstream.mjs` — copies the upstream skill tree and replays
  every DSH adaptation. Each adaptation is an asserted string rewrite, so if
  upstream rewords the anchor the run **fails loudly** instead of silently
  dropping an adaptation.
- `port/overrides/` — DSH-only files
  (`using-superpowers/references/dsh-tools.md`) copied over the synced tree.

```sh
# 1. Fetch the pinned upstream release into a tag-specific directory so old files cannot linger
mkdir -p .upstream/superpowers-v7.0.0
curl -L https://codeload.github.com/obra/superpowers/tar.gz/refs/tags/v7.0.0 \
  | tar -xz -C .upstream/superpowers-v7.0.0 --strip-components=1

# 2. Replay the sync; package.json dsh.superpowersUpstream must match the checkout
node scripts/sync-from-upstream.mjs .upstream/superpowers-v7.0.0

# 3. Verify (provider lists every skill, frontmatter is valid, no dangling refs)
node scripts/verify-skills.mjs

# 4. Compatibility (replays the contract and real-registry mount against your installed DSH)
node scripts/check-dsh-compat.mjs
```

The sync stops without replacing `skills/` when the recorded version, upstream skill set, harness-reference set, or any adaptation anchor does not match. During replacement it keeps the previous tree as a recovery directory and rolls it back if installing the staged tree fails; if a recovery directory is already present, it stops for manual inspection. GitHub Actions reruns the pinned v7.0.0 sync and skill checks on Linux and Windows, then fails if generated files drift.

What changed in this v7.0.0 sync:

- `brainstorming` was substantially rewritten. Its project-design flow adds a separate builder review and ships the new `builder-check-prompt.md` alongside the skill.
- Upstream now uses the relative path `visual-companion.md` directly in `brainstorming/SKILL.md`, so the port no longer needs a rewrite for that path; the DSH-specific Windows note is still applied by the sync transform.
- The catalog remains at 15 skills. The sync script stops for review if the upstream skill set, harness-reference files, or any remaining adaptation anchor changes.

## Porting notes (vs. upstream obra/superpowers)

- **The bootstrap is re-implemented**: upstream injects `using-superpowers` via
  a SessionStart command hook declared in `.claude-plugin/hooks/hooks.json`
  (`hooks/session-start` plus the `run-hook.cmd` polyglot). Here it is a
  Cordis `agent/created` listener plus `agent.inject()`. Why: the upstream
  script needs `${CLAUDE_PLUGIN_ROOT}` expanded, but DSH's official
  `@deepseek-ai/dsh-hooks-claude-code` only substitutes that token inside the
  command string and never exports the variable to the hook process — the
  script takes the wrong branch and the injection is dropped silently. Doing
  it in-process also sidesteps bash/polyglot availability on Windows. The
  `hooks/` directory is therefore not shipped.
- Namespace prefixes removed: `superpowers:brainstorming` → `brainstorming`
  (DSH skills are addressed by bare name).
- `using-superpowers` now documents the DSH `skill` tool and points at
  `skills/using-superpowers/references/dsh-tools.md`, a full Claude-Code →
  DSH tool mapping (`pwsh`, `subagent`, `workflow`, `goal`, ...). Upstream's
  per-harness reference list (Claude Code / Codex / Gemini / Copilot / Pi /
  Antigravity / Hermes / Muse) collapses to the DSH file; the other
  `references/*-tools.md` files are not shipped.
- The Hooks row in `dsh-tools.md` is corrected (it used to read "DSH has no
  hook system"): there are no hook *files*, but plugins can listen to the
  harness's own events (`tools/pre-execute`, `tools/post-execute`,
  `agent/created`, `agent/pre-step`, `system-prompt/assemble`, ...) and use
  `ctx.tools.guard()` to deny a call or `ctx.tools.restrict()` to narrow the
  tool set; official bridges exist for Claude Code and Codex hook files.
  Skills still must not assume such a plugin is installed.
- Subagent references map to DSH's `subagent` / `subagent_fork`. Upstream's
  named agent (`superpowers:code-reviewer`) does not exist here; dispatch the
  skill's own prompt template instead.
- Upstream's `<SUBAGENT-STOP>` gate is not kept: DSH subagents must follow the
  skills too (an implementer subagent has to run TDD).
- Cross-harness paths become DSH paths: `~/.claude/skills/` →
  `$DSH_HOME/skills/`, `~/.superpowers/...` → `$DSH_HOME/...`
  (default `~/.dsh`).
- `diagnosing-superpowers` gains DSH session-storage facts
  (`$DSH_HOME/sessions/<cwd-slug>/session-<uuid>/session.*.jsonl.zstd`,
  concatenated zstd frames that need frame-by-frame decompression).
- `brainstorming`'s visual companion adds a Windows note: the Node server
  (`scripts/server.cjs`) runs everywhere; the `.sh` helpers are bash-only.
- `writing-skills/examples/CLAUDE_MD_TESTING.md` ships verbatim (an upstream
  example document that still uses Claude Code paths), so the reference from
  `testing-skills-with-subagents.md` does not dangle.

## Adding your own skills

`list()` discovers any `skills/<kebab-name>/SKILL.md` in the package — it must
start with a YAML frontmatter block (`name` + `description`, optionally
`whenToUse`). No code change needed.

Note that `skills/` is generated by the upstream sync: **re-running
`scripts/sync-from-upstream.mjs` rebuilds it wholesale**, so a skill dropped
there directly is deleted. Two safe places:

- `$DSH_HOME/skills/` (user level) or the project's `.dsh/skills/` — unrelated
  to this package and the least effort;
- or `port/overrides/<kebab-name>/SKILL.md` — copied into `skills/` on every
  sync, so it survives.

## License

MIT. Skill content adapted from
[obra/superpowers](https://github.com/obra/superpowers) (MIT), © Jesse Vincent
and contributors.
