import React from 'react';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="border-[20px] shadow-xl rounded-3xl border-[#111111] trpcgif trpcgif--v10"
        >
          <source
            src="https://assets.trpc.io/www/v10/v10-dark-landscape.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
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
