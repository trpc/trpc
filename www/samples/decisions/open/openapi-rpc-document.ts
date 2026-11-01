/**
 * The APIs `.agent-docs/open/openapi-rpc-document.md` proposes, as types:
 * `experimental_generateOpenApi` without `target`, documenting only the REST
 * routes (B) or only the RPC endpoint (C). A is the generator as it is.
 */
import type {
  GenerateOpenApiOptions,
  OpenApiDocument,
} from '@trpc12/trpc/openapi';

/** B: always documents the REST routes `experimental_createOpenApiHandler` serves. */
export declare function experimental_generateOpenApiB(
  router: object,
  opts: Omit<GenerateOpenApiOptions, 'target'>,
): OpenApiDocument;

/** C: always documents the RPC endpoint of `createFetchHandler`. */
export declare function experimental_generateOpenApiC(
  router: object,
  opts: Omit<GenerateOpenApiOptions, 'target'>,
): OpenApiDocument;
