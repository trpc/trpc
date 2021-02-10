import typescript from "@wessberg/rollup-plugin-ts"
import commonjs from "rollup-plugin-commonjs"
import json from "rollup-plugin-json"
import resolve from "rollup-plugin-node-resolve"
import external from "rollup-plugin-peer-deps-external"
import pkg from "./package.json"
import fs from 'fs'
import path from 'path'

const common = {
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    "fs",
    "path",
    "os",
    "tty",
    "events",
    "http",
    'express',
    'next',
  ],
  plugins: [
    json(),
    external(),
    resolve({ preferBuiltins: true }),
    typescript({
      transformers: [],
      tsconfig: 'tsconfig.build.json',
    }),
    commonjs({
      include: /node_modules/,
      namedExports: {},
    }),
  ],
}

const lib = {
  ...common,
  input: "./src/index.ts",
  output: {
    file: pkg["main"],
    exports: "named",
    sourcemap: "true",
    format: "cjs",
  },
}



const builds = [
  lib,
]

const adaptersDir = path.join(__dirname, 'src', 'adapters')
const adapters = fs.readdirSync(adaptersDir)

for (const file of adapters) {
  const parts = file.split('.')
  parts.pop()
  const noExt = parts.join('.')
  builds.push({
    ...common,
    external: [...common.external, '../index'],
    input: `src/adapters/${file}`,
    output: {
      file: `dist/adapters/${noExt}.js`,
      exports: "named",
      sourcemap: "true",
      format: "cjs",
    },
  })

}


export default builds