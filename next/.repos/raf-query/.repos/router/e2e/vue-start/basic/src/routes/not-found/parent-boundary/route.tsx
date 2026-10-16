import { defineComponent } from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'

const ParentBoundaryNotFoundComponent = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    return () => (
      <div data-testid="parent-boundary-notFound-component">
        <div data-testid="parent-loader-data">
          {loaderData.value.parentLoaderData}
        </div>
      </div>
    )
  },
})

export const Route = createFileRoute('/not-found/parent-boundary')({
  loader: () => ({
    parentLoaderData: 'ready',
  }),
  component: RouteComponent,
  notFoundComponent: ParentBoundaryNotFoundComponent,
})

function RouteComponent() {
  return (
    <div>
      <Outlet />
    </div>
  )
}
