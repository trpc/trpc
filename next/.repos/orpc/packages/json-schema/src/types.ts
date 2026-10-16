// eslint-disable-next-line no-restricted-imports
import type * as OpenAPIV3_2 from '@openapi-spec/types/v3.2'

/**
 * A JSON Schema (draft 2020-12) representation used across oRPC's JSON schema tooling.
 *
 * @remarks
 * It is also the OpenAPI 3.2 Schema Object, so converted schemas embed into OpenAPI documents as-is.
 *
 * @see {@link https://orpc.dev/docs/integrations/standard-schema | Standard Schema Integration}
 */
export type JsonSchema<Value = any> = OpenAPIV3_2.SchemaObject<Value>

/**
 * The declared JSON Schema keywords, the index signature is filtered out.
 */
export type JsonSchemaKeywords = keyof {
  [K in keyof OpenAPIV3_2.SchemaObjectFields as string extends K ? never : K]: unknown
}

export enum JsonSchemaType {
  Array = 'array',
  Boolean = 'boolean',
  Integer = 'integer',
  Null = 'null',
  Number = 'number',
  Object = 'object',
  String = 'string',
}

export enum JsonSchemaFormat {
  Date = 'date',
  DateTime = 'date-time',
  Duration = 'duration',
  Email = 'email',
  Hostname = 'hostname',
  IDNEmail = 'idn-email',
  IDNHostname = 'idn-hostname',
  IPv4 = 'ipv4',
  IPv6 = 'ipv6',
  IRI = 'iri',
  IRIReference = 'iri-reference',
  JSONPointer = 'json-pointer',
  RegEx = 'regex',
  RelativeJSONPointer = 'relative-json-pointer',
  Time = 'time',
  URI = 'uri',
  URIReference = 'uri-reference',
  URITemplate = 'uri-template',
  UUID = 'uuid',
}

export enum JsonSchemaXNativeType {
  BigInt = 'bigint',
  Date = 'date',
  Url = 'url',
  Set = 'set',
  Map = 'map',
}
