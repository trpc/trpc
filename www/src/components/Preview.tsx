import React from 'react';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <img
          src="/img/preview-dark.gif"
          alt="Demo"
          width="550px"
          className="rounded-md shadow-xl trpcgif trpcgif--v10-dark"
        />
        <img
          src="/img/preview-light.gif"
          alt="Demo"
          width="550px"
          className="rounded-md shadow-xl trpcgif trpcgif--v10-light"
        />
        <img
          src="https://storage.googleapis.com/trpc/trpcgif.gif"
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
