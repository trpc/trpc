# Early status is a note (human)

- The early-status callout is a GitHub `> [!NOTE]` in the root README, both package READMEs, and `www/content/overview.md`. It says the API can still change between minor releases.
- The docs announcement bar (`www/src/components/announcement-bar.tsx`) uses the same "minor releases" wording. Change `announcementId` when that message changes.
- Lost: a `> [!WARNING]` that said the API can change between patch releases.
