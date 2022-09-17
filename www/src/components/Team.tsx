import React, { FC } from 'react';

const team = [
  {
    name: 'James Berry',
    avatar: 'https://avatars.githubusercontent.com/u/69924001?v=4?s=100',
    link: 'https://twitter.com/jlalmes',
  },
  {
    name: 'Julius Marminge',
    avatar: 'https://avatars.githubusercontent.com/u/51714798?v=4?s=100',
    link: 'http://www.jumr.dev/',
  },
  {
    name: 'Alex/KATT',
    avatar: 'https://avatars.githubusercontent.com/u/459267?v=4?s=100',
    link: 'https://twitter.com/alexdotjs',
  },
  {
    name: 'Sachin Raja',
    avatar: 'https://avatars.githubusercontent.com/u/58836760?v=4?s=100',
    link: 'https://github.com/sachinraja',
  },
  {
    name: 'Ahmed Elsakaan',
    avatar: 'https://avatars.githubusercontent.com/u/20271968?v=4&s=100',
    link: 'https://elsakaan.dev/',
  },
  {
    name: 'Chris Bautista',
    avatar: 'https://avatars.githubusercontent.com/u/3660667?v=4?s=100',
    link: 'http://www.big-sir.com/',
  },
];

export const Team: FC = () => {
  return (
    <div className="mt-12">
      <div className="flex justify-center gap-12">
        {team.map((member) => (
          <a
            href={member.link}
            key={member.name}
            className="flex flex-col hover:no-underline items-center gap-3"
          >
            <img
              loading="lazy"
              src={member.avatar}
              alt={member.name}
              width={100}
              height={100}
              className="rounded-full"
            />
            <p className="dark:text-zinc-300 text-zinc-700">{member.name}</p>
          </a>
        ))}
      </div>
    </div>
  );
};
