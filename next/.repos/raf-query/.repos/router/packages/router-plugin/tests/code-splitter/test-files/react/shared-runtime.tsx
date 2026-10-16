import { createFileRoute } from '@tanstack/react-router'

const Count = { Initial: 0 }

const Labels = { component: 'count' }

const seed = createSeed()
const { state, increment } = createState(seed)
const label = createComponentLabel()
console.log('shared-runtime:reference')

export const Route = createFileRoute('/shared-runtime')({
  beforeLoad: () => state,
  loader: () => {
    increment()
    return state
  },
  component: () => {
    if (state.count === 3) {
      throw new Error('route source-map contract')
    }
    return `${label}:${state.count}`
  },
})

function createSeed() {
  console.log('shared-runtime:seed')
  return { count: Count.Initial, label: Labels.component }
}

function createState(initialState: { count: number }): {
  state: { count: number }
  increment: () => number
}
function createState(initialState: { count: number }) {
  console.log('shared-runtime:state')
  return {
    state: initialState,
    increment: () => initialState.count++,
  }
}

function createComponentLabel() {
  console.log('shared-runtime:component')
  return Labels.component
}

export { state as firstState, state as secondState, state as 'odd-name' }

export default createSeed
