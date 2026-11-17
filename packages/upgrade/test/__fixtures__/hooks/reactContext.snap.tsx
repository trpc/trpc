import React from 'react';

export function Component() {
  return 'ok';
}

const DummyContext = React.createContext(2);

export function Component2() {
  const value = React.useContext(DummyContext);

  return 'ok';
}
