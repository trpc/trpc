import { cn } from '@/lib/cn';
import { fetchContributors } from '@/lib/get-contributors';
import Image from 'next/image';
import type { HTMLAttributes } from 'react';

export interface ContributorCounterProps
  extends HTMLAttributes<HTMLDivElement> {
  repoOwner: string;
  repoName: string;
  displayCount?: number;
}

export default async function ContributorCounter({
  repoOwner,
  repoName,
  displayCount = 20,
  ...props
}: ContributorCounterProps): Promise<React.ReactElement> {
  const contributors = await fetchContributors(repoOwner, repoName);
  const topContributors = contributors
    .filter((contributor) => contributor.login !== repoOwner)
    .slice(0, displayCount);

  return (
    <div
      {...props}
      className={cn('flex flex-col items-center gap-4', props.className)}
    >
      <div className="flex flex-row flex-wrap items-center justify-center md:pe-4">
        {topContributors.map((contributor, i) => (
          <a
            key={contributor.login}
            href={`https://github.com/${contributor.login}`}
            rel="noreferrer noopener"
            target="_blank"
            className="border-fd-background bg-fd-background size-10 overflow-hidden rounded-full border-4 md:-mr-4 md:size-12"
            style={{
              zIndex: topContributors.length - i,
            }}
          >
            <Image
              src={contributor.avatar_url}
              alt={`${contributor.login}'s avatar`}
              unoptimized
              width={48}
              height={48}
            />
          </a>
        ))}
        {displayCount < contributors.length ? (
          <div className="bg-fd-secondary size-12 content-center rounded-full text-center">
            +{contributors.length - displayCount}
          </div>
        ) : null}
      </div>
      <div className="text-fd-muted-foreground text-center text-sm">
        Some of our best contributors.
      </div>
    </div>
  );
}
