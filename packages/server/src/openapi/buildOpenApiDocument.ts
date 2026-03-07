import type { AnyProcedure, AnyRouter } from '../@trpc/server';
import type { OpenApiSchema, OpenApiSchemaSerializer } from './types';

export const DEFAULT_OPENAPI_DOCS_PATH = '/openapi.json';

type OpenApiPathItem = {
  [key: string]: Record<string, unknown>;
};

function getPathFromProcedurePath(procedurePath: string): string {
  return `/${procedurePath.replaceAll('.', '/')}`;
}

function getMethodFromProcedureType(
  procedureType: AnyProcedure['_def']['type'],
): 'get' | 'post' {
  return procedureType === 'mutation' ? 'post' : 'get';
}

function serializeSchema(
  serializer: OpenApiSchemaSerializer | undefined,
  schema: unknown,
): OpenApiSchema | null {
  if (!serializer) {
    return null;
  }
  try {
    return serializer(schema) ?? null;
  } catch {
    return null;
  }
}

function buildOperation(opts: {
  procedurePath: string;
  procedure: AnyProcedure;
  schemaSerializer: OpenApiSchemaSerializer | undefined;
}) {
  const { procedure, procedurePath, schemaSerializer } = opts;
  const procedureDef = procedure._def as {
    inputs?: unknown[];
    output?: unknown;
    type: AnyProcedure['_def']['type'];
  };
  const inputSchemas =
    procedureDef.inputs
      ?.map((input) => serializeSchema(schemaSerializer, input))
      .filter((schema): schema is OpenApiSchema => schema !== null) ?? [];
  const inputSchema =
    inputSchemas.length === 0
      ? null
      : inputSchemas.length === 1
        ? inputSchemas[0]
        : ({ allOf: inputSchemas } as OpenApiSchema);
  const outputSchema = serializeSchema(schemaSerializer, procedureDef.output);

  const operation: Record<string, unknown> = {
    operationId: procedurePath,
    'x-trpc-procedure': procedurePath,
    'x-trpc-procedure-type': procedureDef.type,
    responses: {
      200: {
        description: 'Successful response',
      },
    },
  };

  const responses = operation.responses as Record<number, Record<string, unknown>>;
  if (outputSchema) {
    responses[200] = {
      ...responses[200],
      content: {
        'application/json': {
          schema: outputSchema,
        },
      },
    };
  }

  if (inputSchema && procedureDef.type === 'mutation') {
    // This prototype only maps body input for mutations.
    // Query/subscription inputs would need query parameter mapping.
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: inputSchema,
        },
      },
    };
  }

  return operation;
}

export function normalizeOpenApiDocsPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) {
    return DEFAULT_OPENAPI_DOCS_PATH;
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function buildOpenApiDocument(opts: {
  router: AnyRouter;
  schemaSerializer?: OpenApiSchemaSerializer;
  info?: {
    title?: string;
    version?: string;
  };
}) {
  const paths: Record<string, OpenApiPathItem> = {};

  for (const [procedurePath, procedure] of Object.entries(
    opts.router._def.procedures,
  )) {
    const openApiPath = getPathFromProcedurePath(procedurePath);
    const openApiMethod = getMethodFromProcedureType(procedure._def.type);

    paths[openApiPath] ??= {};
    paths[openApiPath][openApiMethod] = buildOperation({
      procedurePath,
      procedure,
      schemaSerializer: opts.schemaSerializer,
    });
  }

  return {
    openapi: '3.1.0',
    info: {
      title: opts.info?.title ?? 'tRPC API',
      version: opts.info?.version ?? '0.0.0',
    },
    paths,
  };
}
