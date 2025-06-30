import {
  Banner,
  DynamicCodeBlock,
  File,
  Files,
  Folder,
  ImageZoom,
  InlineTOC,
} from '@/components/preview/lazy';
import { owner, repo } from '@/lib/github';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card } from 'fumadocs-ui/components/card';
import { GithubInfo } from 'fumadocs-ui/components/github-info';
import { Heading } from 'fumadocs-ui/components/heading';
import { RootToggle } from 'fumadocs-ui/components/layout/root-toggle';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Home } from 'lucide-react';
import { type ReactNode } from 'react';
import { Wrapper } from './wrapper';

export function heading(): ReactNode {
  return (
    <Wrapper>
      <div className="bg-fd-background prose-no-margin rounded-lg p-4">
        <Heading id="preview" as="h3">
          Hello World
        </Heading>
        <Heading id="preview" as="h3">
          Hello <code>World</code> Everyone!
        </Heading>
      </div>
    </Wrapper>
  );
}

export function card(): ReactNode {
  return (
    <Wrapper>
      <div className="bg-fd-background rounded-lg">
        <Card
          href="#"
          icon={<Home />}
          title="Hello World"
          description="Learn More about Caching and Revalidation"
        />
      </div>
    </Wrapper>
  );
}

export function tabs(): ReactNode {
  return (
    <Wrapper>
      <div className="prose-no-margin">
        <Tabs
          groupId="language"
          persist
          items={['Javascript', 'Rust', 'Typescript']}
        >
          <Tab value="Javascript">Hello World in Javascript</Tab>
          <Tab value="Rust">Hello World in Rust</Tab>
          <Tab value="Typescript">Also works if items are not the same</Tab>
        </Tabs>

        <Tabs groupId="language" persist items={['Javascript', 'Rust']}>
          <Tab value="Javascript">
            Value is shared! Try refresh and see if the value is persisted
          </Tab>
          <Tab value="Rust">
            Value is shared! Try refresh and see if the value is persisted
          </Tab>
        </Tabs>
      </div>
    </Wrapper>
  );
}

export function typeTable(): ReactNode {
  return (
    <Wrapper>
      <div className="bg-fd-background rounded-xl">
        <TypeTable
          type={{
            percentage: {
              description:
                'The percentage of scroll position to display the roll button',
              type: 'number',
              default: '0.2',
            },
          }}
        />
      </div>
    </Wrapper>
  );
}

export function zoomImage(): ReactNode {
  return (
    <Wrapper>
      {/* <ImageZoom
        alt="banner"
        src={BannerImage}
        className="!my-0 rounded-xl bg-fd-background"
        priority
      /> */}
    </Wrapper>
  );
}

export function accordion(): ReactNode {
  return (
    <Wrapper>
      <Accordions type="single" collapsible>
        <Accordion id="what-is-fumadocs" title="What is Fumadocs?">
          A framework for building documentations
        </Accordion>
        <Accordion id="ux" title="What do we love?">
          We love websites with a good user experience
        </Accordion>
      </Accordions>
    </Wrapper>
  );
}

export function callout(): ReactNode {
  return (
    <Wrapper>
      <Callout title="Title">Hello World</Callout>
    </Wrapper>
  );
}

export function files(): ReactNode {
  return (
    <Wrapper>
      <Files>
        <Folder name="app" defaultOpen>
          <Folder name="[id]" defaultOpen>
            <File name="page.tsx" />
          </Folder>
          <File name="layout.tsx" />
          <File name="page.tsx" />
          <File name="global.css" />
        </Folder>
        <Folder name="components">
          <File name="button.tsx" />
          <File name="tabs.tsx" />
          <File name="dialog.tsx" />
          <Folder name="empty" />
        </Folder>
        <File name="package.json" />
      </Files>
    </Wrapper>
  );
}

export function inlineTOC(): ReactNode {
  return (
    <Wrapper>
      <InlineTOC
        items={[
          { title: 'Welcome', url: '#welcome', depth: 2 },
          { title: 'Getting Started', url: '#getting-started', depth: 3 },
          { title: 'Usage', url: '#usage', depth: 3 },
          { title: 'Styling', url: '#styling', depth: 3 },
          { title: 'Reference', url: '#reference', depth: 2 },
          { title: 'Components', url: '#components', depth: 3 },
          { title: 'APIs', url: '#api', depth: 3 },
          { title: 'Credits', url: '#credits', depth: 2 },
        ]}
      />
    </Wrapper>
  );
}

export function steps(): ReactNode {
  return (
    <Wrapper>
      <div className="bg-fd-background rounded-xl p-3">
        <Steps>
          <Step>
            <h4>Buy Coffee</h4>
            <p>Some text here</p>
          </Step>
          <Step>
            <h4>Go to Office Some text here</h4>
            <p>Some text here</p>
          </Step>
          <Step>
            <h4>Have a meeting Some text here</h4>
            <p>Some text here</p>
          </Step>
        </Steps>
      </div>
    </Wrapper>
  );
}

export function rootToggle(): ReactNode {
  return (
    <Wrapper>
      <div className="not-prose bg-fd-background mx-auto grid max-w-[240px] rounded-lg">
        <RootToggle
          className="p-3"
          options={[
            {
              title: 'Hello World',
              description: 'The example item of root toggle',
              url: '/docs/ui',
            },
            {
              title: 'Other page',
              description: 'The example item of root toggle',
              url: '/docs/headless',
            },
          ]}
        />
      </div>
    </Wrapper>
  );
}

export function dynamicCodeBlock() {
  return (
    <Wrapper>
      <DynamicCodeBlock />
    </Wrapper>
  );
}

export function banner(): ReactNode {
  return (
    <Wrapper>
      <div className="flex flex-col gap-4">
        <Banner className="z-0" changeLayout={false}>
          Be careful, Fumadocs v99 has released
        </Banner>

        <Banner
          id="test-rainbow"
          className="z-0"
          variant="rainbow"
          changeLayout={false}
        >
          Using the <code>rainbow</code> variant
        </Banner>

        <Banner
          id="test"
          className="z-0"
          variant="rainbow"
          rainbowColors={[
            'rgba(255,100,0, 0.5)',
            'rgba(255,100,0, 0.5)',
            'transparent',
            'rgba(255,100,0, 0.5)',
            'transparent',
            'rgba(255,100,0, 0.5)',
            'transparent',
          ]}
          changeLayout={false}
        >
          customise the <code>rainbow</code> variant
        </Banner>
      </div>
    </Wrapper>
  );
}

export function githubInfo() {
  return (
    <Wrapper>
      <GithubInfo
        owner={owner}
        repo={repo}
        token={process.env.GITHUB_TOKEN}
        className="not-prose bg-fd-card"
      />
    </Wrapper>
  );
}
