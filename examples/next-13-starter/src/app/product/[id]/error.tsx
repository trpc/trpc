'use client';

import { useEffect } from 'react';

export default function Error(props: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(props.error);
  }, [props.error]);

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => props.reset()
        }
      >
        Try again
      </button>
    </div>
  );
}
