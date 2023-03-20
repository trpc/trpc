import clsx from 'clsx';
import React, { ComponentPropsWithoutRef, useState } from 'react';

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
        'w-full h-full absolute transition-opacity duration-1000',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
};
