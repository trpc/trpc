import React from 'react';
import { trpc } from './reactContext.trpc';

export function Component() {
  const y = trpc.useContext();

  return 'ok';
}

const DummyContext = React.createContext(2);

export function Component2() {
  const value = React.useContext(DummyContext);

  return 'ok';
}
