'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

let toasted = false;
export default function PostLayout(props: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const timeout = setTimeout(() => {
        if (toasted) return;
        toasted = true;
        toast(
          'Please note that we have an artificial delay on the server functions to simulate real-world conditions.',
          {
            icon: '🐌',
          },
        );
      }, 1);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, []);
  return props.children;
}
