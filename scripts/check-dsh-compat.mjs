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
  try {
    const { Context } = await import(cordis.url)
    const sdk = await import(skill.url)
    if (typeof sdk.BUNDLED_SKILL_RANK === 'number') bundledRank = sdk.BUNDLED_SKILL_RANK
    else fail('installed SDK no longer exports BUNDLED_SKILL_RANK at runtime')
    const ctx = new Context()
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
