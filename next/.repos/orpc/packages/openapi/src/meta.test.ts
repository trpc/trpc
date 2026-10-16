import { oc } from '@orpc/contract'
import { getOpenAPIMeta, openapi } from './meta'

describe('openapi meta', () => {
  describe('openapi() function', () => {
    it('returns a plugin with name ~openapi', () => {
      const plugin = openapi({ method: 'GET', path: '/users' })
      expect(plugin.name).toBe('~openapi')
    })

    it('init meta on first time use', () => {
      const meta = { method: 'GET', path: '/users', summary: 'List users' } as const
      const procedure = oc.meta(openapi(meta))
      expect(getOpenAPIMeta(procedure)).toEqual(meta)
    })

    it('merges with existing ~openapi meta', () => {
      const procedure = oc
        .meta(openapi({ path: '/users', tags: ['users'] }))
        .meta(openapi({ method: 'POST', summary: 'Create user' }))
      expect(getOpenAPIMeta(procedure)).toMatchObject({
        method: 'POST',
        path: '/users',
        summary: 'Create user',
        tags: ['users'],
      })
    })

    it('prioritize later call', () => {
      const procedure = oc
        .meta(openapi({ method: 'GET', summary: 'First' }))
        .meta(openapi({ method: 'POST', summary: 'Second' }))
      expect(getOpenAPIMeta(procedure)).toMatchObject({
        method: 'POST',
        summary: 'Second',
      })
    })

    describe('tags merging', () => {
      it('concatenates tags from multiple calls', () => {
        const procedure = oc
          .meta(openapi({ tags: ['existing-tag'] }))
          .meta(openapi({ tags: ['new-tag'] }))
        expect(getOpenAPIMeta(procedure)?.tags).toEqual(['existing-tag', 'new-tag'])
      })

      it('uses only incoming tags when no existing tags', () => {
        const procedure = oc.meta(openapi({ tags: ['tag1'] }))
        expect(getOpenAPIMeta(procedure)?.tags).toEqual(['tag1'])
      })

      it('uses only existing tags when no incoming tags', () => {
        const procedure = oc
          .meta(openapi({ tags: ['existing'] }))
          .meta(openapi({}))
        expect(getOpenAPIMeta(procedure)?.tags).toEqual(['existing'])
      })
    })

    describe('queryStyles merging', () => {
      it('merges query styles from multiple calls', () => {
        const procedure = oc
          .meta(openapi({ queryStyles: { keyword: 'primitive' } }))
          .meta(openapi({ queryStyles: { tags: 'array' } }))

        expect(getOpenAPIMeta(procedure)?.queryStyles).toEqual({
          keyword: 'primitive',
          tags: 'array',
        })
      })

      it('prioritizes later query styles for the same key', () => {
        const procedure = oc
          .meta(openapi({ queryStyles: { tags: 'primitive' } }))
          .meta(openapi({ queryStyles: { tags: 'array' } }))

        expect(getOpenAPIMeta(procedure)?.queryStyles).toEqual({
          tags: 'array',
        })
      })

      it('keeps existing query styles when later call omits them', () => {
        const procedure = oc
          .meta(openapi({ queryStyles: { tags: 'array' } }))
          .meta(openapi({}))

        expect(getOpenAPIMeta(procedure)?.queryStyles).toEqual({
          tags: 'array',
        })
      })
    })

    describe('paramsStyles merging', () => {
      it('merges param styles from multiple calls', () => {
        const procedure = oc
          .meta(openapi({ paramsStyles: { id: 'primitive' } }))
          .meta(openapi({ paramsStyles: { tags: 'comma-delimited-array' } }))

        expect(getOpenAPIMeta(procedure)?.paramsStyles).toEqual({
          id: 'primitive',
          tags: 'comma-delimited-array',
        })
      })

      it('prioritizes later param styles for the same key', () => {
        const procedure = oc
          .meta(openapi({ paramsStyles: { id: 'primitive' } }))
          .meta(openapi({ paramsStyles: { id: 'comma-delimited-object' } }))

        expect(getOpenAPIMeta(procedure)?.paramsStyles).toEqual({
          id: 'comma-delimited-object',
        })
      })

      it('keeps existing param styles when later call omits them', () => {
        const procedure = oc
          .meta(openapi({ paramsStyles: { tags: 'comma-delimited-array' } }))
          .meta(openapi({}))

        expect(getOpenAPIMeta(procedure)?.paramsStyles).toEqual({
          tags: 'comma-delimited-array',
        })
      })
    })

    describe('spec merging', () => {
      it('uses incoming object spec when no existing spec', () => {
        const spec = { operationId: 'listUsers' }
        const procedure = oc.meta(openapi({ spec }))
        expect(getOpenAPIMeta(procedure)?.spec).toBe(spec)
      })

      it('uses existing object spec when no incoming spec', () => {
        const existingSpec = { operationId: 'listUsers' }
        const procedure = oc
          .meta(openapi({ spec: existingSpec }))
          .meta(openapi({}))
        expect(getOpenAPIMeta(procedure)?.spec).toBe(existingSpec)
      })

      it('composes two function specs: existing applied first, then incoming', () => {
        const procedure = oc
          .meta(openapi({ spec: current => ({ ...current, a: 1, order: 1 }) }))
          .meta(openapi({ spec: current => ({ ...current, b: 2, order: 2 }) }))
        const spec = getOpenAPIMeta(procedure)?.spec as any
        expect(spec({ c: 3 })).toEqual({ a: 1, b: 2, c: 3, order: 2 })
      })

      it('resolves existing function spec with incoming object spec eagerly', () => {
        const procedure = oc
          .meta(openapi({ spec: current => ({ ...current, fromExisting: true }) }))
          .meta(openapi({ spec: { operationId: 'override' } }))
        expect(getOpenAPIMeta(procedure)?.spec).toEqual({
          operationId: 'override',
          fromExisting: true,
        })
      })

      it('applies incoming function spec to existing object spec eagerly', () => {
        const procedure = oc
          .meta(openapi({ spec: { operationId: 'base' } }))
          .meta(openapi({ spec: current => ({ ...current, extra: true }) }))
        expect(getOpenAPIMeta(procedure)?.spec).toEqual({
          operationId: 'base',
          extra: true,
        })
      })
    })

    describe('prefix merging', () => {
      it('concatenates prefixes from multiple calls', () => {
        const procedure = oc
          .meta(openapi({ prefix: '/api' }))
          .meta(openapi({ prefix: '/v1' }))
        expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api/v1')
      })

      it('uses only incoming prefix when no existing prefix', () => {
        const procedure = oc.meta(openapi({ prefix: '/api' }))
        expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api')
      })

      it('uses only existing prefix when no incoming prefix', () => {
        const procedure = oc
          .meta(openapi({ prefix: '/api' }))
          .meta(openapi({}))
        expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api')
      })

      it('normalizes prefixes when merging', () => {
        const procedure = oc
          .meta(openapi({ prefix: '/api/' }))
          .meta(openapi({ prefix: '/v1/' }))
        expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api/v1/')
      })

      it('handles multiple prefix merges', () => {
        const procedure = oc
          .meta(openapi({ prefix: '/api' }))
          .meta(openapi({ prefix: '/v1' }))
          .meta(openapi({ prefix: '/users' }))
        expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api/v1/users')
      })
    })

    it('metadata resets to its default behavior when set to `undefined` in subsequent calls', () => {
      const procedure = oc
        .meta(openapi({
          method: 'GET',
          path: '/users',
          summary: 'List users',
          deprecated: true,
          description: 'des',
          inputStructure: 'detailed',
          operationId: 'id',
          outputStructure: 'detailed',
          paramsStyles: { id: 'comma-delimited-array' },
          prefix: '/api',
          queryStyles: { id: 'comma-delimited-object' },
          requestBodyHint: 'file',
          responseBodyHint: 'file',
          spec: () => ({}),
          successDescription: 'success',
          successStatus: 201,
          tags: ['a', 'b'],
        }))
        .meta(openapi({
          method: undefined,
          path: undefined,
          summary: undefined,
          deprecated: undefined,
          description: undefined,
          inputStructure: undefined,
          operationId: undefined,
          outputStructure: undefined,
          paramsStyles: undefined,
          prefix: undefined,
          queryStyles: undefined,
          requestBodyHint: undefined,
          responseBodyHint: undefined,
          spec: undefined,
          successDescription: undefined,
          successStatus: undefined,
          tags: undefined,
        }))

      expect(getOpenAPIMeta(procedure)).toEqual({})
    })
  })

  describe('openapi.method', () => {
    it('returns a plugin with name ~openapi/method', () => {
      expect(openapi.method('GET').name).toBe('~openapi/method')
    })

    it('sets the openapi method', () => {
      const procedure = oc.meta(openapi.method('POST'))
      expect(getOpenAPIMeta(procedure)?.method).toBe('POST')
    })
  })

  describe('openapi.path', () => {
    it('returns a plugin with name ~openapi/path', () => {
      expect(openapi.path('/users').name).toBe('~openapi/path')
    })

    it('sets the openapi path', () => {
      const procedure = oc.meta(openapi.path('/users'))
      expect(getOpenAPIMeta(procedure)?.path).toBe('/users')
    })
  })

  describe('openapi.spec', () => {
    it('returns a plugin with name ~openapi/spec', () => {
      expect(openapi.spec({ operationId: 'test' }).name).toBe('~openapi/spec')
    })

    it('sets an openapi object spec', () => {
      const spec = { operationId: 'listUsers', tags: ['users'] }
      const procedure = oc.meta(openapi.spec(spec))
      expect(getOpenAPIMeta(procedure)?.spec).toBe(spec)
    })

    it('sets a openapi function spec', () => {
      const specFn = (current: any) => ({ ...current, modified: true })
      const procedure = oc.meta(openapi.spec(specFn))
      expect(getOpenAPIMeta(procedure)?.spec).toBe(specFn)
    })
  })

  describe('openapi.prefix', () => {
    it('returns a plugin with name ~openapi/prefix', () => {
      expect(openapi.prefix('/api').name).toBe('~openapi/prefix')
    })

    it('sets the openapi prefix', () => {
      const procedure = oc.meta(openapi.prefix('/api'))
      expect(getOpenAPIMeta(procedure)?.prefix).toBe('/api')
    })
  })

  describe('getOpenAPIMeta', () => {
    it('returns undefined when no openapi meta has been applied', () => {
      const procedure = oc
      expect(getOpenAPIMeta(procedure)).toBeUndefined()
    })

    it('returns the ~openapi meta from a ProcedureContract', () => {
      const openAPIMeta = { method: 'GET' as const, path: '/users' as `/${string}` }
      const procedure = oc.meta(openapi(openAPIMeta))
      expect(getOpenAPIMeta(procedure)).toMatchObject(openAPIMeta)
    })
  })
})
