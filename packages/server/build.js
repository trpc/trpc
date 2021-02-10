#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
//
// This example builds a module in both debug and release mode.
// See estrella.d.ts for documentation of available options.
// You can also pass any options for esbuild (as defined in esbuild/lib/main.d.ts).
//
const { build, cliopts } = require("estrella")
const fs = require('fs')
const path = require('path')
// config shared by products

const baseConfig = {
  entry: "src/index.ts",
  bundle: true,
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
}

build({
  ...baseConfig,
  outfile: "dist/index.js",
})

const adaptersDir = path.join(__dirname, 'src', 'adapters')
const adapters = fs.readdirSync(adaptersDir)

for (const file of adapters) {
  const parts = file.split('.')
  parts.pop()
  const noExt = parts.join('.')
  build({
    ...baseConfig,
    outfile: `dist/adapters/${noExt}.js`,
  })

}