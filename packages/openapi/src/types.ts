import type { OpenAPIV3_1 as BaseOpenAPIV3_1 } from 'openapi-types';

/** @public */
export type Replace<TTarget, TReplaceWith> = Omit<TTarget, keyof TReplaceWith> &
  TReplaceWith;

/** @public */
export type SchemaType =
  | 'array'
  | 'boolean'
  | 'integer'
  | 'null'
  | 'number'
  | 'object'
  | 'string';

/** @public */
export type PrimitiveSchemaType = SchemaType;

/** @public */
export type HttpMethods = BaseOpenAPIV3_1.HttpMethods;
/** @public */
export type ReferenceObject = BaseOpenAPIV3_1.ReferenceObject;
/** @public */
export type ExampleObject = BaseOpenAPIV3_1.ExampleObject;
/** @public */
export type DiscriminatorObject = BaseOpenAPIV3_1.DiscriminatorObject;
/** @public */
export type ExternalDocumentationObject =
  BaseOpenAPIV3_1.ExternalDocumentationObject;
/** @public */
export type XMLObject = BaseOpenAPIV3_1.XMLObject;
/** @public */
export type LinkObject = BaseOpenAPIV3_1.LinkObject;
/** @public */
export type SecuritySchemeObject = BaseOpenAPIV3_1.SecuritySchemeObject;
/** @public */
export type ServerObject = BaseOpenAPIV3_1.ServerObject;

/** @public */
export type SchemaObject = Replace<
  BaseOpenAPIV3_1.BaseSchemaObject,
  {
    $ref?: string;
    $defs?: Record<string, SchemaObject>;
    $schema?: string;
    type?: string | string[];
    properties?: Record<string, SchemaObject>;
    required?: string[];
    items?: SchemaObject | false;
    prefixItems?: SchemaObject[];
    const?: string | number | boolean | null;
    enum?: (string | number | boolean | null)[];
    oneOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    allOf?: SchemaObject[];
    not?: SchemaObject;
    additionalProperties?: boolean | SchemaObject;
    discriminator?: DiscriminatorObject;
    externalDocs?: ExternalDocumentationObject;
    xml?: XMLObject;
    contentMediaType?: string;
    exclusiveMinimum?: boolean | number;
    exclusiveMaximum?: boolean | number;
  }
>;

/** @public */
export type SchemaLike = SchemaObject;

/** @public */
export interface ArraySchemaObject extends SchemaObject {
  type: 'array';
  items: SchemaObject | false;
}

/** @public */
export type MediaTypeObject = Replace<
  BaseOpenAPIV3_1.MediaTypeObject,
  {
    schema?: SchemaObject | ReferenceObject;
    examples?: Record<string, ReferenceObject | ExampleObject>;
  }
>;

/** @public */
export interface ParameterBaseObject extends Replace<
  BaseOpenAPIV3_1.ParameterBaseObject,
  {
    schema?: SchemaObject | ReferenceObject;
    examples?: Record<string, ReferenceObject | ExampleObject>;
    content?: Record<string, MediaTypeObject>;
  }
> {}

/** @public */
export interface ParameterObject extends ParameterBaseObject {
  name: string;
  in: string;
}

/** @public */
export type HeaderObject = ParameterBaseObject;

/** @public */
export type RequestBodyObject = Replace<
  BaseOpenAPIV3_1.RequestBodyObject,
  {
    content: Record<string, MediaTypeObject>;
  }
>;

/** @public */
export type ResponseObject = Replace<
  BaseOpenAPIV3_1.ResponseObject,
  {
    headers?: Record<string, ReferenceObject | HeaderObject>;
    content?: Record<string, MediaTypeObject>;
    links?: Record<string, ReferenceObject | LinkObject>;
  }
>;

/** @public */
export type ResponsesObject = Record<string, ReferenceObject | ResponseObject>;

/** @public */
export type OperationObject<T extends {} = {}> = Replace<
  BaseOpenAPIV3_1.OperationObject<T>,
  {
    parameters?: (ReferenceObject | ParameterObject)[];
    requestBody?: ReferenceObject | RequestBodyObject;
    responses?: ResponsesObject;
    callbacks?: Record<string, ReferenceObject | CallbackObject>;
  }
> &
  T;

/** @public */
export type PathItemObject<T extends {} = {}> = Replace<
  BaseOpenAPIV3_1.PathItemObject<T>,
  {
    parameters?: (ReferenceObject | ParameterObject)[];
  }
> & {
  [method in HttpMethods]?: OperationObject<T>;
};

/** @public */
export type PathsObject<T extends {} = {}, TPath extends {} = {}> = Record<
  string,
  (PathItemObject<T> & TPath) | undefined
>;

/** @public */
export type CallbackObject = Record<string, PathItemObject | ReferenceObject>;

/** @public */
export type ComponentsObject = Replace<
  BaseOpenAPIV3_1.ComponentsObject,
  {
    schemas?: Record<string, SchemaObject>;
    responses?: Record<string, ReferenceObject | ResponseObject>;
    parameters?: Record<string, ReferenceObject | ParameterObject>;
    requestBodies?: Record<string, ReferenceObject | RequestBodyObject>;
    headers?: Record<string, ReferenceObject | HeaderObject>;
    links?: Record<string, ReferenceObject | LinkObject>;
    callbacks?: Record<string, ReferenceObject | CallbackObject>;
    pathItems?: Record<string, ReferenceObject | PathItemObject>;
  }
>;

/** @public */
export type Document<T extends {} = {}> = Replace<
  BaseOpenAPIV3_1.Document<T>,
  {
    paths?: PathsObject<T>;
    components?: ComponentsObject;
  }
>;
