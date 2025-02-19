import React from 'react';
import { trpc } from './trpc';

export function Component() {
  const y = trpc.useContext();
}

const DummyContext = React.createContext(2);

export function Component2() {
  const value = React.useContext(DummyContext);
}
