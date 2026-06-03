import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertPlugin, pluginSkillNames } from '../dist/convert.js';
import { CODEX } from '../dist/targets.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'fixture-forge');
// fixture-forge isn't a real registered plugin, so inject its spec.
const SPEC = { ns: 'fixture-forge', nonSkillDirs: ['shared'], aliases: {} };

function convert() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-bundler-golden-'));
  const r = convertPlugin(FIXTURE, CODEX, out, undefined, SPEC);
  const foo = fs.readFileSync(path.join(out, 'fixture-forge', 'foo', 'SKILL.md'), 'utf8');
  return { r, foo, out };
}

test('conversion passes all gates', () => {
  const { r } = convert();
  assert.deepEqual(r.violations, [], 'no gate violations');
});

test('frontmatter name equals dir (no prefix)', () => {
  const { foo } = convert();
  assert.match(foo, /^name: foo$/m);
});

test('external @../shared include is inlined, not left dangling', () => {
  const { foo } = convert();
  assert.ok(!/@\.\.\/shared\//.test(foo), 'no @../shared/ remains');
  assert.ok(foo.includes('Shared Discipline'), 'shared content inlined');
});

test('slash-invocation cross-refs become $-prefixed Codex mentions', () => {
  const { foo } = convert();
  assert.ok(foo.includes('$spec-forge:prd'), '$spec-forge:prd present');
  assert.ok(foo.includes('$spec-forge:review'), '$spec-forge:review present');
  assert.ok(!/\/spec-forge:prd/.test(foo), 'no leftover slash form');
});

test('frontmatter instructions merged into body', () => {
  const { foo } = convert();
  assert.ok(!/^instructions:/m.test(foo.split('\n---')[0]), 'instructions removed from frontmatter');
  assert.ok(foo.includes('Always validate inputs'), 'instructions text in body');
});

test('Task(subagent_type) adapted to a Codex subagent', () => {
  const { r, foo } = convert();
  assert.ok(!/Task\(subagent_type/.test(foo), 'no raw Task(subagent_type) remains');
  assert.ok(foo.includes('a subagent (Codex'), 'adapted phrasing present');
  assert.equal(r.subagents, 1, 'one subagent adapted');
});

test('pluginSkillNames includes the qualified root orchestrator skill', () => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-bundler-plugin-names-'));
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(plugin, 'skills', 'prd-generation'), { recursive: true });
  fs.writeFileSync(
    path.join(plugin, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'spec-forge' }),
  );
  fs.writeFileSync(path.join(plugin, 'skills', 'prd-generation', 'SKILL.md'), '# PRD\n');

  const { names } = pluginSkillNames(plugin);

  assert.ok(names.has('spec-forge:spec-forge'), 'root orchestrator is a qualified Codex skill');
  assert.ok(names.has('spec-forge:prd'), 'subskill aliases remain qualified');
  assert.ok(!names.has('spec-forge'), 'bare namespace is not a Codex-visible skill name');
});

test('unregistered plugin converts via auto-derived spec (no registry entry)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skill-bundler-generic-'));
  // no specOverride, no `known` map — exercises resolvePlugin() fallback
  const r = convertPlugin(FIXTURE, CODEX, out);
  assert.deepEqual(r.violations, [], 'generic plugin passes all gates');
  assert.ok(r.skills.includes('foo'), 'foo skill produced');

  const foo = fs.readFileSync(path.join(out, 'fixture-forge', 'foo', 'SKILL.md'), 'utf8');
  assert.ok(!/@\.\.\/shared\//.test(foo), 'shared include inlined even without registry');
  assert.ok(foo.includes('$spec-forge:prd'), 'cross-plugin ref to a registered ns rewritten');
  assert.ok(foo.includes('$fixture-forge:foo'), "plugin's own-namespace self-ref rewritten");
});
