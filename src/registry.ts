// Known Claude Code plugins in this workspace. Registered on purpose: precise
// cross-reference rewriting (including cross-plugin refs like code-forge ->
// spec-forge) and alias maps (prd-generation -> prd) need the namespace + alias
// data. Registration is OPTIONAL — unregistered plugins convert via the generic
// fallback in resolvePlugin() (empty aliases, SKILL.md-presence skill detection,
// own-namespace cross-ref rewriting). Register a plugin only when you need its
// aliases or want its namespace recognized in OTHER plugins' cross-references.

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
  /**
   * Reference directory names whose prose lazy-load paths (`../<dir>/x.md`) are
   * relocated into a sibling `<ns>-<dir>` bundle dir. Defaults to ['shared'].
   */
  sharedDirs?: string[];
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

/**
 * Resolve a plugin spec, falling back to a generic default for unregistered
 * plugins (so any standard Claude plugin converts). Registered specs always win,
 * keeping the forge suites byte-identical. The default derives nothing special:
 * empty aliases, no extra non-skill dirs (the SKILL.md presence check already
 * excludes reference dirs), and the conventional ['shared'] relocation.
 */
export function resolvePlugin(ns: string): PluginSpec {
  return REGISTRY[ns] ?? { ns, nonSkillDirs: [], aliases: {} };
}

/** Whether a namespace is a registered (forge) plugin. */
export function isRegistered(ns: string): boolean {
  return ns in REGISTRY;
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
