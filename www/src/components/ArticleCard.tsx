import React from 'react';

type Props = {
  title: string;
  link: string;
  date: Date;
  author: {
    name: string;
    description: string;
    avatar: string;
    link: string;
  };
};

export const ArticleCard = ({ title, link, date, author }: Props) => {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 rounded-xl border p-8 shadow-xl">
      <h2>
        <a href={link} target="_blank" rel="noopener noreferrer">
          {title}{' '}
        </a>
      </h2>
      <div className="flex w-full justify-between">
        <div className="flex justify-between gap-4">
          <img
            src={author.avatar}
            alt={author.name}
            className="mt-1 h-10 w-10 rounded-full"
          />
          <div className="flex flex-col">
            <div>
              <a href={author.link}>{author.name}</a>
            </div>
            <p>{author.description}</p>
          </div>
        </div>
        <p>{date.toDateString()}</p>
      </div>
    </div>
  );
};
