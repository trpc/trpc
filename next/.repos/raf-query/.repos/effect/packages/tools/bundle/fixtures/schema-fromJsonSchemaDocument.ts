import * as SchemaRepresentation from "effect/SchemaRepresentation"

export const schema = SchemaRepresentation.fromJsonSchemaDocument({
  "dialect": "draft-2020-12",
  "schema": {
    "type": "object",
    "properties": {
      "a": {
        "type": "string"
      }
    }
  },
  "definitions": {}
})
