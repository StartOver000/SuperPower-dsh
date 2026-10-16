#!/usr/bin/env node
/**
 * Check this plugin against an installed DeepSeek Harness (DSH).
 *
 *   node scripts/check-dsh-compat.mjs [node_modules-dir]
 *
 * `node_modules-dir` defaults to `$DSH_PROFILE_DIR/node_modules` when the active
 * profile sets `DSH_PROFILE_DIR`; otherwise it is `$DSH_HOME/profiles/node_modules`
 * (where a running harness installs its profile bundles). Pass the installation's own
 * directory to check the in-box copy instead.
 *
 * What it checks, all against the SDK that is actually installed:
 *   1. `@deepseek-ai/dsh-skill` is present, and which version it is.
 *   2. Static contract when the installed SDK ships declarations: they must
 *      declare the provider interface this plugin implements. If declarations
 *      are omitted, report the static check as skipped and continue.
 *   3. Dynamic contract: mount `lib/index.js` into the real `SkillRegistry`
 *      and read every skill back through it (`list()` + `get(name)`).
 *   4. Rank: compare this plugin's `PACKAGED_SKILL_RANK` with the SDK's
 *      runtime-exported `BUNDLED_SKILL_RANK`, since that pair decides
 *      duplicate-name resolution.
 *
 * Exits non-zero when any check fails, so a DSH upgrade can be re-verified
 * with one command.
 *
 * @module scripts/check-dsh-compat
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
const defaultModulesDir = process.env.DSH_PROFILE_DIR
  ? join(process.env.DSH_PROFILE_DIR, 'node_modules')
  : join(dshHome, 'profiles', 'node_modules')
const modulesDir = resolve(
  process.argv[2] ?? process.env.DSH_NODE_MODULES ?? defaultModulesDir
)

const problems = []
const notes = []
const fail = (message) => problems.push(message)
const note = (message) => notes.push(message)

/** Resolve a package's ESM entry the way Node does: exports["."] then main. */
async function entryOf(modules, name) {
  const dir = join(modules, ...name.split('/'))
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const exported = manifest.exports?.['.']
  const target =
    (typeof exported === 'string' ? exported : (exported?.default ?? exported?.import)) ??
    manifest.module ??
    manifest.main
  if (!target) return null
  return { dir, manifest, url: pathToFileURL(resolve(dir, target)).href }
}

// ---- 1. locate the SDK -------------------------------------------------------
const skill = await entryOf(modulesDir, '@deepseek-ai/dsh-skill')
const cordis = await entryOf(modulesDir, '@deepseek-ai/cordis')

if (!skill || !cordis) {
  fail(
    `no DSH profile SDK at ${modulesDir}\n` +
      '       pass the profile node_modules directory, or set $DSH_NODE_MODULES'
  )
}

let bundledRank
if (skill && cordis) {
  console.log(`dsh SDK      : @deepseek-ai/dsh-skill ${skill.manifest.version}`)
  console.log(`               ${skill.dir}`)

  // ---- 2. static contract against the installed declarations -----------------
  const typesPath = join(skill.dir, typeof skill.manifest.types === 'string' ? skill.manifest.types : 'lib/types/index.d.ts')
  if (!existsSync(typesPath)) {
    note(`SDK type declarations are not present at ${typesPath}; static contract skipped`)
  } else {
    const types = await readFile(typesPath, 'utf8')
    const expectations = [
      ['registerProvider(create: (control: SkillProviderControl) => SkillProvider)', /registerProvider\(create:\s*\(control:\s*SkillProviderControl\)\s*=>\s*SkillProvider\)/],
      ['provider list() -> candidates', /readonly list:\s*\(options:\s*SkillLookupOptions\)\s*=>\s*Promise</],
      ['provider get(candidate, options)', /readonly get:\s*\(candidate:\s*SkillCandidate,\s*options:\s*SkillLookupOptions\)/],
      ['SkillCandidate.locator', /readonly locator:\s*unknown/],
      ['SkillCandidate.rank', /readonly rank:\s*number/],
      ["SkillResourceBase kind 'directory'", /kind:\s*'directory'/],
      ["SkillSource includes 'custom'", /'custom'/]
    ]
    for (const [label, pattern] of expectations) {
      if (!pattern.test(types)) fail(`installed SDK no longer declares: ${label}`)
    }
  }

  // ---- 3. dynamic contract: mount into the real registry ---------------------
  let ctx
  try {
    const { Context } = await import(cordis.url)
    const sdk = await import(skill.url)
    if (typeof sdk.BUNDLED_SKILL_RANK === 'number') bundledRank = sdk.BUNDLED_SKILL_RANK
    else fail('installed SDK no longer exports BUNDLED_SKILL_RANK at runtime')
    ctx = new Context()
    new sdk.SkillRegistry(ctx) // registers itself as ctx.skills

    const plugin = await import(pathToFileURL(join(pkgRoot, 'lib', 'index.js')).href)
    plugin.apply(ctx)

    const summaries = await ctx.skills.list({})
    if (summaries.length === 0) fail('the real registry listed 0 skills from this plugin')

    const broken = []
    for (const summary of summaries) {
      const loaded = await ctx.skills.get(summary.name, {})
      if (!loaded?.content?.trim()) broken.push(summary.name)
      else if (loaded.resourceBase?.kind !== 'directory') broken.push(`${summary.name} (resourceBase)`)
    }
    if (broken.length > 0) fail(`the real registry could not load: ${broken.join(', ')}`)
    console.log(`mounted      : ${summaries.length} skills listed and read through the real SkillRegistry`)
  } catch (error) {
    fail(`mounting into the real SkillRegistry failed: ${error.message.split('\n')[0]}`)
  }

  // ---- 4. rank ---------------------------------------------------------------
  const source = await readFile(join(pkgRoot, 'lib', 'index.js'), 'utf8')
  const ours = /PACKAGED_SKILL_RANK\s*=\s*(\d+)/.exec(source)
  if (!ours) {
    fail('could not find PACKAGED_SKILL_RANK in lib/index.js')
  } else if (bundledRank !== undefined) {
    const value = Number(ours[1])
    const relation = value < bundledRank ? 'below' : value > bundledRank ? 'above' : 'equal to'
    console.log(`rank         : PACKAGED_SKILL_RANK=${value} is ${relation} BUNDLED_SKILL_RANK=${bundledRank}`)
    if (value >= bundledRank) {
      note('this plugin now ranks at or above bundled roots; a same-name built-in skill would be shadowed')
    }
  }

  // ---- 5. session bootstrap --------------------------------------------------
  // The skill files are inert without the bootstrap: nothing invokes them until
  // the using-superpowers body reaches the model. Verify the wiring statically
  // and then drive a real agent/created through the mounted plugin.
  if (!/ctx\.on\(\s*['"]agent\/created['"]/.test(source)) {
    fail("lib/index.js does not listen for 'agent/created'; sessions would start without the bootstrap")
  } else if (!/agent\.inject\(/.test(source)) {
    fail('the agent/created listener does not call agent.inject(); the bootstrap never reaches the model')
  } else if (!/ctx\.on\(\s*['"]session\/event['"]/.test(source)) {
    fail(
      "lib/index.js does not listen for 'session/event'; compaction would summarize the bootstrap away " +
        'and never re-establish it'
    )
  } else if (!/compaction\/end/.test(source)) {
    fail("the session/event listener does not handle 'compaction/end'; upstream re-runs SessionStart on compact")
  } else if (typeof ctx?.serial !== 'function') {
    note('the installed cordis Context exposes no serial(); bootstrap injection was not driven')
  } else {
    const skillText = await readFile(join(pkgRoot, 'skills', 'using-superpowers', 'SKILL.md'), 'utf8')
    const injected = []
    const agentFor = (session) => ({
      session,
      inject(message) {
        injected.push(message)
      }
    })
    const header = { version: 1, id: 'compat', createdAt: 0, isSeeded: false }
    const realSession = { header }
    const childSession = {
      header: { ...header, id: 'compat-child', origin: 'subagent', delegationDepth: 1 }
    }
    await ctx.serial('agent/created', { agent: agentFor(realSession), source: { kind: 'fresh' } })
    await ctx.serial('agent/created', { agent: agentFor(childSession), source: { kind: 'fresh' } })
    if (injected.length !== 1) {
      fail(
        `driving agent/created injected ${injected.length} bootstrap message(s), expected 1 ` +
          '(the bootstrap must fire once per real session and never in a subagent session)'
      )
    } else {
      const message = injected[0]
      const text = message.content.map((block) => block.text).join('')
      if (message.role !== 'user') fail(`the bootstrap message has role ${message.role}, expected user`)
      if (typeof message.id !== 'string' || message.id === '') fail('the bootstrap message has no id')
      if (!Object.isFrozen(message)) fail('the bootstrap message is not frozen; the SDK freezes every message')
      if (!text.startsWith('<EXTREMELY_IMPORTANT>')) {
        fail('the bootstrap message does not open with <EXTREMELY_IMPORTANT>')
      }
      if (!text.includes(skillText)) {
        fail('the bootstrap message does not carry the using-superpowers SKILL.md text')
      }
      if (!text.includes("use the 'skill' tool")) {
        fail('the bootstrap message does not name the harness skill tool')
      }
      // A compaction replaces the span the bootstrap opened, so the plugin has
      // to re-inject on a clean `compaction/end` — and must not when compaction
      // failed, because then nothing was replaced.
      const settle = () => new Promise((resolve) => setImmediate(resolve))
      const beforeCompaction = injected.length
      await ctx.serial('session/event', realSession, {
        type: 'compaction/end',
        data: { compactionId: 'compat-1', turn: 1 }
      })
      await settle()
      if (injected.length !== beforeCompaction + 1) {
        fail(
          `a clean compaction/end re-injected ${injected.length - beforeCompaction} bootstrap message(s), ` +
            'expected 1 (upstream re-runs its SessionStart hook on compact)'
        )
      } else {
        await ctx.serial('session/event', realSession, {
          type: 'compaction/end',
          data: { compactionId: 'compat-2', turn: 2, error: 'summarizer failed' }
        })
        await ctx.serial('session/event', childSession, {
          type: 'compaction/end',
          data: { compactionId: 'compat-3', turn: 1 }
        })
        await settle()
        if (injected.length !== beforeCompaction + 1) {
          fail('a failed compaction, or a subagent session, re-injected the bootstrap')
        } else if (problems.length === 0) {
          console.log(
            `bootstrap    : agent/created injects ${text.length} chars of using-superpowers; ` +
              'refreshed on compaction/end; subagent sessions skipped'
          )
        }
      }
    }
  }
}

// ---- report ------------------------------------------------------------------
for (const line of notes) console.log(`note         : ${line}`)
if (problems.length > 0) {
  console.error(`\ncheck-dsh-compat: ${problems.length} problem(s)\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
const staticSkipped = notes.some((line) => line.includes('static contract skipped'))
if (staticSkipped) {
  console.log('\ncheck-dsh-compat: OK — runtime contracts match; static contract was not available')
} else {
  console.log('\ncheck-dsh-compat: OK — this plugin matches the installed DSH SDK')
}
