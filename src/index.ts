#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { convertPlugin, pluginSkillNames, writeCustomAgents } from './convert.js';
import { getTarget } from './targets.js';

interface Args {
  _: string[];
  out?: string;
  target: string;
  strict: boolean;
  codexHome?: string;
}

function parse(argv: string[]): Args {
  const a: Args = { _: [], target: 'codex', strict: true };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--target') a.target = argv[++i];
    else if (t === '--no-strict') a.strict = false;
    else if (t === '--codex-home') a.codexHome = argv[++i];
    else if (t === '-h' || t === '--help') a._.push('help');
    else a._.push(t);
  }
  return a;
}

function usage(): void {
  process.stdout.write(`skillport — port Claude Code skill plugins to other agent platforms

Usage:
  skillport convert <pluginDir...> [--out <dir>] [--target codex] [--no-strict]
  skillport verify  <bundleDir>
  skillport install <bundleDir> [--codex-home <path>]

Notes:
  convert  fails (exit 1) if any conversion gate is violated, unless --no-strict.
  verify   installs into a throwaway HOME and asserts Codex discovers every skill
           (uses 'codex debug prompt-input' — no model call; skips if no codex).
  install  symlinks the bundle into <codex-home>/.agents/skills (default ~).
`);
}

function cmdConvert(a: Args): number {
  const target = getTarget(a.target);
  const out = path.resolve(a.out ?? path.join(process.cwd(), 'dist', target.id));
  const plugins = a._.slice(1);
  if (plugins.length === 0) {
    process.stderr.write('convert: need at least one plugin directory\n');
    return 1;
  }
  // Pre-pass: learn every plugin's skill names so cross-PLUGIN refs can be
  // validated (e.g. code-forge referencing $spec-forge-tech-design).
  const known = new Map<string, Set<string>>();
  for (const p of plugins) {
    try {
      const { ns, names } = pluginSkillNames(path.resolve(p));
      known.set(ns, names);
    } catch {
      /* ignore: unknown/invalid plugin reported during convert */
    }
  }

  let bad = 0;
  for (const p of plugins) {
    const r = convertPlugin(path.resolve(p), target, out, known);
    process.stdout.write(
      `\n✓ ${r.ns} -> ${path.relative(process.cwd(), r.bundleDir)}\n` +
        `  skills: ${r.skills.length}  inlined: ${r.inlined}  ` +
        `cross-refs: ${r.crossRefs}  subagents-adapted: ${r.subagents}\n`,
    );
    if (r.violations.length) {
      bad += r.violations.length;
      process.stdout.write(`  ✗ ${r.violations.length} gate violation(s):\n`);
      for (const v of r.violations) process.stdout.write(`    - ${v}\n`);
    } else {
      process.stdout.write(`  ✓ all gates passed (no dangling includes / refs)\n`);
    }
    for (const w of r.warnings) process.stdout.write(`  ⚠ ${w}\n`);
  }
  // Emit custom agents once (shared across bundles; installed to ~/.codex/agents).
  const agents = writeCustomAgents(out, target);
  if (agents.length) {
    process.stdout.write(
      `\n✓ ${agents.length} custom agent(s) -> ${path.relative(process.cwd(), path.join(out, '.codex', 'agents'))}/\n` +
        `  ${target.customAgents.map((x) => x.name).join(', ')}\n` +
        `  install with: skillport install <bundle>  (also copies agents to ~/.codex/agents)\n`,
    );
  }
  if (bad && a.strict) {
    process.stderr.write(`\nFAILED: ${bad} gate violation(s). Use --no-strict to emit anyway.\n`);
    return 1;
  }
  return 0;
}

/** Symlink a bundle into <home>/.agents/skills and copy sibling agents. */
function installBundle(bundle: string, home: string): { dest: string; agents: number } {
  const dest = path.join(home, '.agents', 'skills', path.basename(bundle));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.symlinkSync(bundle, dest);

  let agents = 0;
  const agentsSrc = path.join(path.dirname(bundle), '.codex', 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(home, '.codex', 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });
    for (const f of fs.readdirSync(agentsSrc)) {
      if (!f.endsWith('.toml')) continue;
      fs.copyFileSync(path.join(agentsSrc, f), path.join(agentsDest, f));
      agents++;
    }
  }
  return { dest, agents };
}

/** Skill names Codex will expose for a bundle: <ns>:<ns> + <ns>:<subdir>. */
function expectedSkillNames(bundle: string): Set<string> {
  const ns = path.basename(bundle);
  const names = new Set<string>([`${ns}:${ns}`]);
  for (const e of fs.readdirSync(bundle, { withFileTypes: true })) {
    if (e.isDirectory() && fs.existsSync(path.join(bundle, e.name, 'SKILL.md'))) {
      names.add(`${ns}:${e.name}`);
    }
  }
  return names;
}

function cmdInstall(a: Args): number {
  const bundle = path.resolve(a._[1] ?? '');
  if (!fs.existsSync(path.join(bundle, 'SKILL.md'))) {
    process.stderr.write(`install: ${bundle} is not a bundle (no SKILL.md)\n`);
    return 1;
  }
  const home = a.codexHome ?? os.homedir();
  const { dest, agents } = installBundle(bundle, home);
  process.stdout.write(`Installed ${dest} -> ${bundle}\nRestart Codex, then use /skills or name a skill like ${path.basename(bundle)}:idea.\n`);
  if (agents) process.stdout.write(`Installed ${agents} custom agent(s) -> ${path.join(home, '.codex', 'agents')}\n`);
  return 0;
}

/**
 * Runtime verify: install the bundle into a throwaway HOME, ask Codex to render
 * its model-visible prompt (no model call), and assert every expected skill was
 * discovered. Proves the bundle actually loads in Codex.
 */
function cmdVerify(a: Args): number {
  const bundle = path.resolve(a._[1] ?? '');
  if (!fs.existsSync(path.join(bundle, 'SKILL.md'))) {
    process.stderr.write(`verify: ${bundle} is not a bundle (no SKILL.md)\n`);
    return 1;
  }
  try {
    execFileSync('codex', ['--version'], { stdio: 'ignore' });
  } catch {
    process.stdout.write('verify: codex CLI not found — skipping runtime check.\n');
    return 0;
  }
  const expected = expectedSkillNames(bundle);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillport-verify-'));
  try {
    installBundle(bundle, tmp);
    const out = execFileSync('codex', ['debug', 'prompt-input', 'x'], {
      env: { ...process.env, HOME: tmp },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const ns = path.basename(bundle);
    const found = new Set<string>();
    for (const m of out.matchAll(new RegExp(`\\b(${ns}:[a-z][a-z0-9-]*)`, 'g'))) found.add(m[1]);
    const missing = [...expected].filter((n) => !found.has(n)).sort();
    process.stdout.write(`verify ${ns}: expected ${expected.size}, discovered ${[...found].filter((n) => expected.has(n)).length}\n`);
    if (missing.length) {
      for (const m of missing) process.stdout.write(`  ✗ not discovered by Codex: ${m}\n`);
      process.stderr.write(`FAILED: ${missing.length} skill(s) not discovered.\n`);
      return 1;
    }
    process.stdout.write(`  ✓ all skills discovered & loaded by Codex (no model call)\n`);
    return 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main(): number {
  const a = parse(process.argv.slice(2));
  const cmd = a._[0];
  if (!cmd || cmd === 'help') {
    usage();
    return cmd ? 0 : 1;
  }
  switch (cmd) {
    case 'convert':
      return cmdConvert(a);
    case 'install':
      return cmdInstall(a);
    case 'verify':
      return cmdVerify(a);
    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      usage();
      return 1;
  }
}

process.exit(main());
