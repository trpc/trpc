import { state, createState, createSeed, increment } from "shared-runtime.tsx?tsr-shared=1";
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
const SplitLoader = () => {
  increment();
  return state;
};
export { SplitLoader as loader };