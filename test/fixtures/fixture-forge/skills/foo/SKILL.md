---
name: foo
description: A fixture skill exercising includes, cross-refs, instructions, and subagents.
instructions: Always validate inputs before proceeding.
---

# Foo

Before doing anything, read the shared discipline:

@../shared/common.md

When generating a PRD, hand off to /spec-forge:prd and then /spec-forge:review.

For heavy work, launch `Task(subagent_type="general-purpose")` and wait for it.
