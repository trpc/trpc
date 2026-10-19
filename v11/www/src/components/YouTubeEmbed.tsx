import React from 'react';

interface Props {
  videoId: string;
  title: string;
}

export const YouTubeEmbed = ({ videoId, title }: Props) => {
  return (
    <div className="max-w-2xl">
      <div className="relative pt-[56.25%]">
        <iframe
          className="absolute left-0 top-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        ></iframe>
      </div>
    </div>
  );
};
