import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

// https://github.com/TanStack/router/issues/7964
test('#7964: a child loader receives fresh structured params after revisiting its route', async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home page</div>,
  })
  const parsedParamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$parsedParam',
    params: {
      parse: ({ parsedParam }) => {
        const [recordName, revisionNumber] = parsedParam.split('-')
        return {
          parsedParam: {
            recordName: recordName!,
            revisionNumber: Number(revisionNumber),
          },
        }
      },
      stringify: ({ parsedParam }) => ({
        parsedParam: `${parsedParam.recordName}-${parsedParam.revisionNumber}`,
      }),
    },
    component: Outlet,
  })
  const parsedParamIndexRoute = createRoute({
    getParentRoute: () => parsedParamRoute,
    path: '/',
    loader: ({ params }) => params.parsedParam.revisionNumber * 100,
    component: () => {
      const params = parsedParamIndexRoute.useParams()
      const loaderData = parsedParamIndexRoute.useLoaderData()

      return (
        <>
          <div data-testid="params">
            Params have {params().parsedParam.recordName} with revision{' '}
            {params().parsedParam.revisionNumber}
          </div>
          <div data-testid="loader-data">Loader data is {loaderData()}</div>
        </>
      )
    },
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    parsedParamRoute.addChildren([parsedParamIndexRoute]),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)

  await router.navigate({
    to: '/$parsedParam',
    params: { parsedParam: { recordName: 'blue', revisionNumber: 1 } },
  })
  expect(
    await screen.findByText('Params have blue with revision 1'),
  ).toBeInTheDocument()
  expect(await screen.findByText('Loader data is 100')).toBeInTheDocument()

  await router.navigate({ to: '/' })
  expect(await screen.findByText('Home page')).toBeInTheDocument()

  await router.navigate({
    to: '/$parsedParam',
    params: { parsedParam: { recordName: 'red', revisionNumber: 2 } },
  })
  expect(router.state.location.pathname).toBe('/red-2')

  await waitFor(() => {
    expect({
      params: screen.getByTestId('params').textContent,
      loaderData: screen.getByTestId('loader-data').textContent,
    }).toEqual({
      params: 'Params have red with revision 2',
      loaderData: 'Loader data is 200',
    })
  })
})
