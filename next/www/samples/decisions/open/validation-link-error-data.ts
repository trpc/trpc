/**
 * The API `.agent-docs/open/validation-link-error-data.md` proposes, as
 * types: B and C decode declared errors' `data` under `output: 'json'`, so
 * their types keep the schemas' types there too, not only in the outputs
 * the link decodes. Declaring danSON's form approximates that for the
 * examples, which only call decoded procedures. A is the link as it is.
 */
import type { TrpcLink, ValidationLinkOptions } from '@trpc12/trpc/client';
import type { DansonForm } from '@trpc12/trpc/serializer';

type DecodingLink = TrpcLink<{
  form: DansonForm;
  builtinErrors: 'BAD_RESPONSE';
}>;

/** B: decodes declared errors' `data` and rebuilds their classes. */
export declare function experimental_validationLinkB(
  opts: ValidationLinkOptions,
): DecodingLink;

/** C: decodes declared errors' `data`, without rebuilding classes. */
export declare function experimental_validationLinkC(
  opts: ValidationLinkOptions,
): DecodingLink;
