// Target agent definitions. Codex is implemented; the shape is designed so
// Gemini / OpenCode / Cursor can be added as data without touching the core.

/** A custom Codex agent emitted as a TOML file under .codex/agents/. */
export interface CustomAgent {
  name: string;
  description: string;
  developer_instructions: string;
  model_reasoning_effort?: string;
}

/** Route a subagent delegation to a custom agent when context matches a keyword. */
export interface RoleRule {
  agent: string;
  keywords: string[];
}

export interface Target {
  id: string;
  /** Default user-scope skills directory (~ expanded by caller). */
  skillsDir: string;
  /**
   * Claude-specific tool tokens -> target-appropriate wording. Applied to skill
   * bodies. Keys are matched as whole words (and the Task(...) form specially).
   */
  toolRemap: Record<string, string>;
  /**
   * Whether the agent natively expands `@file` include directives in SKILL.md.
   * Codex does NOT, so external includes must be inlined and internal ones
   * rewritten to explicit read instructions.
   */
  expandsAtIncludes: boolean;
  /**
   * Maps Claude `Task(subagent_type="X")` delegation to this agent's subagent
   * name. `null` means the target has no subagent mechanism (fall back to a
   * warning). For Codex these map to its built-in agents.
   */
  subagentMap: Record<string, string> | null;
  /** Fallback subagent name for unmapped subagent_type values. */
  defaultSubagent?: string;
  /** Custom agents to emit as .codex/agents/*.toml (empty = none). */
  customAgents: CustomAgent[];
  /** Context-keyword rules that route a delegation to a custom agent. */
  roleRules: RoleRule[];
}

export const CODEX: Target = {
  id: 'codex',
  skillsDir: '.agents/skills',
  expandsAtIncludes: false,
  toolRemap: {
    AskUserQuestion: 'ask the user directly',
    TodoWrite: 'the update_plan tool',
    WebFetch: 'web fetch',
    WebSearch: 'web search',
  },
  // Codex built-in agents: default (general-purpose), worker (execution),
  // explorer (read-heavy). Spawned in isolated threads, results summarized back
  // — same semantics as Claude's Task tool. See developers.openai.com/codex/subagents
  subagentMap: { 'general-purpose': 'default' },
  defaultSubagent: 'default',
  // Tunable defaults. A delegation is routed to one of these when the Task site
  // (and its prompt hint / delegated-skill name) matches a role keyword;
  // otherwise it falls back to the built-in `default` agent.
  customAgents: [
    {
      name: 'reviewer',
      description:
        'Reviews specs, code, and theory for correctness, completeness, consistency, and missing coverage. Cites file:line; never fabricates findings.',
      developer_instructions:
        'Review like an owner. Prioritize correctness, security, traceability, and missing tests/coverage. Cite a specific file:line for every finding. Report only what you can verify — do not invent issues. Be concise and actionable.',
      model_reasoning_effort: 'high',
    },
    {
      name: 'spec-author',
      description:
        'Generates specification documents (PRD, SRS, tech design, feature specs, test cases) with rigor and traceability.',
      developer_instructions:
        'Produce implementation-ready specs. Use modal-verb discipline (shall/should/may), exact boundaries and validations, and no "TBD" or "handle appropriately" hand-waving. Preserve requirement IDs and section titles for traceability. Ground every claim in the actual project.',
      model_reasoning_effort: 'high',
    },
    {
      name: 'analyst',
      description:
        'Read-heavy investigation: analyze document or code collections, research, and map themes, gaps, and conflicts. Evidence-based.',
      developer_instructions:
        'Investigate before concluding. Build the landscape first, then cite evidence (file:line or source) for each observation. Surface gaps, conflicts, and staleness. Do not over-claim beyond what the sources support.',
    },
  ],
  roleRules: [
    {
      agent: 'reviewer',
      keywords: ['review', 'audit', 'verify', 'cite-audit', 'consistency', 'counter-argument', 'falsifiability', 'scope'],
    },
    {
      agent: 'spec-author',
      keywords: ['idea', 'prd', 'srs', 'tech-design', 'decompose', 'test-cases', 'test-plan', 'draft', 'concept-import'],
    },
    {
      agent: 'analyst',
      keywords: ['analyze', 'scan', 'compare', 'report', 'cross-lang'],
    },
  ],
};

export const TARGETS: Record<string, Target> = {
  codex: CODEX,
};

export function getTarget(id: string): Target {
  const t = TARGETS[id];
  if (!t) {
    throw new Error(
      `Unknown target "${id}". Known: ${Object.keys(TARGETS).join(', ')}.`,
    );
  }
  return t;
}
