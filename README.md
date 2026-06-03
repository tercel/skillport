# agent-skill-bundler

Port Claude Code skill plugins to other agent platforms. **Codex** is the first
target; the pipeline is target-agnostic (see *Adding another target*). Works on
**any** standard Claude plugin, and is *tuned* for this workspace's `*-forge`
plugins — registered ones get precise alias maps and **cross-plugin** reference
rewriting (e.g. `code-forge` → `spec-forge`) that a generic converter can't do.

Registered plugins (optional, for precision): `spec-forge`, `code-forge`,
`apcore-skills`, `theory-forge`, `research-forge`, `hype-forge` (see
`src/registry.ts`). Unregistered plugins convert via a generic auto-derived spec.

## Why not an existing tool?

These plugins share a structure that off-the-shelf converters mishandle:

- Heavy `@../shared/*.md` **cross-skill includes** — `cc2codex` drops the
  `skills/shared/` dir (dangling refs); `npx skills` / symlink tools don't
  transform at all.
- A plugin **namespace** (`spec-forge:`) with **bare, collision-prone** skill
  names (`idea`, `review`, `audit`) — Codex has no plugin namespace.
- Prose **cross-references** in Claude slash form (`/spec-forge:prd`), including
  references *between* plugins.

## Conversion model (Codex)

Each Claude plugin becomes a bundle dir whose flat sub-skills Codex discovers via
its recursive `**/SKILL.md` scan. **Codex auto-namespaces by the bundle dir**, so
a skill named `prd` under `spec-forge/` is exposed as `spec-forge:prd` — matching
the Claude form exactly. (Verified with `codex debug prompt-input`; an explicit
`spec-forge-` prefix would double up to `spec-forge:spec-forge-prd`.)

```
spec-forge/                  # orchestrator -> spec-forge:spec-forge
  idea/SKILL.md              # -> spec-forge:idea
  prd/SKILL.md               # -> spec-forge:prd   (alias: prd-generation -> prd)
  ...
  spec-forge-shared/         # relocated shared refs (only if referenced)
  .codex-plugin/plugin.json
```

Transform passes applied to **every** `.md` (SKILL.md + bundled `references/`):

1. **Inline external includes** — `@../shared/x.md` content is inlined (the file
   won't travel with a flat skill). Trailing section hints are preserved.
2. **Namespace identity** — directory **and** frontmatter `name` are the bare
   alias (no prefix); Codex supplies the `<ns>:` namespace from the bundle dir.
3. **Cross-reference rewrite** — `/spec-forge:prd` → `spec-forge:prd` (strip the
   slash; the colon form is the Codex skill name), across **all known
   namespaces** (cross-plugin refs included).
4. **Skill-path rewrite** — `../skills/review/SKILL.md` → `spec-forge:review`.
5. **Shared-path relocation** — prose lazy-load refs (`../shared/x.md`,
   theory-forge style) → a sibling `<ns>-shared/` dir with depth-aware relative
   paths (orchestrator / sub-skill / nested ref each differ).
6. **Subagent adaptation** — `Task(subagent_type="general-purpose")` → Codex's
   built-in `default` agent (see [Codex Subagents](https://developers.openai.com/codex/subagents));
   `general-purpose`→`default`, `prompt=<X>` hints preserved. Codex spawns
   subagents in isolated threads with summarized results — same semantics as
   Claude's Task tool, so this is near-lossless.
7. **Instructions merge** — frontmatter `instructions:` is folded into the body
   (Codex reads only `name` + `description` from frontmatter).
8. **Tool remap** — `AskUserQuestion` → "ask the user directly", etc.

## Self-enforced gates (no half-product)

`convert` exits non-zero if any bundle violates a gate:

- **A** — no unresolved external `@../` include remains.
- **B** — no leftover Claude-style **slash** ref (`/<ns>:<skill>`) remains (the
  bare `<ns>:<skill>` colon form is the correct Codex name and is allowed).
- **C** — every skill's directory name equals its frontmatter `name`.
- **D** — every relocated `<ns>-shared/...` reference resolves on disk.

Non-fatal **warnings** surface source-side issues the conversion can't fix:
dangling cross-refs (`spec-forge:feature`), ambiguous cross-plugin bare paths,
and any unadapted `Task(...)` form (safety net — should be zero).

## Custom agents (optional, tunable)

Beyond the built-in `default`, the Codex target defines a few tuned agents
(`reviewer`, `spec-author`, `analyst`) emitted as `<out>/.codex/agents/*.toml`.
`adaptSubagents` routes a delegation to one of them when its context names a
role skill — via the exact `prompt=<X launch prompt>` hint, or a `:skill` /
`-skill` token in the surrounding lines — otherwise it falls back to `default`.
`install` copies these to `~/.codex/agents/`. The agent set and the keyword
`roleRules` live in `src/targets.ts` and are meant to be edited.

Routing is a best-effort heuristic: a delegation that only inlines a role
description (no skill token) falls back to `default`, which is still correct —
the prompt itself drives the behaviour; the custom agent only adds tuning.

## Usage

```bash
npm install && npm run build

# convert one or more plugins (gates enforced)
agent-skill-bundler convert ../spec-forge ../code-forge ../apcore-skills --out ./dist/codex

# verify a bundle actually loads in Codex (no model call; needs codex installed)
agent-skill-bundler verify ./dist/codex/spec-forge

# install a bundle into Codex (symlink; Codex follows it for discovery)
agent-skill-bundler install ./dist/codex/spec-forge          # -> ~/.agents/skills/spec-forge
agent-skill-bundler install ./dist/codex/spec-forge --codex-home /tmp/test
```

In Codex: restart, then `/skills` or name a skill, e.g. `spec-forge:prd`.

## Verifying (three tiers)

1. **Gates** — `convert` fails on dangling includes / leftover slash refs /
   name mismatch / unresolved shared paths. (Output is well-formed.)
2. **Runtime discovery** — `agent-skill-bundler verify <bundle>` installs into a throwaway
   HOME and runs `codex debug prompt-input` (renders the model-visible prompt
   with **no model call, no cost**); asserts every expected `<ns>:<skill>` was
   discovered. (Codex actually loads them.)
3. **Interactive** — `codex` → `/skills`, then invoke `spec-forge:prd` on a real
   task and watch it run. (End-to-end; this one calls the model.)

`npm test` runs golden tests (`test/fixtures/fixture-forge`) for regression
safety on the converter itself.

## Adding another target (Gemini, OpenCode, ...)

The core pipeline is target-agnostic; a target is data in `src/targets.ts`
(`skillsDir`, `toolRemap`, `expandsAtIncludes`). Gemini, for example, natively
expands `@` includes and supports namespaced `.toml` commands, so its target
would set `expandsAtIncludes: true` and use a different layout emitter.

## Scope

Works on **any** standard Claude plugin (`.claude-plugin/plugin.json` +
`skills/<name>/SKILL.md`): unregistered plugins convert via a generic
auto-derived spec (empty aliases, SKILL.md-presence skill detection,
own-namespace cross-ref rewriting). **Registering** a plugin in
`src/registry.ts` is optional and adds precision — short alias maps (e.g.
`prd-generation` → `prd`) and recognition of its namespace inside *other*
plugins' cross-references. The six `*-forge` suites are registered.

## License

MIT © tercel
