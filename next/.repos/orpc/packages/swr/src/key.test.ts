import { generateOperationKey } from './key'

describe('generateOperationKey', () => {
  it('without prefix', () => {
    expect(generateOperationKey(['ping'])).toEqual([['ping'], {}])
    expect(generateOperationKey(['ping'], { input: { search: '__search__' } })).toEqual([['ping'], { input: { search: '__search__' } }])
  })

  it('with prefix', () => {
    expect(generateOperationKey(['ping'], { prefix: '__prefix__' })).toEqual(['__prefix__', ['ping'], {}])
    expect(generateOperationKey(['ping'], { prefix: '__prefix__', input: { search: '__search__' } })).toEqual(['__prefix__', ['ping'], { input: { search: '__search__' } }])
  })
})
