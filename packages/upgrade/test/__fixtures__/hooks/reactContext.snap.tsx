import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useTRPC } from './reactContext.trpc';

export function Component() {
  const queryClient = useQueryClient();

  return 'ok';
}

const DummyContext = React.createContext(2);

export function Component2() {
  const value = React.useContext(DummyContext);

  return 'ok';
}
