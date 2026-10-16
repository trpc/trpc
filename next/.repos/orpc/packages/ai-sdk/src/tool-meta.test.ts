import { oc } from '@orpc/contract'
import { aiSdkTool, getAiSdkToolMeta } from './tool-meta'

describe('aiSdkTool meta', () => {
  it('returns a plugin with name ~ai-sdk/tool', () => {
    const plugin = aiSdkTool({ description: 'Get the weather' })
    expect(plugin.name).toBe('~ai-sdk/tool')
  })

  it('init meta on first time use', () => {
    const meta = { description: 'Get the weather', strict: true }
    const contract = oc.meta(aiSdkTool(meta))
    expect(getAiSdkToolMeta(contract)).toEqual(meta)
  })

  it('returns undefined when meta is not set', () => {
    expect(getAiSdkToolMeta(oc)).toBeUndefined()
  })

  it('spread merges with existing ~ai-sdk/tool meta and prioritize later call', () => {
    const contract = oc
      .meta(aiSdkTool({ description: 'First', strict: true, metadata: { a: 1 } }))
      .meta(aiSdkTool({ description: 'Second', metadata: { b: 2 } }))

    expect(getAiSdkToolMeta(contract)).toEqual({
      description: 'Second',
      strict: true,
      metadata: { b: 2 },
    })
  })
})
