import { state, createState, createSeed, increment } from "shared-runtime.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-runtime.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
console.log('shared-runtime:reference');
export const Route = createFileRoute('/shared-runtime')({
  beforeLoad: () => state,
  loader: () => {
    increment();
    return state;
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
function createState(initialState: {
  count: number;
}): {
  state: {
    count: number;
  };
  increment: () => number;
};
export { state as firstState, state as secondState, state as 'odd-name' };
export default createSeed;