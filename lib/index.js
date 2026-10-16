// superpowers-dsh: Superpowers skills for the DeepSeek Harness.
//
// The plugin owns the two halves upstream declares in
// `docs/porting-to-a-new-harness.md`:
//
//   1. Skills. It registers one skill provider into the HOST layer of the
//      `ctx.skills` registry, so every agent preset's scope chain merges these
//      skills. Skill bodies live in `../skills/<name>/SKILL.md` inside this
//      package; the provider locates them from `import.meta.url` (an assembly
//      fact of this package, never user config) and loads bodies on demand.
//
//      The provider protocol mirrors @deepseek-ai/dsh-skill-filesystem:
//        - list()  discovers directory-bundle candidates (name/description from
//          YAML frontmatter, body left unread until requested)
//        - get()   parses the winning candidate's SKILL.md and returns the full
//          definition with a directory resource base for relative references
//
//   2. Bootstrap. On `agent/created` it injects the full text of the
//      `using-superpowers` skill as one user message, which is what makes the
//      skill files operational instead of inert. Upstream calls this "the
//      entire integration"; the Claude Code adapter implements it as a
//      SessionStart shell hook, and this plugin implements the same thing
//      in-process, the way @deepseek-ai/dsh-hooks-claude-code does.
//
// @module superpowers-dsh
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const name = 'superpowers-dsh'
const inject = ['skills']

/** Registry precedence for packaged skill providers: ranks below the local bundled root. */
const PACKAGED_SKILL_RANK = 550

/** The source bucket these skills advertise under (prompt-visible metadata). */
const SOURCE = 'custom'

/**
 * The skill whose full body opens every session. Upstream's SessionStart hook
 * reads this same file; without it the skills are present on disk and never
 * invoked.
 */
const BOOTSTRAP_SKILL = 'using-superpowers'

/** Producer source stamped on the injected bootstrap message. */
const BOOTSTRAP_SOURCE = { kind: 'superpowers-dsh' }

/**
 * Parse the YAML frontmatter block of a SKILL.md into metadata plus body.
 * Handles only the scalar fields DSH skill discovery consumes (name,
 * description, whenToUse); richer metadata passes through verbatim.
 * @param text - the raw skill file contents.
 * @returns parsed metadata object and the markdown body after the block, or
 *   null when the file has no frontmatter block at all.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const block = text.slice(3, end)
  const body = text.slice(end + 4).replace(/^\n+/, '')
  const metadata = {}
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    metadata[match[1]] = value
  }
  return { metadata, body }
}

/**
 * Read and parse one skill directory's SKILL.md.
 * @param skillFile - absolute path to the SKILL.md file.
 * @param signal - optional cancellation; aborts the read.
 * @returns the parsed skill record, or undefined when the file vanished.
 */
async function parseSkillFile(skillFile, signal) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return undefined
  }
  if (signal?.aborted) return undefined
  const parsed = parseFrontmatter(text)
  if (parsed === null) return undefined
  return {
    name: parsed.metadata.name ?? '',
    description: parsed.metadata.description ?? '',
    whenToUse: parsed.metadata.whenToUse,
    metadata: parsed.metadata,
    content: parsed.body
  }
}

/**
 * Discover packaged skill candidates by scanning the package's `skills/`
 * directory: one subdirectory per skill, each carrying a SKILL.md.
 * @param skillsRoot - absolute path to this package's skills directory.
 * @param signal - optional cancellation.
 * @returns the candidate list.
 */
async function discoverCandidates(skillsRoot, signal) {
  let entries
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (signal?.aborted) break
    if (!entry.isDirectory()) continue
    const skillDir = join(skillsRoot, entry.name)
    const skillFile = join(skillDir, 'SKILL.md')
    const parsed = await parseSkillFile(skillFile, signal)
    if (parsed === undefined) continue
    candidates.push({
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: { modelInvocable: true, userInvocable: true },
      source: SOURCE,
      provider: name,
      rank: PACKAGED_SKILL_RANK,
      locator: skillDir,
      path: skillFile,
      ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {})
    })
  }
  return candidates
}

/**
 * Compose the session bootstrap from the using-superpowers skill body.
 * Byte-identical to upstream `hooks/session-start` except for the harness's
 * own skill-tool name (DSH registers `skill`, Claude Code registers `Skill`).
 * @param skillText - the raw SKILL.md contents, frontmatter included.
 * @returns the wrapped bootstrap text injected as one user message.
 */
function composeBootstrap(skillText) {
  return [
    '<EXTREMELY_IMPORTANT>',
    'You have superpowers.',
    '',
    `**Below is the full content of your 'superpowers:${BOOTSTRAP_SKILL}' skill - your introduction to using skills. For all other skills, use the 'skill' tool:**`,
    '',
    skillText,
    '</EXTREMELY_IMPORTANT>'
  ].join('\n')
}

/** Recursively freeze a message tree the way the SDK's createMessage does. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Object.keys(value)) deepFreeze(value[key])
  return Object.freeze(value)
}

/**
 * Build one identified, frozen user message. The SDK exports this as
 * `createUserMessage`, but a third-party plugin must not assume the harness
 * SDK is resolvable from its own install path, so the four lines are inlined
 * here (official plugins in the shipment bundle their own copy for the same
 * reason).
 * @param input - content and source for the new message.
 * @returns an immutable user message with a fresh identity.
 */
function createUserMessage(input) {
  return deepFreeze({ ...input, role: 'user', id: randomUUID() })
}

/**
 * Whether an agent belongs to a delegated subagent session. Upstream injects
 * once per real session, and a DSH subagent is a separate session with its own
 * brief, so skipping it avoids repeating a multi-kilobyte prompt per dispatch.
 * Reads `session.header`, the same predicate dsh-workspace-changes applies.
 * @param agent - the agent announced by `agent/created`.
 * @returns true when the session is a subagent or nested delegation.
 */
function isSubagentSession(agent) {
  const header = agent?.session?.header
  return header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0
}

/** Register the packaged superpowers provider on `ctx.skills`. */
function apply(ctx) {
  const skillsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
  ctx.skills.registerProvider((control) => ({
    name,
    async list(options) {
      return discoverCandidates(skillsRoot, options.signal)
    },
    async get(candidate, options) {
      const parsed = await parseSkillFile(candidate.path, options.signal)
      if (parsed === undefined) return undefined
      return {
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        source: SOURCE,
        provider: name,
        resourceBase: { kind: 'directory', path: candidate.locator },
        path: candidate.path,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
        content: parsed.content
      }
    }
  }))

  // Bootstrap: inject the using-superpowers body into every new session. The
  // file is read once per process, on first use, so session creation costs no
  // file I/O after the first read. `agent/created` is dispatched serially, so
  // the injection completes before the session proceeds.
  let warned = false
  const bootstrap = readFile(join(skillsRoot, BOOTSTRAP_SKILL, 'SKILL.md'), 'utf8').then(
    composeBootstrap,
    () => undefined
  )
  ctx.on('agent/created', async ({ agent }) => {
    if (isSubagentSession(agent)) return
    const text = await bootstrap
    if (text === undefined) {
      if (!warned) {
        warned = true
        ctx.logger?.warn?.(
          `${name}: cannot read skills/${BOOTSTRAP_SKILL}/SKILL.md; sessions start without the superpowers bootstrap`
        )
      }
      return
    }
    agent.inject(
      createUserMessage({
        content: [{ type: 'text', text }],
        source: BOOTSTRAP_SOURCE
      })
    )
  })
}

export { apply, name, inject }
export default { apply, name, inject }
