import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Whether TanStack Query thinks it's online; mutations pause when not. */
export const useOnline = () =>
  useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
