import { buttonVariants } from '@shared/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shared/ui/components/tooltip';
import { cn } from '@shared/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Heart } from 'lucide-react';

import { avatarUrl, partners, sponsors, topSponsors } from '~/sponsors.ts';

import { PartnerLogo } from './partners.tsx';

const moreLink =
  'inline-flex h-9 items-center rounded-full border border-dashed px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:text-foreground';

/**
 * Under the home page's hero: the partners' logos, linking to the rest of
 * the sponsors, or the sponsors who give the most while there are no partners.
 */
export function SupportedBy() {
  const showPartners = partners.length > 0;
  return (
    <div className="grid gap-2.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Supported by
      </p>
      {showPartners ? (
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {partners.map((partner) => (
            // As tall as the "more" link, which a slow device can paint the
            // logos without: their line doesn't move when it's parsed.
            <a
              className="flex h-9 items-center text-foreground/60 grayscale transition-[color,filter] duration-300 hover:text-foreground hover:grayscale-0"
              href={partner.link}
              key={partner.login}
              rel="sponsored noopener"
              target="_blank"
              title={partner.blurb}
            >
              <PartnerLogo className="h-6 w-auto" partner={partner} />
            </a>
          ))}
          <a className={moreLink} href="#sponsors">
            +{sponsors.length - partners.length} more
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <ul className="flex -space-x-2">
            {topSponsors.map((sponsor) => (
              <li className="relative hover:z-10" key={sponsor.login}>
                <Tooltip>
                  <TooltipTrigger
                    delay={80}
                    render={
                      <a
                        aria-label={sponsor.name}
                        className="block size-9 overflow-hidden rounded-full bg-background ring-2 ring-background grayscale transition-[filter,translate] duration-300 hover:-translate-y-0.5 hover:grayscale-0 focus-visible:grayscale-0"
                        href={sponsor.link}
                        rel="sponsored noopener"
                        target="_blank"
                      />
                    }
                  >
                    <img
                      alt=""
                      className="size-full object-cover"
                      height={72}
                      src={avatarUrl(sponsor, 72)}
                      width={72}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{sponsor.name}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
          <a className={moreLink} href="#sponsors">
            +{sponsors.length - topSponsors.length} more
          </a>
        </div>
      )}
    </div>
  );
}

export function SponsorButton(props: { readonly className?: string }) {
  return (
    <Link
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'group gap-2 font-semibold',
        props.className,
      )}
      to="/sponsor"
    >
      <Heart className="fill-pink-500 text-pink-500 transition-transform duration-200 group-hover:scale-125" />
      Become a sponsor
    </Link>
  );
}
