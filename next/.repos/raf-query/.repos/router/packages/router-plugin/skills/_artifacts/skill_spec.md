# @tanstack/router-plugin — Skill Spec

Bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild via unplugin.

## Domains

| Domain              | Description                                             | Skills        |
| ------------------- | ------------------------------------------------------- | ------------- |
| Bundler Integration | Route generation and code splitting via bundler plugins | router-plugin |

## Skill Inventory

| Skill         | Type | Domain              | What it covers                                                 | Failure modes |
| ------------- | ---- | ------------------- | -------------------------------------------------------------- | ------------- |
| router-plugin | core | bundler-integration | Vite/Webpack/Rspack/esbuild plugins, route gen, code splitting | 3             |

## Failure Mode Inventory

### router-plugin (3 failure modes)

| #   | Mistake                                              | Priority | Source            |
| --- | ---------------------------------------------------- | -------- | ----------------- |
| 1   | Using wrong plugin export for bundler                | HIGH     | source/docs       |
| 2   | Misconfiguring routesDirectory or generatedRouteTree | MEDIUM   | source/docs       |
| 3   | Editing routeTree.gen.ts instead of regenerating     | HIGH     | consistency audit |
