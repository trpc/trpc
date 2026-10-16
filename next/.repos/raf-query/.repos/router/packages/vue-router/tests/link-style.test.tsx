import * as Vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

function renderLinks(Links: Vue.Component) {
  const history = createMemoryHistory({ initialEntries: ['/target'] })
  disposers.push(history.destroy)
  const root = createRootRoute({
    component: () => Vue.h(Vue.Fragment, [Vue.h(Links), Vue.h(Outlet)]),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
    scrollRestoration: false,
    defaultPreload: false,
  })
  render(Vue.h(RouterProvider, { router }))
  return router
}

test('preserves object and nested-array class bindings across state updates', async () => {
  const activeClass = Vue.reactive({ selected: true, removed: false })
  const inactiveClass = Vue.reactive({ idle: true })
  const router = renderLinks(() =>
    Vue.h(
      Link,
      {
        to: '/target',
        class: ['base', { decorated: true }],
        activeProps: () => ({
          class: ['active-state', [undefined, activeClass, ['nested']]],
        }),
        inactiveProps: { class: inactiveClass },
      },
      () => 'Class bindings',
    ),
  )
  const link = await screen.findByRole('link', { name: 'Class bindings' })
  expect([...link.classList]).toEqual([
    'base',
    'decorated',
    'active-state',
    'selected',
    'nested',
  ])
  activeClass.selected = false
  activeClass.removed = true
  await waitFor(() => {
    expect(link).not.toHaveClass('selected')
    expect(link).toHaveClass('removed', 'nested')
  })
  await router.navigate({ to: '/' })
  await waitFor(() => {
    expect([...link.classList]).toEqual(['base', 'decorated', 'idle'])
  })
  inactiveClass.idle = false
  await waitFor(() =>
    expect([...link.classList]).toEqual(['base', 'decorated']),
  )
})

test.each([false, true])(
  'useLinkProps retains class values rather than strings (with base: %s)',
  async (withBase) => {
    const baseClass = ['base', { decorated: true }]
    const stateClass = { selected: true }
    let binding: unknown
    const HookLink = Vue.defineComponent({
      setup() {
        const props = useLinkProps({
          to: '/target',
          class: withBase ? baseClass : undefined,
          activeProps: { class: stateClass },
        })
        return () => {
          const resolved = Vue.unref(props)
          binding = resolved.class
          return Vue.h('a', { ...resolved }, 'Hook classes')
        }
      },
    })
    renderLinks(HookLink)
    await screen.findByRole('link', { name: 'Hook classes' })
    if (withBase) {
      expect(binding).toEqual([baseClass, stateClass])
    } else {
      expect(binding).toBe(stateClass)
    }
  },
)

test('omits the class binding when neither source provides a class', async () => {
  renderLinks(() =>
    Vue.h(Link, { to: '/target', activeProps: {} }, () => 'No classes'),
  )
  const link = await screen.findByRole('link', { name: 'No classes' })
  expect(link).not.toHaveAttribute('class')
})

test('tracks additions to an initially empty state-only style proxy', async () => {
  const style = Vue.reactive<Vue.CSSProperties>({})
  renderLinks(() =>
    Vue.h(
      Link,
      { to: '/target', activeProps: () => ({ style }) },
      () => 'Reactive',
    ),
  )
  const link = await screen.findByRole('link', { name: 'Reactive' })
  expect(link.style.color).toBe('')
  style.color = 'red'
  await waitFor(() => expect(link.style.color).toBe('red'))
  delete style.color
  await waitFor(() => expect(link.style.color).toBe(''))
})

test('merges only the selected state and tracks reactive style properties', async () => {
  const base = Vue.reactive({ color: 'red', marginTop: '2px' })
  const stateStyle = Vue.reactive({ backgroundColor: 'white' })
  const stateClass = Vue.ref('selected')
  const active = vi.fn(() => ({
    class: stateClass.value,
    style: stateStyle,
    title: 'selected',
    href: '/state-href',
  }))
  const inactive = vi.fn(() => ({
    class: 'idle',
    style: { color: 'gray' },
    title: 'idle',
  }))
  const router = renderLinks(() =>
    Vue.h(
      Link,
      {
        to: '/target',
        class: ['base', { decorated: true }],
        style: base,
        activeProps: active,
        inactiveProps: inactive,
      },
      () => 'Styled',
    ),
  )
  const link = await screen.findByRole('link', { name: 'Styled' })
  expect(link).toHaveClass('base', 'decorated', 'selected')
  expect(link.style).toMatchObject({
    color: 'red',
    marginTop: '2px',
    backgroundColor: 'white',
  })
  expect(link).toHaveAttribute('href', '/target')
  expect(inactive).not.toHaveBeenCalled()

  base.color = 'blue'
  stateStyle.backgroundColor = 'black'
  stateClass.value = 'updated'
  await waitFor(() => {
    expect(link).toHaveClass('base', 'decorated', 'updated')
    expect(link.style).toMatchObject({
      color: 'blue',
      backgroundColor: 'black',
    })
  })

  await router.navigate({ to: '/' })
  await waitFor(() => {
    expect(link).toHaveClass('base', 'idle')
    expect(link).toHaveAttribute('title', 'idle')
    expect(link).toHaveAttribute('href', '/target')
    expect(link.style).toMatchObject({ color: 'gray', marginTop: '2px' })
    expect(link.style.backgroundColor).toBe('')
  })
  active.mockClear()
  inactive.mockClear()
  base.marginTop = '3px'
  await waitFor(() => expect(link.style).toMatchObject({ marginTop: '3px' }))
  expect(active).not.toHaveBeenCalled()
  expect(inactive).toHaveBeenCalled()

  await router.navigate({ to: '/target' })
  await waitFor(() => {
    expect(link).toHaveClass('base', 'updated')
    expect(link.style).toMatchObject({
      color: 'blue',
      backgroundColor: 'black',
    })
  })
})

test('switches between default and custom state props without stale attributes', async () => {
  const custom = Vue.ref(false)
  const router = renderLinks(() =>
    Vue.h(
      Link,
      {
        to: '/target',
        activeProps: custom.value
          ? { title: 'custom', style: { color: 'red' } }
          : undefined,
      },
      () => 'Defaults',
    ),
  )
  const link = await screen.findByRole('link', { name: 'Defaults' })
  expect(link).toHaveClass('active')
  custom.value = true
  await waitFor(() => {
    expect(link).not.toHaveClass('active')
    expect(link).toHaveAttribute('title', 'custom')
    expect(link.style).toMatchObject({ color: 'red' })
  })
  custom.value = false
  await waitFor(() => {
    expect(link).toHaveClass('active')
    expect(link).not.toHaveAttribute('title')
    expect(link.style.color).toBe('')
  })
  await router.navigate({ to: '/' })
  await waitFor(() => expect(link).not.toHaveClass('active'))
})
