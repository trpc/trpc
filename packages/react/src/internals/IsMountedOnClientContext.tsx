import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

const context = createContext(false);

/**
 * @internal
 */
export const useIsMountedOnClient = () => useContext(context);

/**
 * @internal
 */
export function IsMountedOnClientProvider(props: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  return (
    <context.Provider value={isMounted}>{props.children}</context.Provider>
  );
}
