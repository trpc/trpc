export const linkPathCases = [
  { current: '/', to: '/', exact: true, active: true },
  { current: '/posts', to: '/posts/', exact: true, active: true },
  { current: '/posts/', to: '/posts', exact: true, active: true },
  { current: '/posts/item', to: '/posts', exact: true, active: false },
  { current: '/posts/item', to: '/posts', exact: false, active: true },
  { current: '/posts/item', to: '/posts/', exact: false, active: true },
  { current: '/posts-other', to: '/posts', exact: false, active: false },
]
