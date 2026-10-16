# A release run stops if `main` moved (agent)

- A release run publishes to npm before it pushes `chore: release vX.Y.Z`. If anything merges while it builds, the `--atomic` push is rejected (non-fast-forward) after the packages are already on npm. That's how 0.5.4 ended up on npm with no tag or commit: PRs #74–#78 merged within half a minute, and #74's run published before failing to push.
- So `before:git:release` fetches `origin/main` after building and stops before publishing if it isn't `HEAD`. The workflow treats that stop as a success: the `concurrency` group holds the run for the newest commit, and that run releases everything.
- The window that's left is the publish itself (a few seconds). Merging one PR at a time and waiting for its release avoids it.
