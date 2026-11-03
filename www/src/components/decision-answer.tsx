import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Check, Copy, MessageSquareReply, Star } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@shared/ui/components/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@shared/ui/components/field';
import { Kbd, KbdGroup } from '@shared/ui/components/kbd';
import { RadioGroup, RadioGroupItem } from '@shared/ui/components/radio-group';
import { Textarea } from '@shared/ui/components/textarea';
import { cn } from '@shared/ui/lib/utils';
import { TextWithCode } from '~/components/text-with-code.tsx';
import {
  decisionAnswerMessage,
  skipMeaning,
} from '~/content/decision-answer.ts';
import {
  answeredQuestions,
  optionParam,
  shownOption,
} from '~/content/decision-search.ts';
import type { OpenQuestion } from '~/content/decision-types.ts';
import { decisions, site } from '~/site.ts';

type CopyStatus = 'idle' | 'copied' | 'failed';

const noteLimit = 500;

/**
 * Picks an answer (the shown option, so the recommended one by default, or
 * `skip`) and copies a message about it to paste into the decision round's
 * chat. The pick lives in the URL with the shown option; the note is a draft.
 */
export function AnswerPanel(props: { readonly question: OpenQuestion }) {
  const question = props.question;
  const search = useSearch({ from: '/v12/decisions/open/$slug' });
  const navigate = useNavigate({ from: '/v12/decisions/open/$slug' });
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<CopyStatus>('idle');
  const preview = useRef<HTMLPreElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  useEffect(() => () => clearTimeout(reset.current), []);

  const answer =
    search.skip === true
      ? 'skip'
      : shownOption(
          search.option,
          question.options.map((option) => option.id),
          question.recommended,
        );
  const questionIds = answeredQuestions(search.question, question.questions);
  const message = decisionAnswerMessage({
    answer,
    note,
    question,
    questionIds,
    url: `${site.url}${decisions.basePath}/open/${question.slug}`,
  });

  const copy = () => {
    clearTimeout(reset.current);
    let written: Promise<void>;
    try {
      // Called in the click or key press, which Safari requires.
      written = navigator.clipboard.writeText(message);
    } catch (error) {
      // No clipboard outside a secure context.
      written = Promise.reject(error);
    }
    void written.then(
      () => {
        setStatus('copied');
        reset.current = setTimeout(() => setStatus('idle'), 2500);
      },
      () => {
        setStatus('failed');
        // Selected, it's one Ctrl+C away.
        if (preview.current) {
          window.getSelection()?.selectAllChildren(preview.current);
        }
      },
    );
  };

  const pick = (value: string) => {
    setStatus('idle');
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        option:
          value === 'skip'
            ? prev.option
            : optionParam(value, question.recommended),
        skip: value === 'skip' || undefined,
      }),
      to: '.',
    });
  };

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-4 rounded-xl border p-4 sm:p-5"
      id="answer"
    >
      <div className="grid gap-1">
        <h2
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          id={`${id}-heading`}
        >
          <MessageSquareReply className="size-4 text-muted-foreground" />
          Answer it
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Pick an answer, add a note if you like, and copy a message to paste
          into the decision round's chat. It names the question, its file and
          this page, so the agent can act on it as it is.
        </p>
      </div>

      {question.questions.length > 1 ? (
        <nav
          aria-label="Which question the answer is for"
          className="flex flex-wrap items-center gap-1"
        >
          <span className="mr-1 text-sm text-muted-foreground">For</span>
          {[undefined, ...question.questions].map((questionId) => {
            const chosen =
              questionId === undefined
                ? questionIds.length === question.questions.length
                : questionIds.length === 1 && questionIds[0] === questionId;
            return (
              <Link
                activeOptions={{ exact: true, includeSearch: true }}
                aria-current={chosen ? 'true' : undefined}
                className="inline-flex h-7 shrink-0 items-center rounded-md border border-input px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors hover:bg-muted data-chosen:border-foreground/40 data-chosen:bg-muted"
                data-chosen={chosen || undefined}
                from="/v12/decisions/open/$slug"
                key={questionId ?? 'all'}
                onClick={() => setStatus('idle')}
                replace
                resetScroll={false}
                search={(prev) => ({
                  ...prev,
                  question: questionId?.toLowerCase(),
                })}
                to="."
              >
                {questionId ?? `All ${question.questions.length}`}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <RadioGroup
        aria-labelledby={`${id}-heading`}
        className="grid gap-2 sm:grid-cols-2"
        onValueChange={(value) => pick(String(value))}
        value={answer}
      >
        {question.options.map((option) => (
          <FieldLabel htmlFor={`${id}-${option.id}`} key={option.id}>
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
              <FieldContent>
                <FieldTitle className="flex-wrap">
                  <span className="font-mono">{option.id})</span>
                  <TextWithCode text={option.title} />
                  {option.id === question.recommended ? (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-700 dark:text-amber-300">
                      <Star className="size-3 fill-current" />
                      Recommended
                    </span>
                  ) : null}
                </FieldTitle>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
        <FieldLabel htmlFor={`${id}-skip`}>
          <Field orientation="horizontal">
            <RadioGroupItem id={`${id}-skip`} value="skip" />
            <FieldContent>
              <FieldTitle>Skip</FieldTitle>
              <FieldDescription>{skipMeaning}</FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
      </RadioGroup>

      <Field>
        <FieldLabel htmlFor={`${id}-note`}>
          Note{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          aria-describedby={`${id}-note-hint`}
          id={`${id}-note`}
          maxLength={noteLimit}
          onChange={(event) => {
            setStatus('idle');
            setNote(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              copy();
            }
          }}
          placeholder="A condition, a doubt, or what to do instead"
          rows={2}
          value={note}
        />
        <FieldDescription id={`${id}-note-hint`}>
          Quoted in the message. Copy from here with{' '}
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>{' '}
          (<Kbd>⌘</Kbd> on a Mac).
        </FieldDescription>
      </Field>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={copy}>
            {status === 'copied' ? (
              <Check data-icon="inline-start" />
            ) : (
              <Copy data-icon="inline-start" />
            )}
            {status === 'copied' ? 'Copied' : 'Copy message'}
          </Button>
          <p
            aria-live="polite"
            className={cn(
              'text-sm',
              status === 'failed'
                ? 'text-destructive'
                : 'text-emerald-700 dark:text-emerald-400',
            )}
            role="status"
          >
            {status === 'copied'
              ? 'Copied: paste it into the chat.'
              : status === 'failed'
                ? "Couldn't copy it here. The message is selected below: copy it with Ctrl+C."
                : ''}
          </p>
        </div>
        <pre
          aria-label="The message"
          className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"
          ref={preview}
        >
          {message}
        </pre>
      </div>
    </section>
  );
}
