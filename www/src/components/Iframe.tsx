import clsx from 'clsx';
import type { ComponentPropsWithoutRef } from 'react';
import React, { useState } from 'react';

export const Iframe = (
  props: Omit<ComponentPropsWithoutRef<'iframe'>, 'className'>,
) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <iframe
      loading="lazy"
      {...props}
      onLoad={() => {
        setLoaded(true);
      }}
      className={clsx(
        'absolute h-full w-full transition-opacity duration-1000',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
};
