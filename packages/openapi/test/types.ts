/* eslint-disable max-params */
import type {
  ArraySchemaObject,
  Document,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from '../src/types';

export type HttpMethod =
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'trace';

export type SchemaOrRef = SchemaObject | ReferenceObject;

export function isRef(value: unknown): value is ReferenceObject {
  return !!value && typeof value === 'object' && '$ref' in value;
}

export function isArraySchema(
  schema: SchemaObject,
): schema is ArraySchemaObject {
  return schema.type === 'array';
}

export function getPropertySchema(
  schema: SchemaObject,
  propertyName: string,
): SchemaObject | undefined {
  return schema.properties?.[propertyName];
}

export function requirePropertySchema(
  schema: SchemaObject,
  propertyName: string,
): SchemaObject {
  const propertySchema = getPropertySchema(schema, propertyName);
  if (!propertySchema) {
    throw new Error(`Expected property schema for "${propertyName}"`);
  }
  return propertySchema;
}

export function getArrayItemsSchema(
  schema: SchemaObject,
): SchemaObject | undefined {
  const items = schema.items;
  if (!isArraySchema(schema) || items == null || items === false) {
    return undefined;
  }
  return items;
}

export function requireArrayItemsSchema(schema: SchemaObject): SchemaObject {
  const itemsSchema = getArrayItemsSchema(schema);
  if (!itemsSchema) {
    throw new Error('Expected array items schema');
  }
  return itemsSchema;
}

export function getSchemas(doc: Document): Record<string, SchemaOrRef> {
  return doc.components?.schemas ?? {};
}

export function getSchema(
  doc: Document,
  name: string,
): SchemaObject | undefined {
  const schema = getSchemas(doc)[name];
  if (!schema || isRef(schema)) {
    return undefined;
  }
  return schema;
}

export function requireSchema(doc: Document, name: string): SchemaObject {
  const schema = getSchema(doc, name);
  if (!schema) {
    throw new Error(`Expected SchemaObject for "${name}"`);
  }
  return schema;
}

export function getOperation(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
): OperationObject | undefined {
  const pathItem = doc.paths?.[`/${procPath}`];
  return pathItem?.[method];
}

export function requireOperation(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
): OperationObject {
  const operation = getOperation(doc, procPath, method);
  if (!operation) {
    throw new Error(`Expected ${method.toUpperCase()} /${procPath}`);
  }
  return operation;
}

export function getParameter(
  doc: Document,
  procPath: string,
  index = 0,
  method: HttpMethod = 'get',
): ParameterObject | undefined {
  const parameter = getOperation(doc, procPath, method)?.parameters?.[index];
  if (!parameter || isRef(parameter)) {
    return undefined;
  }
  return parameter;
}

export function getRequestBody(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'post',
): RequestBodyObject | undefined {
  const requestBody = getOperation(doc, procPath, method)?.requestBody;
  if (!requestBody || isRef(requestBody)) {
    return undefined;
  }
  return requestBody;
}

export function getResponse(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): ResponseObject | undefined {
  const response = getOperation(doc, procPath, method)?.responses?.[status];
  if (!response || isRef(response)) {
    return undefined;
  }
  return response;
}

export function getResponseSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaOrRef | undefined {
  return getResponse(doc, procPath, method, status)?.content?.[
    'application/json'
  ]?.schema;
}

export function requireResponseSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaOrRef {
  const schema = getResponseSchema(doc, procPath, method, status);
  if (!schema) {
    throw new Error(
      `Expected application/json response schema for ${method.toUpperCase()} /${procPath}`,
    );
  }
  return schema;
}

export function getInputSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
): SchemaOrRef | undefined {
  const requestBody = getRequestBody(doc, procPath, method);
  if (requestBody) {
    return requestBody.content?.['application/json']?.schema;
  }

  const parameter = getParameter(doc, procPath, 0, method);
  return parameter?.content?.['application/json']?.schema;
}

export function requireInputSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
): SchemaOrRef {
  const schema = getInputSchema(doc, procPath, method);
  if (!schema) {
    throw new Error(
      `Expected input schema for ${method.toUpperCase()} /${procPath}`,
    );
  }
  return schema;
}

export function resolveSchema(
  schema: SchemaOrRef,
  doc: Document,
): SchemaObject | undefined {
  if (!isRef(schema)) {
    return schema;
  }

  const name = schema.$ref.replace('#/components/schemas/', '');
  return getSchema(doc, name);
}

export function requireSchemaObject(
  schema: SchemaOrRef | undefined,
  doc: Document,
  label = 'schema',
): SchemaObject {
  const resolved = schema ? resolveSchema(schema, doc) : undefined;
  if (!resolved) {
    throw new Error(`Expected SchemaObject for ${label}`);
  }
  return resolved;
}

export function getEnvelopeDataSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaOrRef | undefined {
  const responseSchema = getResponseSchema(doc, procPath, method, status);
  const envelope = responseSchema
    ? requireSchemaObject(responseSchema, doc, `${procPath} response`)
    : undefined;
  const result = envelope?.properties?.['result'];
  const resultSchema = result
    ? requireSchemaObject(result, doc, `${procPath} result`)
    : undefined;
  return resultSchema?.properties?.['data'];
}

export function requireEnvelopeDataSchema(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaOrRef {
  const schema = getEnvelopeDataSchema(doc, procPath, method, status);
  if (!schema) {
    throw new Error(
      `Expected result.data schema for ${method.toUpperCase()} /${procPath}`,
    );
  }
  return schema;
}

export function getOutputData(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaObject | undefined {
  const data = getEnvelopeDataSchema(doc, procPath, method, status);
  return data ? resolveSchema(data, doc) : undefined;
}

export function requireOutputData(
  doc: Document,
  procPath: string,
  method: HttpMethod = 'get',
  status = '200',
): SchemaObject {
  const schema = getOutputData(doc, procPath, method, status);
  if (!schema) {
    throw new Error(
      `Expected output data schema for ${method.toUpperCase()} /${procPath}`,
    );
  }
  return schema;
}

export function getResponseComponent(
  doc: Document,
  name: string,
): ResponseObject | undefined {
  const response = doc.components?.responses?.[name];
  if (!response || isRef(response)) {
    return undefined;
  }
  return response;
}

export function getResponseComponentSchema(
  doc: Document,
  name: string,
): SchemaOrRef | undefined {
  return getResponseComponent(doc, name)?.content?.['application/json']?.schema;
}

export function requireResponseComponentSchema(
  doc: Document,
  name: string,
): SchemaOrRef {
  const schema = getResponseComponentSchema(doc, name);
  if (!schema) {
    throw new Error(
      `Expected application/json schema for response component "${name}"`,
    );
  }
  return schema;
}

export function getProperty(
  schema: SchemaObject,
  key: string,
): SchemaOrRef | undefined {
  return schema.properties?.[key];
}

export function requireProperty(
  schema: SchemaObject,
  key: string,
): SchemaOrRef {
  const property = getProperty(schema, key);
  if (!property) {
    throw new Error(`Expected property "${key}"`);
  }
  return property;
}
