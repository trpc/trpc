import type { ExecutionContext } from '@nestjs/common'
import { Controller } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { implement } from '@orpc/server'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Implement } from './implement'
import { ORPCModule } from './module'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('module configuration', () => {
  const contract = oc.meta(openapi({
    path: '/module-config',
  }))

  const handler = vi.fn(({ context }) => context.source)

  @Controller()
  class ImplController {
    @Implement(contract)
    moduleConfig() {
      return implement(contract).handler(handler)
    }
  }

  it('should apply config from ORPCModule.forRoot', async () => {
    const routingInterceptor = vi.fn(({ next }) => next())

    const moduleRef = await Test.createTestingModule({
      controllers: [ImplController],
      imports: [
        ORPCModule.forRoot({
          context: {
            source: 'forRoot',
          },
          routingInterceptors: [routingInterceptor],
        }),
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    const res = await supertest(app.getHttpServer()).post('/module-config')

    expect(res.statusCode).toEqual(200)
    expect(res.body).toEqual('forRoot')
    expect(routingInterceptor).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should apply config from ORPCModule.forRootAsync with injections', async () => {
    const routingInterceptor = vi.fn(({ next }) => next())
    const useFactory = vi.fn(async request => ({
      context: {
        source: 'forRootAsync',
      },
      routingInterceptors: [routingInterceptor],
    }))

    const moduleRef = await Test.createTestingModule({
      controllers: [ImplController],
      imports: [
        ORPCModule.forRootAsync({
          useFactory,
          inject: [REQUEST],
        }),
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    const res1 = await supertest(app.getHttpServer()).post('/module-config?test=1')

    expect(useFactory).toHaveBeenCalledTimes(1)
    expect(useFactory).toHaveBeenCalledWith(expect.objectContaining({ url: '/module-config?test=1', method: 'POST' }))
    expect(res1.statusCode).toEqual(200)
    expect(res1.body).toEqual('forRootAsync')
    expect(routingInterceptor).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)

    const res2 = await supertest(app.getHttpServer()).post('/module-config?test=2')

    expect(res2.statusCode).toEqual(200)
    expect(res2.body).toEqual('forRootAsync')
    // because the request is different, the useFactory should be called again
    expect(useFactory).toHaveBeenCalledTimes(2)
    expect(useFactory).toHaveBeenCalledWith(expect.objectContaining({ url: '/module-config?test=2', method: 'POST' }))
    expect(routingInterceptor).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should support context as an async function receiving ExecutionContext, isolated per request', async () => {
    const context = vi.fn((ctx: ExecutionContext) => ({ source: ctx.switchToHttp().getRequest().url }))

    const moduleRef = await Test.createTestingModule({
      controllers: [ImplController],
      imports: [
        ORPCModule.forRoot({
          context,
        }),
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    const res1 = await supertest(app.getHttpServer()).post('/module-config?request=1')
    expect(res1.statusCode).toEqual(200)
    expect(res1.body).toEqual('/module-config?request=1')

    const res2 = await supertest(app.getHttpServer()).post('/module-config?request=2')
    expect(res2.statusCode).toEqual(200)
    expect(res2.body).toEqual('/module-config?request=2')
  })
})
