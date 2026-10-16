import type { RouterUtilsPlugin } from './plugin'
import { CompositeRouterUtilsPlugin } from './plugin'

describe('compositeRouterUtilsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sorts plugins by before/after dependencies and forwards transformed options', () => {
    const plugin1 = {
      name: 'plugin-1',
      after: ['plugin-2'],
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '1'] })),
    } satisfies RouterUtilsPlugin<any>

    const plugin2 = {
      name: 'plugin-2',
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '2'] })),
    } satisfies RouterUtilsPlugin<any>

    const plugin3 = {
      name: 'plugin-3',
      before: ['plugin-2'],
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '3'] })),
    } satisfies RouterUtilsPlugin<any>

    const composite = new CompositeRouterUtilsPlugin([plugin1, plugin2, plugin3])

    const result = composite.init({ marks: [] } as any)

    expect(plugin1.init).toHaveBeenCalledOnce()
    expect(plugin2.init).toHaveBeenCalledOnce()
    expect(plugin3.init).toHaveBeenCalledOnce()

    expect(plugin3.init).toHaveBeenCalledWith({ marks: [] })
    expect(plugin2.init).toHaveBeenCalledWith({ marks: ['3'] })
    expect(plugin1.init).toHaveBeenCalledWith({ marks: ['3', '2'] })

    expect(result).toEqual({ marks: ['3', '2', '1'] })
  })

  it('sorts plugins by before/after dependencies and forwards transformed procedure options', () => {
    const plugin1 = {
      name: 'plugin-1',
      after: ['plugin-2'],
      initProcedureOptions: vi.fn((path: string[], options: any) => ({
        ...options,
        path,
        marks: [...options.marks, '1'],
      })),
    } satisfies RouterUtilsPlugin<any>

    const plugin2 = {
      name: 'plugin-2',
      initProcedureOptions: vi.fn((path: string[], options: any) => ({
        ...options,
        path,
        marks: [...options.marks, '2'],
      })),
    } satisfies RouterUtilsPlugin<any>

    const plugin3 = {
      name: 'plugin-3',
      before: ['plugin-2'],
      initProcedureOptions: vi.fn((path: string[], options: any) => ({
        ...options,
        path,
        marks: [...options.marks, '3'],
      })),
    } satisfies RouterUtilsPlugin<any>

    const composite = new CompositeRouterUtilsPlugin([plugin1, plugin2, plugin3])

    const result = composite.initProcedureOptions(['key'], { marks: [] } as any)

    expect(plugin1.initProcedureOptions).toHaveBeenCalledOnce()
    expect(plugin2.initProcedureOptions).toHaveBeenCalledOnce()
    expect(plugin3.initProcedureOptions).toHaveBeenCalledOnce()

    expect(plugin3.initProcedureOptions).toHaveBeenCalledWith(['key'], { marks: [] })
    expect(plugin2.initProcedureOptions).toHaveBeenCalledWith(['key'], { path: ['key'], marks: ['3'] })
    expect(plugin1.initProcedureOptions).toHaveBeenCalledWith(['key'], { path: ['key'], marks: ['3', '2'] })

    expect(result).toEqual({ path: ['key'], marks: ['3', '2', '1'] })
  })

  it('skips plugins that do not implement init hooks', () => {
    const init = vi.fn((options: any) => ({ ...options, marks: [...options.marks, '1'] }))
    const initProcedureOptions = vi.fn((path: string[], options: any) => ({
      ...options,
      path,
      marks: [...options.marks, '1'],
    }))

    const composite = new CompositeRouterUtilsPlugin([
      { name: 'noop-plugin' },
      { name: 'active-plugin', init, initProcedureOptions },
    ])

    expect(composite.init({ marks: [] } as any)).toEqual({ marks: ['1'] })
    expect(init).toHaveBeenCalledOnce()
    expect(init).toHaveBeenCalledWith({ marks: [] })

    expect(composite.initProcedureOptions(['key'], { marks: [] } as any)).toEqual({
      path: ['key'],
      marks: ['1'],
    })
    expect(initProcedureOptions).toHaveBeenCalledOnce()
    expect(initProcedureOptions).toHaveBeenCalledWith(['key'], { marks: [] })
  })
})
