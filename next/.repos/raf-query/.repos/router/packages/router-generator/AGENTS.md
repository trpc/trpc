# Route generator

- Preserve the existing `safeFileWrite` path: temporary-file rename, modification-time conflict retry, and post-rename stat. Keep unchanged-write suppression and main/shadow cache rotation; these protect concurrent edits, avoid watcher loops, and discard deleted routes.
- Run the complete `test:unit` target after generator changes. Its runtime phase generates fixture route trees before typechecking their consumers; `test:types` excludes the generator fixtures.
- Add generation cases under `tests/generator/<case>/`. Read [`tests/generator.test.ts`](tests/generator.test.ts) for per-case configuration and preprocessing. Change route inputs/configuration or templates, then regenerate route trees and expected snapshots through the test harness.
- `preprocess()` recreates selected route files for `file-modification*` and `custom-scaffolding`. Edit their templates/configuration/preprocessing when changing those inputs; edits to recreated files are overwritten.
