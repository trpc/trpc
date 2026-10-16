import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  externals: ['cloudflare:workers'],
})
