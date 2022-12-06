import React, { useEffect, useState } from 'react';

export const Preview = () => {
  function getWindowDimensions() {
    const { innerWidth: width, innerHeight: height } = window;
    return {
      width,
      height,
    };
  }

  const [windowDimensions, setWindowDimensions] = useState(
    getWindowDimensions(),
  );

  useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className={
            windowDimensions.width <= 768
              ? 'border-6 shadow-xl rounded-lg bg-[#111111] border-[#111111] trpcgif trpcgif--v10 trpcgif--portrait'
              : 'border-[20px] shadow-xl rounded-lg bg-[#111111] border-[#111111] trpcgif trpcgif--v10 trpcgif--landscape'
          }
          poster={
            windowDimensions.width <= 768
              ? 'https://assets.trpc.io/www/v10/preview-dark.png'
              : 'https://assets.trpc.io/www/v10/v10-dark-landscape.png'
          }
          src={
            windowDimensions.width <= 768
              ? 'https://assets.trpc.io/www/v10/preview-dark.mp4'
              : 'https://assets.trpc.io/www/v10/v10-dark-landscape.mp4'
          }
        >
          You need a browser that supports HTML5 video to view this video.
        </video>
        <figcaption className="pt-3 text-sm text-center text-gray-400 transition group-hover:text-gray-900">
          The client above is <strong>not</strong> importing any code from the
          server, only its type declarations.
        </figcaption>
      </figure>
    </div>
  );
};
