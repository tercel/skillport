// Known Claude Code plugins in this workspace. Hardcoded on purpose:
// perfect cross-reference rewriting (including cross-plugin refs like
// code-forge -> spec-forge) requires knowing every namespace and alias map.

export interface PluginSpec {
  /** Plugin namespace (matches .claude-plugin/plugin.json name). */
  ns: string;
  /** Directories under skills/ that are NOT invokable skills (shared refs, workspaces). */
  nonSkillDirs: string[];
  /**
   * Maps a skill directory name to the short alias used in user-facing
   * invocation (and therefore in the Codex prefixed skill name).
   * Only list entries that differ from the directory name.
   */
  aliases: Record<string, string>;
}

export const REGISTRY: Record<string, PluginSpec> = {
  'spec-forge': {
    ns: 'spec-forge',
    nonSkillDirs: ['shared'],
    aliases: {
      'prd-generation': 'prd',
      'srs-generation': 'srs',
      'tech-design-generation': 'tech-design',
      'test-cases-generation': 'test-cases',
      'test-plan-generation': 'test-plan',
    },
  },
  'code-forge': {
    ns: 'code-forge',
    nonSkillDirs: ['shared'],
    aliases: {},
  },
  'apcore-skills': {
    ns: 'apcore-skills',
    nonSkillDirs: ['shared', 'sdk-workspace'],
    aliases: {},
  },
  'theory-forge': {
    ns: 'theory-forge',
    nonSkillDirs: ['shared'],
    aliases: {},
  },
  'research-forge': {
    ns: 'research-forge',
    nonSkillDirs: [],
    aliases: {},
  },
  'hype-forge': {
    ns: 'hype-forge',
    nonSkillDirs: [],
    aliases: {},
  },
};

/** The set of namespaces whose cross-references we know how to rewrite. */
export const KNOWN_NAMESPACES = Object.keys(REGISTRY);

/** Resolve a plugin spec by namespace, throwing if unknown. */
export function getPlugin(ns: string): PluginSpec {
  const spec = REGISTRY[ns];
  if (!spec) {
    throw new Error(
      `Unknown plugin namespace "${ns}". Known: ${KNOWN_NAMESPACES.join(', ')}. ` +
        `Add it to src/registry.ts before converting.`,
    );
  }
  return spec;
}

/** Short alias for a skill directory (alias map or identity). */
export function aliasFor(spec: PluginSpec, skillDir: string): string {
  return spec.aliases[skillDir] ?? skillDir;
}

/**
 * Bundle sub-directory (and frontmatter name) for a skill — just the alias, NO
 * namespace prefix. Codex auto-namespaces by the bundle dir, exposing the skill
 * as `<ns>:<alias>` (e.g. spec-forge:prd). Verified via `codex debug
 * prompt-input`; an explicit prefix would double up (spec-forge:spec-forge-prd).
 */
export function codexSkillName(spec: PluginSpec, skillDir: string): string {
  return aliasFor(spec, skillDir);
}

/** Codex-visible qualified name `<ns>:<alias>` (e.g. spec-forge:prd). */
export function codexQualifiedName(spec: PluginSpec, skillDir: string): string {
  return `${spec.ns}:${aliasFor(spec, skillDir)}`;
}
