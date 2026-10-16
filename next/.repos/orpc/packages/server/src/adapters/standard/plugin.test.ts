import type { StandardHandlerPlugin } from './plugin'
import { CompositeStandardHandlerPlugin } from './plugin'

describe('compositeStandardHandlerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sorts plugins by before/after dependencies and forwards transformed options', () => {
    const plugin1 = {
      name: 'plugin-1',
      after: ['plugin-2'],
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '1'] })),
    } satisfies StandardHandlerPlugin<any>

    const plugin2 = {
      name: 'plugin-2',
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '2'] })),
    } satisfies StandardHandlerPlugin<any>

    const plugin3 = {
      name: 'plugin-3',
      before: ['plugin-2'],
      init: vi.fn((options: any) => ({ ...options, marks: [...options.marks, '3'] })),
    } satisfies StandardHandlerPlugin<any>

    const composite = new CompositeStandardHandlerPlugin([plugin1, plugin2, plugin3])

    const result = composite.init({ marks: [] } as any)

    expect(plugin1.init).toHaveBeenCalledOnce()
    expect(plugin2.init).toHaveBeenCalledOnce()
    expect(plugin3.init).toHaveBeenCalledOnce()

    expect(plugin3.init).toHaveBeenCalledWith({ marks: [] })
    expect(plugin2.init).toHaveBeenCalledWith({ marks: ['3'] })
    expect(plugin1.init).toHaveBeenCalledWith({ marks: ['3', '2'] })

    expect(result).toEqual({ marks: ['3', '2', '1'] })
  })
})
