import { getDynamicPathParams, isBodylessMethod } from './utils'

describe('isBodylessMethod', () => {
  it('treats GET and HEAD as bodyless', () => {
    expect(isBodylessMethod('GET')).toBe(true)
    expect(isBodylessMethod('HEAD')).toBe(true)
    expect(isBodylessMethod('POST')).toBe(false)
    expect(isBodylessMethod('DELETE')).toBe(false)
  })
})

describe('getDynamicPathParams', () => {
  it('simple', () => {
    expect(getDynamicPathParams('/static/path')).toEqual(undefined)
    expect(getDynamicPathParams('/static/{id}')).toEqual([
      { segment: '{id}', parameterName: 'id', startIndex: 8, allowsSlash: false },
    ])
  })

  it('returns multiple dynamic params in order', () => {
    expect(getDynamicPathParams('/users/{userId}/posts/{postId}')).toEqual([
      { segment: '{userId}', parameterName: 'userId', startIndex: 7, allowsSlash: false },
      { segment: '{postId}', parameterName: 'postId', startIndex: 22, allowsSlash: false },
    ])
  })

  it('supports greedy params with + and marks allowsSlash', () => {
    expect(getDynamicPathParams('/files/{+path}')).toEqual([
      { segment: '{+path}', parameterName: 'path', startIndex: 7, allowsSlash: true },
    ])
  })

  it('handles params at the beginning of the path', () => {
    expect(getDynamicPathParams('/{id}/details')).toEqual([
      { segment: '{id}', parameterName: 'id', startIndex: 1, allowsSlash: false },
    ])
  })

  it('handles mixed regular and greedy params', () => {
    expect(getDynamicPathParams('/orgs/{orgId}/files/{+filePath}')).toEqual([
      { segment: '{orgId}', parameterName: 'orgId', startIndex: 6, allowsSlash: false },
      { segment: '{+filePath}', parameterName: 'filePath', startIndex: 20, allowsSlash: true },
    ])
  })

  it('treat params are embedded within static segments as static', () => {
    expect(getDynamicPathParams('/orgs/{name}fix')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{name}fix/post')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/fix{name}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/fix{name}/post')).toEqual(undefined)

    expect(getDynamicPathParams('/orgs/{name}fix/{name}')).toEqual([
      { segment: '{name}', parameterName: 'name', startIndex: 16, allowsSlash: false },
    ])
    expect(getDynamicPathParams('/orgs/fix{name}/{name}')).toEqual([
      { segment: '{name}', parameterName: 'name', startIndex: 16, allowsSlash: false },
    ])
  })

  it('treat unsupported params patterns as static', () => {
    expect(getDynamicPathParams('/orgs/{?name}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{!name}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{&name}')).toEqual(undefined)

    expect(getDynamicPathParams('/orgs/{?name}/{name}')).toEqual([
      { segment: '{name}', parameterName: 'name', startIndex: 14, allowsSlash: false },
    ])
    expect(getDynamicPathParams('/orgs/{!name}/{name}')).toEqual([
      { segment: '{name}', parameterName: 'name', startIndex: 14, allowsSlash: false },
    ])
  })

  it('treat empty segment as static pattern', () => {
    expect(getDynamicPathParams('/orgs/{}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{+}')).toEqual(undefined)

    expect(getDynamicPathParams('/orgs/{}/{id}')).toEqual([
      { segment: '{id}', parameterName: 'id', startIndex: 9, allowsSlash: false },
    ])
    expect(getDynamicPathParams('/orgs/{+}/{+path}')).toEqual([
      { segment: '{+path}', parameterName: 'path', startIndex: 10, allowsSlash: true },
    ])
  })

  it('treat invalid parameter as static pattern', () => {
    expect(getDynamicPathParams('/orgs/{invalid!}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{invalid@}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{invalid^}')).toEqual(undefined)

    expect(getDynamicPathParams('/orgs/{invalid!}/{id}')).toEqual([
      { segment: '{id}', parameterName: 'id', startIndex: 17, allowsSlash: false },
    ])
  })

  it('treat malformed braces as static', () => {
    expect(getDynamicPathParams('/orgs/{name')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/name}')).toEqual(undefined)
    expect(getDynamicPathParams('/orgs/{{name}}')).toEqual(undefined)

    expect(getDynamicPathParams('/orgs/{name/{id}')).toEqual([
      { segment: '{id}', parameterName: 'id', startIndex: 12, allowsSlash: false },
    ])
    expect(getDynamicPathParams('/orgs/name}/{+path}')).toEqual([
      { segment: '{+path}', parameterName: 'path', startIndex: 12, allowsSlash: true },
    ])
  })

  it('dynamic parameters are always returned in path order.', () => {
    expect(getDynamicPathParams('/{z}/{a}/{m}/x/{+b}')).toEqual([
      { segment: '{z}', parameterName: 'z', startIndex: 1, allowsSlash: false },
      { segment: '{a}', parameterName: 'a', startIndex: 5, allowsSlash: false },
      { segment: '{m}', parameterName: 'm', startIndex: 9, allowsSlash: false },
      { segment: '{+b}', parameterName: 'b', startIndex: 15, allowsSlash: true },
    ])
  })
})
