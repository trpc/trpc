import { state, createState, createSeed, Labels, increment } from "shared-runtime.tsx?tsr-shared=1";
const label = createComponentLabel();
function createState(initialState: {
  count: number;
}): {
  state: {
    count: number;
  };
  increment: () => number;
};
function createComponentLabel() {
  console.log('shared-runtime:component');
  return Labels.component;
}
export { state as firstState, state as secondState, state as 'odd-name' };
export default createSeed;
const SplitLoader = () => {
  increment();
  return state;
};
export { SplitLoader as loader };
const SplitComponent = () => {
  if (state.count === 3) {
    throw new Error('route source-map contract');
  }
  return `${label}:${state.count}`;
};
export { SplitComponent as component };