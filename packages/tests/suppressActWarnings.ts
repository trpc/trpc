/* eslint-disable no-console */

// Suppress React act() warnings
const originalError = console.error;

console.error = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    message.includes('was not wrapped in act(...)') &&
    process.env['MUTE_REACT_ACT_WARNINGS']
  ) {
    return;
  }
  originalError.apply(console, args);
};
