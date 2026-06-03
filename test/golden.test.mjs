import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { convertPlugin } from '../dist/convert.js';
import { CODEX } from '../dist/targets.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'fixture-forge');
// fixture-forge isn't a real registered plugin, so inject its spec.
const SPEC = { ns: 'fixture-forge', nonSkillDirs: ['shared'], aliases: {} };

function convert() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skillport-golden-'));
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

test('cross-refs rewritten to Codex skill names (slash stripped, colon kept)', () => {
  const { foo } = convert();
  assert.ok(foo.includes('spec-forge:prd'), 'spec-forge:prd present');
  assert.ok(!/\/spec-forge:prd/.test(foo), 'leading slash stripped');
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
