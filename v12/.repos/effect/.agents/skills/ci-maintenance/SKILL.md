---
name: ci-maintenance
description: GitHub Actions maintenance. Use when authoring or reviewing workflows or composite actions, especially event, permission, action-reference, artifact, setup, or concurrency changes.
---

Audit the trust boundary before editing. This skill owns Actions event
semantics, workflow security, permissions, action pinning, setup reuse,
untrusted inputs, timeouts, concurrency, and artifact trust boundaries.

## Workflow

1. Decide whether this is a review or an implementation. Reviews produce
   evidence-backed findings without editing; implementations continue through
   the smallest boundary-preserving change.
2. Inspect every affected workflow, composite action, and caller. List all
   affected jobs and actions before proceeding.
3. For each job, record the trigger, actor/fork status, workflow revision,
   checked-out revision, permissions, credentials, and every external input and
   consumer. Include artifacts, caches, outputs, PR fields, refs, dispatch
   inputs, generated files, and called actions.
4. Consult current GitHub documentation for every platform-sensitive decision.
   Repository examples establish local convention, not platform semantics.
5. Apply every applicable rule:
   - Default workflow permissions to empty and grant minimal job permissions.
   - Reuse the repository's shared setup action unless the environment must differ.
   - Give executable jobs intentional matrices and realistic timeouts.
   - Pin external actions and reusable workflows to full commit SHAs with
     readable release comments; verify each SHA belongs to that upstream release.
   - Analyze event choice, checkout revision, and credential persistence
     together.
   - Pass untrusted expressions through environment variables; validate and
     quote them before use.
   - Derive concurrency from interruption safety.
6. For forks, privileged credentials, publication, or cross-run data, read
   [privileged-workflows.md](privileged-workflows.md).
7. Run the narrowest syntax and repository checks, inspect the complete diff,
   and identify behavior testable only on GitHub-hosted runners.

For local patterns, inspect the current shared setup action and the nearest
workflow with the same trust boundary. Use ordinary check workflows for routine
precedent and privileged publication workflows only for equivalent trust
boundaries.

The task is complete when every affected job and caller has a recorded trust
boundary, every applicable rule has evidence or a compensating control, local
checks pass, and GitHub-only verification is identified. Reviews report every
failure with evidence; implementations resolve every failure and contain only
intended behavior.
