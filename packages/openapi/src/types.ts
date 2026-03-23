import type { OpenAPIV3_1 as BaseOpenAPIV3_1 } from 'openapi-types';

export type Replace<TTarget, TReplaceWith> = Omit<TTarget, keyof TReplaceWith> &
  TReplaceWith;

export type PrimitiveSchemaType =
  | 'array'
  | 'boolean'
  | 'integer'
  | 'null'
  | 'number'
  | 'object'
  | 'string';

export type HttpMethods = BaseOpenAPIV3_1.HttpMethods;
export type ReferenceObject = BaseOpenAPIV3_1.ReferenceObject;
export type ExampleObject = BaseOpenAPIV3_1.ExampleObject;
export type DiscriminatorObject = BaseOpenAPIV3_1.DiscriminatorObject;
export type ExternalDocumentationObject =
  BaseOpenAPIV3_1.ExternalDocumentationObject;
export type XMLObject = BaseOpenAPIV3_1.XMLObject;
export type LinkObject = BaseOpenAPIV3_1.LinkObject;
export type SecuritySchemeObject = BaseOpenAPIV3_1.SecuritySchemeObject;

export type SchemaObject = Replace<
  Omit<
    BaseOpenAPIV3_1.BaseSchemaObject,
    | 'additionalProperties'
    | 'allOf'
    | 'anyOf'
    | 'discriminator'
    | 'example'
    | 'externalDocs'
    | 'not'
    | 'oneOf'
    | 'properties'
    | 'xml'
  >,
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
    examples?: BaseOpenAPIV3_1.BaseSchemaObject['example'][];
    contentMediaType?: string;
    exclusiveMinimum?: boolean | number;
    exclusiveMaximum?: boolean | number;
  }
>;

export type SchemaLike = SchemaObject;

export interface ArraySchemaObject extends SchemaObject {
  type: 'array';
  items: SchemaObject | false;
}

export type MediaTypeObject = Replace<
  BaseOpenAPIV3_1.MediaTypeObject,
  {
    schema?: SchemaObject | ReferenceObject;
    examples?: Record<string, ReferenceObject | ExampleObject>;
  }
>;

export interface ParameterBaseObject
  extends Replace<
    BaseOpenAPIV3_1.ParameterBaseObject,
    {
      schema?: SchemaObject | ReferenceObject;
      examples?: Record<string, ReferenceObject | ExampleObject>;
      content?: Record<string, MediaTypeObject>;
    }
  > {}

export interface ParameterObject extends ParameterBaseObject {
  name: string;
  in: string;
}

export type HeaderObject = ParameterBaseObject;

export type RequestBodyObject = Replace<
  BaseOpenAPIV3_1.RequestBodyObject,
  {
    content: Record<string, MediaTypeObject>;
  }
>;

export type ResponseObject = Replace<
  BaseOpenAPIV3_1.ResponseObject,
  {
    headers?: Record<string, ReferenceObject | HeaderObject>;
    content?: Record<string, MediaTypeObject>;
    links?: Record<string, ReferenceObject | LinkObject>;
  }
>;

export type ResponsesObject = Record<string, ReferenceObject | ResponseObject>;

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

export type PathItemObject<T extends {} = {}> = Replace<
  Omit<BaseOpenAPIV3_1.PathItemObject<T>, HttpMethods>,
  {
    parameters?: (ReferenceObject | ParameterObject)[];
  }
> & {
  [method in HttpMethods]?: OperationObject<T>;
};

export type PathsObject<T extends {} = {}, TPath extends {} = {}> = Record<
  string,
  (PathItemObject<T> & TPath) | undefined
>;

export type CallbackObject = Record<string, PathItemObject | ReferenceObject>;

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

export type Document<T extends {} = {}> = Replace<
  BaseOpenAPIV3_1.Document<T>,
  {
    paths?: PathsObject<T>;
    components?: ComponentsObject;
  }
>;
