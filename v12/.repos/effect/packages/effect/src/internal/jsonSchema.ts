/** @internal */
export function getSubschemaKind(keyword: string): "schema" | "map" | "array" | undefined {
  switch (keyword) {
    case "$defs":
    case "properties":
    case "patternProperties":
    case "dependentSchemas":
      return "map"
    case "allOf":
    case "anyOf":
    case "oneOf":
    case "prefixItems":
      return "array"
    case "not":
    case "additionalProperties":
    case "propertyNames":
    case "unevaluatedProperties":
    case "items":
    case "contains":
    case "unevaluatedItems":
    case "if":
    case "then":
    case "else":
    case "contentSchema":
      return "schema"
  }
}
