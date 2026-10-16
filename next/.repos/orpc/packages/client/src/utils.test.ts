import { ORPCError } from './error'
import { resolveClientRest, resolveFriendlyClientOptions, safe } from './utils'

describe('resolveFriendlyClientOptions', () => {
  it('works', () => {
    expect(resolveFriendlyClientOptions({})).toEqual({ context: {} })
    expect(resolveFriendlyClientOptions({ context: { a: 1 } })).toEqual({ context: { a: 1 } })
    expect(resolveFriendlyClientOptions({ lastEventId: '123' })).toEqual({ context: {}, lastEventId: '123' })
  })
})

describe('resolveClientRest', () => {
  it('works', () => {
    expect(resolveClientRest(['123'])).toEqual(['123', { context: {} }])
    expect(resolveClientRest(['123', { context: { a: 1 } }])).toEqual(['123', { context: { a: 1 } }])
    expect(resolveClientRest(['123', { lastEventId: '123' }])).toEqual(['123', { context: {}, lastEventId: '123' }])
    expect(resolveClientRest([])).toEqual([undefined, { context: {} }])
  })
})

it('safe', async () => {
  const r1 = await safe(Promise.resolve(1))
  expect([...r1]).toEqual([null, 1, null, true])
  expect({ ...r1 }).toEqual(expect.objectContaining({ error: null, data: 1, definedError: null, isSuccess: true }))

  const e2 = new Error('error')
  const r2 = await safe(Promise.reject(e2))
  expect([...r2]).toEqual([e2, undefined, null, false])
  expect({ ...r2 }).toEqual(expect.objectContaining({ error: e2, data: undefined, definedError: null, isSuccess: false }))

  const e3 = new ORPCError('BAD_GATEWAY')
  ;(e3 as any).defined = true // simulate defined error
  const r3 = await safe(Promise.reject(e3))
  expect([...r3]).toEqual([e3, undefined, e3, false])
  expect({ ...r3 }).toEqual(expect.objectContaining({ error: e3, data: undefined, definedError: e3, isSuccess: false }))

  const e4 = new ORPCError('BAD_GATEWAY')
  const r4 = await safe(Promise.reject(e4))
  expect([...r4]).toEqual([e4, undefined, null, false])
  expect({ ...r4 }).toEqual(expect.objectContaining({ error: e4, data: undefined, definedError: null, isSuccess: false }))
})
