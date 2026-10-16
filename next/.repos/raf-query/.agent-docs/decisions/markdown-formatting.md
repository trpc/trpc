# Markdown via oxfmt, not markdownlint

- Oxfmt formats `.md` and embedded JS/TS fences (`embeddedLanguageFormatting: "auto"`).
- Oxlint does **not** lint Markdown (out of scope); do not add markdownlint for parity. Single rules reach fences through their tests: [lint-markdown-fences.md](./lint-markdown-fences.md).
- Keep `fmt` options in sync between `vite.config.ts` and `.oxfmtrc.json` (tabs, width, ignores).
- Workspace disables markdownlint (`markdownlint.enable: false` + unwanted recommendation). Keep `.markdownlint.json` with `MD010: false` as a belt-and-suspenders if the extension is still installed globally.
