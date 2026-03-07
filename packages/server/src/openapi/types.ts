export type OpenApiSchema = Record<string, unknown>;

export type OpenApiSchemaSerializer = (
  schema: unknown,
) => OpenApiSchema | null | undefined;

export interface OpenApiOptions {
  enabled: boolean;
  path?: string;
  schemaSerializer?: OpenApiSchemaSerializer;
}
