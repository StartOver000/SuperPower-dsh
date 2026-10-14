import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const checkerPath = fileURLToPath(new URL('./check-dsh-compat.mjs', import.meta.url))

function runChecker(env, scriptPath = checkerPath) {
  return spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' })
}

test('uses the active DSH profile node_modules directory by default', () => {
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-profile-'))
  const env = { ...process.env, DSH_PROFILE_DIR: profileDir }
  delete env.DSH_NODE_MODULES

  try {
    const result = runChecker(env)
    assert.equal(result.status, 1)
    assert.ok(result.stderr.includes(join(profileDir, 'node_modules')))
  } finally {
    rmSync(profileDir, { recursive: true, force: true })
  }
})

test('keeps runtime checks when the bundled SDK omits type declarations', () => {
  const modulesDir = mkdtempSync(join(tmpdir(), 'dsh-sdk-no-types-'))
  const env = { ...process.env, DSH_NODE_MODULES: modulesDir }
  delete env.DSH_PROFILE_DIR

  const addPackage = (name, source) => {
    const dir = join(modulesDir, ...name.split('/'))
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      main: 'lib/index.js'
    }))
    writeFileSync(join(dir, 'lib', 'index.js'), source)
  }

  addPackage('@deepseek-ai/cordis', 'export class Context {}')
  addPackage('@deepseek-ai/dsh-skill', `
    export const BUNDLED_SKILL_RANK = 600
    export class SkillRegistry {
      constructor(ctx) {
        const providers = []
        ctx.skills = {
          registerProvider(create) { providers.push(create({})) },
          async list(options = {}) {
            return (await Promise.all(providers.map((provider) => provider.list(options)))).flat()
          },
          async get(name, options = {}) {
            for (const provider of providers) {
              const candidate = (await provider.list(options)).find((item) => item.name === name)
              if (candidate) return provider.get(candidate, options)
            }
          }
        }
      }
    }
  `)

  try {
    const result = runChecker(env)
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /static contract skipped/)
    assert.match(result.stdout, /mounted\s+: 15 skills/)
    assert.match(result.stdout, /BUNDLED_SKILL_RANK=600/)
  } finally {
    rmSync(modulesDir, { recursive: true, force: true })
  }
})

test('fails when the packaged skill rank cannot be read', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-no-rank-'))
  const modulesDir = join(root, 'node_modules')
  const env = { ...process.env, DSH_NODE_MODULES: modulesDir }
  delete env.DSH_PROFILE_DIR

  const addPackage = (name, source) => {
    const dir = join(modulesDir, ...name.split('/'))
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      main: 'lib/index.js'
    }))
    writeFileSync(join(dir, 'lib', 'index.js'), source)
  }

  try {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, 'lib'), { recursive: true })
    writeFileSync(join(root, 'scripts', 'check-dsh-compat.mjs'), readFileSync(checkerPath, 'utf8'))
    writeFileSync(join(root, 'lib', 'index.js'), `
      export function apply(ctx) {
        ctx.skills.registerProvider(() => ({
          async list() { return [{ name: 'demo' }] },
          async get() { return { content: 'body', resourceBase: { kind: 'directory' } } }
        }))
      }
    `)
    addPackage('@deepseek-ai/cordis', 'export class Context {}')
    addPackage('@deepseek-ai/dsh-skill', `
      export const BUNDLED_SKILL_RANK = 600
      export class SkillRegistry {
        constructor(ctx) {
          const providers = []
          ctx.skills = {
            registerProvider(factory) { providers.push(factory({})) },
            async list(options = {}) {
              return (await Promise.all(providers.map((provider) => provider.list(options)))).flat()
            },
            async get(name, options = {}) {
              for (const provider of providers) {
                const candidate = (await provider.list(options)).find((item) => item.name === name)
                if (candidate) return provider.get(candidate, options)
              }
            }
          }
        }
      }
    `)

    const result = runChecker(env, join(root, 'scripts', 'check-dsh-compat.mjs'))
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /could not find PACKAGED_SKILL_RANK in lib\/index\.js/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
