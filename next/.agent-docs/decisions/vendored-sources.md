# Only Effect is vendored (human)

- Human, 2026-10-19: "we only want effect there", then "delete orpc and [another project] from vendor-src and the repo". `.repos/` holds `effect` alone.
- Why: Effect is the library the code is written in, so its source is what agents need to read. The others are prior art for features, not for how to write them ([`effect-native-by-default.md`](./effect-native-by-default.md)).
- Lost: reading the others' source locally. Earlier decisions that cite oRPC link its upstream repo at the vendored ref (`v2.0.0-beta.44`).
- Lives in: `../vendor-src.json`, `.repos/`, `AGENTS.md` (Vendored Source).
