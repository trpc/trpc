import { deleteCookie, getCookie, setCookie } from './cookie'

describe('setCookie', () => {
  it('should work with Headers object', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value', { httpOnly: true, maxAge: 3600 })

    expect(headers.get('Set-Cookie')).toContain('test=value')
    expect(headers.get('Set-Cookie')).toContain('HttpOnly')
    expect(headers.get('Set-Cookie')).toContain('Max-Age=3600')
    expect(headers.get('Set-Cookie')).toContain('Path=/')
  })

  it('should set default path to /', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value')

    expect(headers.get('Set-Cookie')).toContain('Path=/')
  })

  it('should override default path when specified', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value', { path: '/api' })

    expect(headers.get('Set-Cookie')).toContain('Path=/api')
  })

  it('should append multiple cookies', () => {
    const headers = new Headers()
    setCookie(headers, 'first', 'value1')
    setCookie(headers, 'second', 'value2')

    const setCookieValues = headers.getSetCookie()
    expect(setCookieValues).toHaveLength(2)
    expect(setCookieValues[0]).toContain('first=value1')
    expect(setCookieValues[1]).toContain('second=value2')
  })

  it('should do nothing when headers is undefined', () => {
    expect(() => setCookie(undefined, 'test', 'value')).not.toThrow()
  })

  it('should support all SetCookie options', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value', {
      domain: 'example.com',
      expires: new Date('2025-12-31'),
      httpOnly: true,
      maxAge: 86400,
      path: '/custom',
      secure: true,
      sameSite: 'strict',
    })

    const cookieValue = headers.get('Set-Cookie')!
    expect(cookieValue).toContain('test=value')
    expect(cookieValue).toContain('Domain=example.com')
    expect(cookieValue).toContain('HttpOnly')
    expect(cookieValue).toContain('Max-Age=86400')
    expect(cookieValue).toContain('Path=/custom')
    expect(cookieValue).toContain('Secure')
    expect(cookieValue).toContain('SameSite=Strict')
  })

  it('should support custom encode function', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value with spaces', {
      encode: str => str.replace(/ /g, '_'),
    })

    expect(headers.get('Set-Cookie')).toContain('test=value_with_spaces')
  })
})

describe('getCookie', () => {
  it('should work with Headers object', () => {
    const headers = new Headers()
    headers.set('Cookie', 'test=value; session=abc123')
    headers.append('Cookie', 'another=value2')

    expect(getCookie(headers, 'test')).toBe('value')
    expect(getCookie(headers, 'session')).toBe('abc123')
    expect(getCookie(headers, 'another')).toBe('value2')
    expect(getCookie(headers, 'nonexistent')).toBeUndefined()
  })

  it('should return undefined when no cookie header is present', () => {
    const headers = new Headers()

    expect(getCookie(headers, 'test')).toBeUndefined()
  })

  it('should return undefined when headers is undefined', () => {
    expect(getCookie(undefined, 'test')).toBeUndefined()
  })

  it('should handle cookie parsing with special characters', () => {
    const headers = new Headers()
    headers.set('Cookie', 'encoded=%20value%20; normal=simple')

    expect(getCookie(headers, 'encoded')).toBe(' value ')
    expect(getCookie(headers, 'normal')).toBe('simple')
  })

  it('should support ParseOptions', () => {
    const headers = new Headers()
    headers.set('Cookie', 'test="quoted value"; simple=unquoted')

    // Without decode option
    expect(getCookie(headers, 'test')).toBe('"quoted value"')

    // With custom decode option that removes quotes
    expect(getCookie(headers, 'test', {
      decode: (val: string) => val.replace(/^"|"$/g, ''),
    })).toBe('quoted value')
  })

  it('should handle invalid cookie formats gracefully', () => {
    const headers = new Headers()
    headers.set('Cookie', 'invalid-cookie-format=%XX')

    expect(getCookie(headers, 'invalid-cookie-format')).toEqual('%XX')
  })
})

describe('deleteCookie', () => {
  it('should delete a cookie by setting maxAge to 0', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value')
    deleteCookie(headers, 'test')

    expect(headers.get('Set-Cookie')).toContain('test=; Max-Age=0; Path=/')
  })

  it('should handle deleting cookies with options', () => {
    const headers = new Headers()
    setCookie(headers, 'test', 'value', { path: '/api' })
    // @ts-expect-error: maxAge should be ignored in deleteCookie
    deleteCookie(headers, 'test', { path: '/api', maxAge: 10 })

    expect(headers.get('Set-Cookie')).toContain('test=; Max-Age=0; Path=/api')
  })

  it('should do nothing when headers is undefined', () => {
    expect(() => deleteCookie(undefined, 'test')).not.toThrow()
  })
})
