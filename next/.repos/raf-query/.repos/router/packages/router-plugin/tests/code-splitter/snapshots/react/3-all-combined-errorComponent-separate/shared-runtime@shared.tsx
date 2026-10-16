const Count = {
  Initial: 0
};
const Labels = {
  component: 'count'
};
const seed = createSeed();
const {
  state,
  increment
} = createState(seed);
function createSeed() {
  console.log('shared-runtime:seed');
  return {
    count: Count.Initial,
    label: Labels.component
  };
}
function createState(initialState: {
  count: number;
}) {
  console.log('shared-runtime:state');
  return {
    state: initialState,
    increment: () => initialState.count++
  };
}
export { Count, createSeed, createState, increment, Labels, seed, state };