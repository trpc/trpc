import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  FileText,
  Heart,
  House,
  PanelRight,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { GitHubIcon } from '~/components/icons.tsx';
import { PartnerLogo } from '~/components/sponsors/partners.tsx';
import { SponsorCloud } from '~/components/sponsors/sponsor-cloud.tsx';
import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { pageHead } from '~/seo.ts';
import {
  partners,
  sponsorCardAlt,
  sponsorPage,
  sponsors,
  sponsorTierUrl,
  sponsorTiers,
  sponsorUrl,
  type SponsorTier,
} from '~/sponsors.ts';

export const Route = createFileRoute('/sponsor')({
  head: () => pageHead({ ...sponsorPage, imageAlt: sponsorCardAlt }),
  component: SponsorPage,
});

const priceOf = (tier: SponsorTier) =>
  sponsorTiers.find((entry) => entry.tier === tier)?.minMonthlyDollars ?? 0;

interface Tier {
  readonly emoji: string;
  /** Its id on the trpc organization's GitHub Sponsors listing. */
  readonly githubTierId: number;
  readonly lead?: string;
  readonly name: string;
  readonly partner: boolean;
  readonly perks: ReadonlyArray<string>;
  readonly price: number;
}

const silverTierId = 73667;

/** The trpc organization's monthly tiers; KATT's say the same. */
const tiers: ReadonlyArray<Tier> = [
  {
    emoji: '🌱',
    githubTierId: 380020,
    name: 'Indie',
    partner: false,
    perks: [
      'Your avatar in the sponsor cloud on trpc.io',
      'Listed under Backers in the tRPC README',
    ],
    price: 50,
  },
  {
    emoji: '🥉',
    githubTierId: 380021,
    name: 'Bronze',
    partner: false,
    perks: [
      'Your avatar in the sponsor cloud on trpc.io',
      'Your avatar in the Bronze sponsors table in the README',
    ],
    price: priceOf('bronze'),
  },
  {
    emoji: '🥈',
    githubTierId: silverTierId,
    lead: 'Featured as a tRPC partner across trpc.io and GitHub:',
    name: 'Silver',
    partner: true,
    perks: [
      'Your logo under the hero on the home page',
      'A card with your logo and a one-liner on the home page',
      'Your logo in the Partners column beside the docs',
      'Your logo in the Silver partners table in the README',
      'Prioritized bug fixes and feature requests',
      'A dedicated Discord channel for your team',
    ],
    price: priceOf('silver'),
  },
  {
    emoji: '🥇',
    githubTierId: 380022,
    lead: 'Everything in Silver, plus:',
    name: 'Gold',
    partner: true,
    perks: [
      'Shown first: the Gold row sits above Silver on trpc.io and in the README',
      'A free monthly consulting session',
      'A shout-out on X with a message of your choice',
    ],
    price: priceOf('gold'),
  },
];

const dollars = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const sinceYear = new Date(
  Math.min(...sponsors.map((sponsor) => sponsor.createdAt)),
).getUTCFullYear();

const sectionTitle = 'text-2xl font-bold tracking-tight sm:text-3xl';
const textLink = 'font-medium text-link underline-offset-4 hover:underline';

function SponsorPage() {
  return (
    <main>
      <Hero />
      <Tiers />
      <Placements />
      <Cloud />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-x-clip border-b">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden [background-image:radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-pink-500/15 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-4xl justify-items-center gap-6 px-4 py-20 text-center sm:px-6 lg:py-28">
        <Badge variant="outline">
          <Heart className="fill-pink-500 text-pink-500" /> Sponsor tRPC
        </Badge>
        <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {sponsorPage.headline}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          tRPC is MIT licensed and built in the open. Sponsors keep it that way,
          and the biggest of them are partners, with their logo across the site.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}
            href="#tiers"
          >
            See the tiers <ArrowRight />
          </a>
          <a
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'gap-2 [&_svg]:size-4',
            )}
            href={sponsorUrl}
          >
            <GitHubIcon /> Sponsor on GitHub
          </a>
        </div>
        <dl className="mt-4 flex flex-wrap justify-center gap-x-10 gap-y-4">
          <Stat label="sponsors" value={String(sponsors.length)} />
          <Stat label="partners" value={String(partners.length)} />
          <Stat label="sponsored since" value={String(sinceYear)} />
        </dl>
      </div>
    </section>
  );
}

function Stat(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid">
      <dt className="order-2 text-sm text-muted-foreground">{props.label}</dt>
      <dd className="text-3xl font-bold tracking-tight">{props.value}</dd>
    </div>
  );
}

function Tiers() {
  return (
    <section
      aria-labelledby="tiers"
      className="mx-auto max-w-7xl border-b px-4 py-16 sm:px-6"
    >
      <h2 className={cn(sectionTitle, 'mb-2')} id="tiers">
        Pick a tier
      </h2>
      <p className="mb-10 max-w-2xl text-muted-foreground">
        Monthly, through GitHub Sponsors; cancel any time. Silver and up makes
        you a partner.
      </p>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <li key={tier.name}>
            <TierCard tier={tier} />
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Want a one-time sponsorship, a custom amount, or something bigger than
        Gold? That&apos;s on{' '}
        <a className={textLink} href={sponsorUrl}>
          GitHub Sponsors
        </a>{' '}
        too, or{' '}
        <a className={textLink} href="mailto:info@trpc.io?subject=Sponsoring">
          email us
        </a>
        .
      </p>
    </section>
  );
}

function TierCard(props: { readonly tier: Tier }) {
  const tier = props.tier;
  return (
    <div
      className={cn(
        'relative grid h-full content-between gap-6 rounded-xl border bg-card p-6',
        tier.partner &&
          'border-brand/40 shadow-[0_12px_40px_-20px_var(--brand)]',
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-semibold">
            <span aria-hidden="true" className="mr-2">
              {tier.emoji}
            </span>
            {tier.name}
          </p>
          {tier.partner ? <Badge>Partner</Badge> : null}
        </div>
        <p>
          <span className="text-4xl font-bold tracking-tight">
            {dollars.format(tier.price)}
          </span>
          <span className="text-sm text-muted-foreground"> / month</span>
        </p>
        {tier.lead === undefined ? null : (
          <p className="text-sm text-muted-foreground">{tier.lead}</p>
        )}
        <ul className="grid gap-2 text-sm">
          {tier.perks.map((perk) => (
            <li className="flex gap-2" key={perk}>
              <Check className="mt-0.5 size-4 shrink-0 text-brand" />
              {perk}
            </li>
          ))}
        </ul>
      </div>
      <a
        className={cn(
          buttonVariants({ variant: tier.partner ? 'default' : 'outline' }),
          'w-full',
        )}
        href={sponsorTierUrl(tier.githubTierId)}
      >
        {tier.partner ? 'Become a partner' : 'Sponsor'}
      </a>
    </div>
  );
}

const placements: ReadonlyArray<{
  readonly body: string;
  readonly icon: ReactNode;
  readonly title: string;
}> = [
  {
    body: 'Your logo in the "Supported by" row, the first thing on trpc.io.',
    icon: <House />,
    title: 'Under the hero',
  },
  {
    body: 'A card with your logo, a line about what you do and a link, in the home page’s Sponsors section.',
    icon: <Sparkles />,
    title: 'A card on the home page',
  },
  {
    body: 'Your logo in the Partners column beside every docs page, where developers spend their day.',
    icon: <PanelRight />,
    title: 'Beside the docs',
  },
  {
    body: 'Your logo in the partners table at the top of the README’s sponsors.',
    icon: <FileText />,
    title: 'In the README',
  },
];

function Placements() {
  return (
    <section
      aria-labelledby="partners"
      className="mx-auto grid max-w-7xl items-start gap-12 border-b px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div>
        <h2 className={cn(sectionTitle, 'mb-2')} id="partners">
          Where partners show up
        </h2>
        <p className="mb-8 max-w-2xl text-muted-foreground">
          Silver and Gold sponsors are featured wherever tRPC developers look,
          with a wordmark we draw to fit the site in light and dark mode.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {placements.map((placement) => (
            <li
              className="grid content-start gap-2 rounded-xl border bg-card p-5 [&_svg]:size-5"
              key={placement.title}
            >
              <span className="text-brand">{placement.icon}</span>
              <span className="font-semibold">{placement.title}</span>
              <span className="text-sm text-muted-foreground">
                {placement.body}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <aside aria-label="Partners" className="grid gap-2">
        <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Partners
        </p>
        {partners.map((partner) => (
          <a
            className="flex h-14 items-center justify-center rounded-lg border bg-card px-4 text-foreground/80 transition-colors hover:text-foreground"
            href={partner.link}
            key={partner.login}
            rel="sponsored noopener"
            target="_blank"
            title={partner.blurb}
          >
            <PartnerLogo className="h-6 w-auto max-w-full" partner={partner} />
          </a>
        ))}
        <a
          className="flex h-14 items-center justify-center rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
          href={sponsorUrl}
        >
          Your logo here
        </a>
      </aside>
    </section>
  );
}

function Cloud() {
  return (
    <section
      aria-labelledby="sponsors"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
    >
      <h2 className={cn(sectionTitle, 'mb-2 text-center')} id="sponsors">
        Join {sponsors.length} sponsors
      </h2>
      <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground">
        Everyone who sponsors gets a bubble, sized by what they&apos;ve given.
        Thank you, all of you.
      </p>
      <SponsorCloud className="mx-auto max-w-3xl" />
    </section>
  );
}
