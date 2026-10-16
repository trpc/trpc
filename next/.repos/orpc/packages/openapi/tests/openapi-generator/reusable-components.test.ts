import { eventIterator, oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: reusable component schemas', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  it('hoists a recursive entity into a single component referenced everywhere', async () => {
    const Category: z.ZodTypeAny = z.lazy(() => z.looseObject({
      name: z.string(),
      children: z.array(Category).optional(),
    })).meta({ id: 'Category' })

    const doc = await generator.generate({
      getCategory: oc
        .meta(openapi({ method: 'GET', path: '/categories/{name}' }))
        .input(z.object({ name: z.string() }))
        .output(z.object({ category: Category })),
      createCategory: oc
        .meta(openapi({ method: 'POST', path: '/categories' }))
        .input(z.object({ category: Category }))
        .output(z.object({ category: Category })),
    })

    expect((doc.paths?.['/categories/{name}']?.get?.responses?.['200'] as any).content['application/json'].schema).toEqual(
      expect.objectContaining({
        properties: {
          category: { $ref: '#/components/schemas/Category' },
        },
      }),
    )
    expect((doc.paths?.['/categories']?.post?.requestBody as any).content['application/json'].schema).toEqual(
      expect.objectContaining({
        properties: {
          category: { $ref: '#/components/schemas/Category' },
        },
      }),
    )

    expect(doc.components?.schemas).toEqual({
      Category: expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          children: {
            type: 'array',
            items: { $ref: '#/components/schemas/Category' },
          },
        }),
      }),
    })
  })

  it('hoists mutually recursive entities that reference each other', async () => {
    const User: z._ZodType = z.looseObject({
      name: z.string(),
      // eslint-disable-next-line ts/no-use-before-define
      posts: z.array(z.lazy(() => Post)).optional(),
    }).meta({ id: 'User' })

    const Post: z.ZodTypeAny = z.looseObject({
      title: z.string(),
      author: z.lazy(() => User).optional(),
    }).meta({ id: 'Post' })

    const doc = await generator.generate({
      getUser: oc.input(z.object({ user: User })).output(z.object({ user: User })),
      getPost: oc.input(z.object({ post: Post })).output(z.object({ post: Post })),
    })

    expect(doc.components?.schemas).toEqual({
      User: expect.objectContaining({
        properties: expect.objectContaining({
          posts: {
            type: 'array',
            items: { $ref: '#/components/schemas/Post' },
          },
        }),
      }),
      Post: expect.objectContaining({
        properties: expect.objectContaining({
          author: { $ref: '#/components/schemas/User' },
        }),
      }),
    })
  })

  it('hoists an entity that recurses to its own root out of bodies, error data, and event streams', async () => {
    const Tree: z.ZodTypeAny = z.looseObject({
      name: z.string(),
      get children() { return z.array(Tree) },
    })

    const doc = await generator.generate({
      createTree: oc
        .meta(openapi({ method: 'POST', path: '/trees' }))
        .errors({ BAD_REQUEST: { data: Tree } })
        .input(Tree)
        .output(Tree),
      streamTrees: oc
        .meta(openapi({ method: 'GET', path: '/trees' }))
        .output(eventIterator(Tree)),
    })

    const operation = doc.paths?.['/trees']?.post
    expect((operation?.requestBody as any).content['application/json'].schema).toEqual({ $ref: '#/components/schemas/__schema0' })
    expect((operation?.responses?.['200'] as any).content['application/json'].schema).toEqual({ $ref: '#/components/schemas/__schema0' })
    expect((doc.paths?.['/trees']?.get?.responses?.['200'] as any).content['text/event-stream'].schema.oneOf[0].properties.data)
      .toEqual({ $ref: '#/components/schemas/__schema0' })
    expect(doc.components?.schemas).toEqual({
      __schema0: expect.objectContaining({
        properties: {
          name: { type: 'string' },
          children: { type: 'array', items: { $ref: '#/components/schemas/__schema0' } },
        },
      }),
      BadRequest: expect.objectContaining({
        properties: expect.objectContaining({ data: { $ref: '#/components/schemas/__schema0' } }),
      }),
      UndefinedError: expect.any(Object),
    })
  })

  it('keeps a root-recursive union whole when its file branch is split out', async () => {
    const Node: z.ZodTypeAny = z.union([
      z.object({ get children() { return z.array(Node) } }),
      z.file().mime('image/png'),
    ])

    const doc = await generator.generate({
      upload: oc.meta(openapi({ method: 'POST', path: '/nodes' })).input(Node),
    })

    const content = (doc.paths?.['/nodes']?.post?.requestBody as any).content
    expect(content['multipart/form-data'].schema.properties.children.items).toEqual({ $ref: '#/components/schemas/__schema0' })
    expect(content['image/png'].schema).toEqual(expect.objectContaining({ contentMediaType: 'image/png' }))
    expect(doc.components?.schemas?.__schema0).toEqual({
      anyOf: [
        expect.objectContaining({ properties: { children: { type: 'array', items: { $ref: '#/components/schemas/__schema0' } } } }),
        expect.objectContaining({ contentMediaType: 'image/png' }),
      ],
    })
  })

  it('keeps strict entities direction-specific instead of altering their semantics', async () => {
    // a plain z.object accepts unknown keys on input but strips them from its output,
    // so its input and output json schemas genuinely differ (additionalProperties: false)
    const Planet = z.object({ id: z.string() }).meta({ id: 'Planet' })

    const doc = await generator.generate({
      createPlanet: oc
        .input(z.object({ planet: Planet }))
        .output(z.object({ planet: Planet })),
      clonePlanet: oc
        .input(z.object({ planet: Planet }))
        .output(z.object({ planet: Planet })),
    })

    for (const path of ['/createPlanet', '/clonePlanet'] as const) {
      expect((doc.paths?.[path]?.post?.requestBody as any).content['application/json'].schema.properties).toEqual({
        planet: { $ref: '#/components/schemas/Planet' },
      })
      expect((doc.paths?.[path]?.post?.responses?.['200'] as any).content['application/json'].schema.properties).toEqual({
        planet: { $ref: '#/components/schemas/PlanetOutput' },
      })
    }

    expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Planet', 'PlanetOutput'])

    expect(doc.components?.schemas?.Planet).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(doc.components?.schemas?.PlanetOutput).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    })
  })

  it('reuses equal base document components and postfixes conflicting ones', async () => {
    const Planet = z.object({ id: z.string() }).meta({ id: 'Planet' })
    const Moon = z.object({ radius: z.number() }).meta({ id: 'Moon' })

    const doc = await generator.generate({
      planet: oc.input(z.object({ planet: Planet, moon: Moon })),
    }, {
      base: {
        components: {
          schemas: {
            // equal to the generated Planet schema, reused as-is
            Planet: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            } as any,
            // different from the generated Moon schema, forcing a postfix
            Moon: { type: 'string' } as any,
          },
        },
      },
    })

    expect((doc.paths?.['/planet']?.post?.requestBody as any).content['application/json'].schema).toEqual(
      expect.objectContaining({
        properties: {
          planet: { $ref: '#/components/schemas/Planet' },
          moon: { $ref: '#/components/schemas/MoonInput' },
        },
      }),
    )

    expect(doc.components?.schemas).toEqual({
      Planet: expect.objectContaining({ type: 'object' }),
      Moon: { type: 'string' },
      MoonInput: expect.objectContaining({
        properties: expect.objectContaining({
          radius: { type: 'number' },
        }),
      }),
    })
  })

  it('names components with customComponentName', async () => {
    const Planet = z.object({ id: z.string() }).meta({ id: 'Planet' })

    const doc = await generator.generate({
      planet: oc.input(z.object({ planet: Planet })),
    }, {
      customComponentName: defName => `Api${defName}`,
    })

    expect((doc.paths?.['/planet']?.post?.requestBody as any).content['application/json'].schema).toEqual(
      expect.objectContaining({
        properties: {
          planet: { $ref: '#/components/schemas/ApiPlanet' },
        },
      }),
    )
    expect(doc.components?.schemas).toEqual({
      ApiPlanet: expect.objectContaining({ type: 'object' }),
    })
  })

  it('references components from detailed request and response bodies', async () => {
    const doc = await generator.generate({
      updatePlanet: oc
        .meta(openapi({ path: '/planets/{id}', inputStructure: 'detailed', outputStructure: 'detailed' }))
        .input(z.object({
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string() }).meta({ id: 'UpdatePlanetInput' }),
        }))
        .output(z.object({
          body: z.object({ updated: z.boolean() }).meta({ id: 'UpdatePlanetOutput' }),
        })),
    })

    expect(doc.paths?.['/planets/{id}']?.post).toEqual(expect.objectContaining({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePlanetInput' },
          },
        },
      },
      responses: {
        200: expect.objectContaining({
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdatePlanetOutput' },
            },
          },
        }),
      },
    }))
  })
})
