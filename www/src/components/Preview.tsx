import React from 'react';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <img
          src="https://assets.trpc.io/www/v10/preview-dark-new.gif"
          alt="Demo"
          width="550px"
          className="rounded-md shadow-xl trpcgif trpcgif--v10-dark"
        />
        <img
          src="https://assets.trpc.io/www/v10/preview-light.gif"
          alt="Demo"
          width="550px"
          className="rounded-md shadow-xl trpcgif trpcgif--v10-light"
        />
        <img
          src="https://assets.trpc.io/www/v9/trpcgif.gif"
          alt="Demo"
          className="trpcgif trpcgif--v9"
        />
        <figcaption className="pt-3 text-sm text-center text-gray-400 transition group-hover:text-gray-900">
          The client above is <strong>not</strong> importing any code from the
          server, only its type declarations.
        </figcaption>
      </figure>
    </div>
  );
};
