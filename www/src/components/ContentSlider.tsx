import React from 'react';

type Props = {
  cards: Array<{
    title: string;
    link: string;
    time: string;
    people: string[];
  }>;
};

export const ContentSlider = ({ cards }: Props) => {
  return (
    <div className="grid snap-x snap-mandatory gap-8 overflow-x-auto px-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        return (
          <a
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            key={card.title}
            className="flex flex-none snap-center snap-always flex-col justify-between rounded border-2 p-6"
          >
            <p className="text-lg font-bold dark:text-white">{card.title}</p>
            <div>
              <p className="my-4 dark:text-white">{card.people.join(', ')}</p>
              <p className="text-zinc-300">{card.time}</p>
            </div>
          </a>
        );
      })}
    </div>
  );
};
