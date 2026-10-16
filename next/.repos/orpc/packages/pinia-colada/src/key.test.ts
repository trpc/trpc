import { generateOperationKey } from './key'

it('generateOperationKey', () => {
  expect(generateOperationKey(['path'])).toEqual([['path'], {}])
  expect(generateOperationKey(['path', 'path2'], { input: { a: 1 } })).toEqual([['path', 'path2'], { input: { a: 1 } }])
  expect(generateOperationKey(['path'], { input: undefined })).toEqual([['path'], {}])
  expect(generateOperationKey(['path', 'path2'], { type: 'query' })).toEqual([['path', 'path2'], { type: 'query' }])
  expect(generateOperationKey(['path'], { type: undefined })).toEqual([['path'], {}])
  expect(generateOperationKey(['path', 'path2'], { type: 'query', input: { a: 1 } })).toEqual([['path', 'path2'], { type: 'query', input: { a: 1 } }])
  expect(generateOperationKey(['path'], { type: 'mutation' })).toEqual([['path'], { type: 'mutation' }])

  const date = new Date()
  expect(generateOperationKey(['path', 'path2'], { input: { a: date } })).toEqual([['path', 'path2'], { input: { a: date.toISOString() } }])

  expect(generateOperationKey(['path'], { prefix: '__prefix__' })).toEqual(['__prefix__', ['path'], {}])
  expect(generateOperationKey(['path'], { prefix: undefined })).toEqual([['path'], {}])
  expect(generateOperationKey(['path'], { prefix: '__prefix__', type: 'query', input: { a: 1 } })).toEqual(['__prefix__', ['path'], { type: 'query', input: { a: 1 } }])
})
