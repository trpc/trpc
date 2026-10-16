/**
 * @stability unstable
 * @since 4.0.0
 */

import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import type { SchemaError } from "effect/Schema"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
// non-recursive definitions
export type APIError = { readonly "message": string; readonly "type": "api_error" }
export const APIError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Internal server error" }),
  "type": Schema.Literal("api_error").annotate({ "title": "Type", "default": "api_error" })
}).annotate({ "title": "APIError" })
export type AuthenticationError = { readonly "message": string; readonly "type": "authentication_error" }
export const AuthenticationError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Authentication error" }),
  "type": Schema.Literal("authentication_error").annotate({ "title": "Type", "default": "authentication_error" })
}).annotate({ "title": "AuthenticationError" })
export type Base64ImageSource = {
  readonly "data": string
  readonly "media_type": "image/jpeg" | "image/png" | "image/gif" | "image/webp"
  readonly "type": "base64"
}
export const Base64ImageSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data", "format": "byte" }),
  "media_type": Schema.Literals(["image/jpeg", "image/png", "image/gif", "image/webp"]).annotate({
    "title": "Media Type"
  }),
  "type": Schema.Literal("base64").annotate({ "title": "Type" })
}).annotate({ "title": "Base64ImageSource" })
export type Base64PDFSource = {
  readonly "data": string
  readonly "media_type": "application/pdf"
  readonly "type": "base64"
}
export const Base64PDFSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data", "format": "byte" }),
  "media_type": Schema.Literal("application/pdf").annotate({ "title": "Media Type" }),
  "type": Schema.Literal("base64").annotate({ "title": "Type" })
}).annotate({ "title": "Base64PDFSource" })
export type BashCodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
  | "output_file_too_large"
export const BashCodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded",
  "output_file_too_large"
]).annotate({ "title": "BashCodeExecutionToolResultErrorCode" })
export type BetaAPIError = { readonly "message": string; readonly "type": "api_error" }
export const BetaAPIError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Internal server error" }),
  "type": Schema.Literal("api_error").annotate({ "title": "Type", "default": "api_error" })
}).annotate({ "title": "APIError" })
export type BetaAllThinkingTurns = { readonly "type": "all" }
export const BetaAllThinkingTurns = Schema.Struct({ "type": Schema.Literal("all").annotate({ "title": "Type" }) })
  .annotate({ "title": "AllThinkingTurns" })
export type BetaAuthenticationError = { readonly "message": string; readonly "type": "authentication_error" }
export const BetaAuthenticationError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Authentication error" }),
  "type": Schema.Literal("authentication_error").annotate({ "title": "Type", "default": "authentication_error" })
}).annotate({ "title": "AuthenticationError" })
export type BetaBase64ImageSource = {
  readonly "data": string
  readonly "media_type": "image/jpeg" | "image/png" | "image/gif" | "image/webp"
  readonly "type": "base64"
}
export const BetaBase64ImageSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data", "format": "byte" }),
  "media_type": Schema.Literals(["image/jpeg", "image/png", "image/gif", "image/webp"]).annotate({
    "title": "Media Type"
  }),
  "type": Schema.Literal("base64").annotate({ "title": "Type" })
}).annotate({ "title": "Base64ImageSource" })
export type BetaBase64PDFSource = {
  readonly "data": string
  readonly "media_type": "application/pdf"
  readonly "type": "base64"
}
export const BetaBase64PDFSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data", "format": "byte" }),
  "media_type": Schema.Literal("application/pdf").annotate({ "title": "Media Type" }),
  "type": Schema.Literal("base64").annotate({ "title": "Type" })
}).annotate({ "title": "Base64PDFSource" })
export type BetaBashCodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
  | "output_file_too_large"
export const BetaBashCodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded",
  "output_file_too_large"
]).annotate({ "title": "BashCodeExecutionToolResultErrorCode" })
export type BetaBillingError = { readonly "message": string; readonly "type": "billing_error" }
export const BetaBillingError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Billing error" }),
  "type": Schema.Literal("billing_error").annotate({ "title": "Type", "default": "billing_error" })
}).annotate({ "title": "BillingError" })
export type BetaBody_create_skill_v1_skills_post = {
  readonly "display_title"?: string | null
  readonly "files"?: ReadonlyArray<string> | null
}
export const BetaBody_create_skill_v1_skills_post = Schema.Struct({
  "display_title": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Display Title",
      "description":
        "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
    })
  ),
  "files": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String.annotate({ "format": "binary" })), Schema.Null]).annotate({
      "title": "Files",
      "description":
        "Files to upload for the skill.\n\nAll files must be in the same top-level directory and must include a SKILL.md file at the root of that directory."
    })
  )
}).annotate({ "title": "Body_create_skill_v1_skills_post" })
export type BetaBody_create_skill_version_v1_skills__skill_id__versions_post = {
  readonly "files"?: ReadonlyArray<string> | null
}
export const BetaBody_create_skill_version_v1_skills__skill_id__versions_post = Schema.Struct({
  "files": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String.annotate({ "format": "binary" })), Schema.Null]).annotate({
      "title": "Files",
      "description":
        "Files to upload for the skill.\n\nAll files must be in the same top-level directory and must include a SKILL.md file at the root of that directory."
    })
  )
}).annotate({ "title": "Body_create_skill_version_v1_skills__skill_id__versions_post" })
export type BetaCacheControlEphemeral = { readonly "ttl"?: "5m" | "1h"; readonly "type": "ephemeral" }
export const BetaCacheControlEphemeral = Schema.Struct({
  "ttl": Schema.optionalKey(
    Schema.Literals(["5m", "1h"]).annotate({
      "title": "Ttl",
      "description":
        "The time-to-live for the cache control breakpoint.\n\nThis may be one the following values:\n- `5m`: 5 minutes\n- `1h`: 1 hour\n\nDefaults to `5m`."
    })
  ),
  "type": Schema.Literal("ephemeral").annotate({ "title": "Type" })
}).annotate({ "title": "CacheControlEphemeral" })
export type BetaCacheCreation = {
  readonly "ephemeral_1h_input_tokens": number
  readonly "ephemeral_5m_input_tokens": number
}
export const BetaCacheCreation = Schema.Struct({
  "ephemeral_1h_input_tokens": Schema.Number.annotate({
    "title": "Ephemeral 1H Input Tokens",
    "description": "The number of input tokens used to create the 1 hour cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "ephemeral_5m_input_tokens": Schema.Number.annotate({
    "title": "Ephemeral 5M Input Tokens",
    "description": "The number of input tokens used to create the 5 minute cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "CacheCreation" })
export type BetaCanceledResult = { readonly "type": "canceled" }
export const BetaCanceledResult = Schema.Struct({
  "type": Schema.Literal("canceled").annotate({ "title": "Type", "default": "canceled" })
}).annotate({ "title": "CanceledResult" })
export type BetaCodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
export const BetaCodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded"
]).annotate({ "title": "CodeExecutionToolResultErrorCode" })
export type BetaCompactionContentBlockDelta = { readonly "content": string | null; readonly "type": "compaction_delta" }
export const BetaCompactionContentBlockDelta = Schema.Struct({
  "content": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Content" }),
  "type": Schema.Literal("compaction_delta").annotate({ "title": "Type", "default": "compaction_delta" })
}).annotate({ "title": "CompactionContentBlockDelta" })
export type BetaContentBlockStopEvent = { readonly "index": number; readonly "type": "content_block_stop" }
export const BetaContentBlockStopEvent = Schema.Struct({
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_stop").annotate({ "title": "Type", "default": "content_block_stop" })
}).annotate({ "title": "ContentBlockStopEvent" })
export type BetaContextManagementResponse = { readonly "original_input_tokens": number }
export const BetaContextManagementResponse = Schema.Struct({
  "original_input_tokens": Schema.Number.annotate({
    "title": "Original Input Tokens",
    "description": "The original token count before context management was applied"
  }).check(Schema.isInt())
}).annotate({ "title": "ContextManagementResponse" })
export type BetaCreateSkillResponse = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const BetaCreateSkillResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "CreateSkillResponse" })
export type BetaCreateSkillVersionResponse = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const BetaCreateSkillVersionResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "CreateSkillVersionResponse" })
export type BetaDeleteMessageBatchResponse = { readonly "id": string; readonly "type": "message_batch_deleted" }
export const BetaDeleteMessageBatchResponse = Schema.Struct({
  "id": Schema.String.annotate({ "title": "Id", "description": "ID of the Message Batch." }),
  "type": Schema.Literal("message_batch_deleted").annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Message Batches, this is always `\"message_batch_deleted\"`.",
    "default": "message_batch_deleted"
  })
}).annotate({ "title": "DeleteMessageBatchResponse" })
export type BetaDeleteSkillResponse = { readonly "id": string; readonly "type": string }
export const BetaDeleteSkillResponse = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Skills, this is always `\"skill_deleted\"`.",
    "default": "skill_deleted"
  })
}).annotate({ "title": "DeleteSkillResponse" })
export type BetaDeleteSkillVersionResponse = { readonly "id": string; readonly "type": string }
export const BetaDeleteSkillVersionResponse = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Skill Versions, this is always `\"skill_version_deleted\"`.",
    "default": "skill_version_deleted"
  })
}).annotate({ "title": "DeleteSkillVersionResponse" })
export type BetaDirectCaller = { readonly "type": "direct" }
export const BetaDirectCaller = Schema.Struct({ "type": Schema.Literal("direct").annotate({ "title": "Type" }) })
  .annotate({ "title": "DirectCaller", "description": "Tool invocation directly from the model." })
export type BetaEffortLevel = "low" | "medium" | "high" | "max"
export const BetaEffortLevel = Schema.Literals(["low", "medium", "high", "max"]).annotate({
  "title": "EffortLevel",
  "description": "All possible effort levels."
})
export type BetaExpiredResult = { readonly "type": "expired" }
export const BetaExpiredResult = Schema.Struct({
  "type": Schema.Literal("expired").annotate({ "title": "Type", "default": "expired" })
}).annotate({ "title": "ExpiredResult" })
export type BetaFileDeleteResponse = { readonly "id": string; readonly "type"?: "file_deleted" }
export const BetaFileDeleteResponse = Schema.Struct({
  "id": Schema.String.annotate({ "title": "Id", "description": "ID of the deleted file." }),
  "type": Schema.optionalKey(
    Schema.Literal("file_deleted").annotate({
      "title": "Type",
      "description": "Deleted object type.\n\nFor file deletion, this is always `\"file_deleted\"`.",
      "default": "file_deleted"
    })
  )
}).annotate({ "title": "FileDeleteResponse" })
export type BetaFileDocumentSource = { readonly "file_id": string; readonly "type": "file" }
export const BetaFileDocumentSource = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("file").annotate({ "title": "Type" })
}).annotate({ "title": "FileDocumentSource" })
export type BetaFileImageSource = { readonly "file_id": string; readonly "type": "file" }
export const BetaFileImageSource = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("file").annotate({ "title": "Type" })
}).annotate({ "title": "FileImageSource" })
export type BetaFileMetadataSchema = {
  readonly "created_at": string
  readonly "downloadable"?: boolean
  readonly "filename": string
  readonly "id": string
  readonly "mime_type": string
  readonly "size_bytes": number
  readonly "type": "file"
}
export const BetaFileMetadataSchema = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "RFC 3339 datetime string representing when the file was created.",
    "format": "date-time"
  }),
  "downloadable": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Downloadable",
      "description": "Whether the file can be downloaded.",
      "default": false
    })
  ),
  "filename": Schema.String.annotate({ "title": "Filename", "description": "Original filename of the uploaded file." })
    .check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "mime_type": Schema.String.annotate({ "title": "Mime Type", "description": "MIME type of the file." }).check(
    Schema.isMinLength(1)
  ).check(Schema.isMaxLength(255)),
  "size_bytes": Schema.Number.annotate({ "title": "Size Bytes", "description": "Size of the file in bytes." }).check(
    Schema.isInt()
  ).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("file").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor files, this is always `\"file\"`."
  })
}).annotate({ "title": "FileMetadataSchema" })
export type BetaGatewayTimeoutError = { readonly "message": string; readonly "type": "timeout_error" }
export const BetaGatewayTimeoutError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Request timeout" }),
  "type": Schema.Literal("timeout_error").annotate({ "title": "Type", "default": "timeout_error" })
}).annotate({ "title": "GatewayTimeoutError" })
export type BetaGetSkillResponse = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const BetaGetSkillResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "GetSkillResponse" })
export type BetaGetSkillVersionResponse = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const BetaGetSkillVersionResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "GetSkillVersionResponse" })
export type BetaInputJsonContentBlockDelta = { readonly "partial_json": string; readonly "type": "input_json_delta" }
export const BetaInputJsonContentBlockDelta = Schema.Struct({
  "partial_json": Schema.String.annotate({ "title": "Partial Json" }),
  "type": Schema.Literal("input_json_delta").annotate({ "title": "Type", "default": "input_json_delta" })
}).annotate({ "title": "InputJsonContentBlockDelta" })
export type BetaInputTokensClearAtLeast = { readonly "type": "input_tokens"; readonly "value": number }
export const BetaInputTokensClearAtLeast = Schema.Struct({
  "type": Schema.Literal("input_tokens").annotate({ "title": "Type" }),
  "value": Schema.Number.annotate({ "title": "Value" }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "InputTokensClearAtLeast" })
export type BetaInputTokensTrigger = { readonly "type": "input_tokens"; readonly "value": number }
export const BetaInputTokensTrigger = Schema.Struct({
  "type": Schema.Literal("input_tokens").annotate({ "title": "Type" }),
  "value": Schema.Number.annotate({ "title": "Value" }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1))
}).annotate({ "title": "InputTokensTrigger" })
export type BetaInvalidRequestError = { readonly "message": string; readonly "type": "invalid_request_error" }
export const BetaInvalidRequestError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Invalid request" }),
  "type": Schema.Literal("invalid_request_error").annotate({ "title": "Type", "default": "invalid_request_error" })
}).annotate({ "title": "InvalidRequestError" })
export type BetaJsonOutputFormat = {
  readonly "schema": { readonly [x: string]: Schema.Json }
  readonly "type": "json_schema"
}
export const BetaJsonOutputFormat = Schema.Struct({
  "schema": Schema.Record(Schema.String, Schema.Json).annotate({
    "title": "Schema",
    "description": "The JSON schema of the format"
  }),
  "type": Schema.Literal("json_schema").annotate({ "title": "Type" })
}).annotate({ "title": "JsonOutputFormat" })
export type BetaJsonValue = unknown
export const BetaJsonValue = Schema.Unknown
export type BetaMCPToolConfig = { readonly "defer_loading"?: boolean; readonly "enabled"?: boolean }
export const BetaMCPToolConfig = Schema.Struct({
  "defer_loading": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Defer Loading" })),
  "enabled": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Enabled" }))
}).annotate({ "title": "MCPToolConfig", "description": "Configuration for a specific tool in an MCP toolset." })
export type BetaMessageBatch = {
  readonly "archived_at": string | null
  readonly "cancel_initiated_at": string | null
  readonly "created_at": string
  readonly "ended_at": string | null
  readonly "expires_at": string
  readonly "id": string
  readonly "processing_status": "in_progress" | "canceling" | "ended"
  readonly "request_counts": {
    readonly "canceled": number
    readonly "errored": number
    readonly "expired": number
    readonly "processing": number
    readonly "succeeded": number
  }
  readonly "results_url": string | null
  readonly "type": "message_batch"
}
export const BetaMessageBatch = Schema.Struct({
  "archived_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Archived At",
    "description":
      "RFC 3339 datetime string representing the time at which the Message Batch was archived and its results became unavailable."
  }),
  "cancel_initiated_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Cancel Initiated At",
    "description":
      "RFC 3339 datetime string representing the time at which cancellation was initiated for the Message Batch. Specified only if cancellation was initiated."
  }),
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "RFC 3339 datetime string representing the time at which the Message Batch was created.",
    "format": "date-time"
  }),
  "ended_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Ended At",
    "description":
      "RFC 3339 datetime string representing the time at which processing for the Message Batch ended. Specified only once processing ends.\n\nProcessing ends when every request in a Message Batch has either succeeded, errored, canceled, or expired."
  }),
  "expires_at": Schema.String.annotate({
    "title": "Expires At",
    "description":
      "RFC 3339 datetime string representing the time at which the Message Batch will expire and end processing, which is 24 hours after creation.",
    "format": "date-time"
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "processing_status": Schema.Literals(["in_progress", "canceling", "ended"]).annotate({
    "title": "Processing Status",
    "description": "Processing status of the Message Batch."
  }),
  "request_counts": Schema.Struct({
    "canceled": Schema.Number.annotate({
      "title": "Canceled",
      "description":
        "Number of requests in the Message Batch that have been canceled.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "errored": Schema.Number.annotate({
      "title": "Errored",
      "description":
        "Number of requests in the Message Batch that encountered an error.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "expired": Schema.Number.annotate({
      "title": "Expired",
      "description":
        "Number of requests in the Message Batch that have expired.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "processing": Schema.Number.annotate({
      "title": "Processing",
      "description": "Number of requests in the Message Batch that are processing.",
      "default": 0
    }).check(Schema.isInt()),
    "succeeded": Schema.Number.annotate({
      "title": "Succeeded",
      "description":
        "Number of requests in the Message Batch that have completed successfully.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt())
  }).annotate({
    "title": "RequestCounts",
    "description":
      "Tallies requests within the Message Batch, categorized by their status.\n\nRequests start as `processing` and move to one of the other statuses only once processing of the entire batch ends. The sum of all values always matches the total number of requests in the batch."
  }),
  "results_url": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Results Url",
    "description":
      "URL to a `.jsonl` file containing the results of the Message Batch requests. Specified only once processing ends.\n\nResults in the file are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests."
  }),
  "type": Schema.Literal("message_batch").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Message Batches, this is always `\"message_batch\"`.",
    "default": "message_batch"
  })
}).annotate({ "title": "MessageBatch" })
export type BetaMessageStopEvent = { readonly "type": "message_stop" }
export const BetaMessageStopEvent = Schema.Struct({
  "type": Schema.Literal("message_stop").annotate({ "title": "Type", "default": "message_stop" })
}).annotate({ "title": "MessageStopEvent" })
export type BetaModelInfo = {
  readonly "created_at": string
  readonly "display_name": string
  readonly "id": string
  readonly "type": "model"
}
export const BetaModelInfo = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description":
      "RFC 3339 datetime string representing the time at which the model was released. May be set to an epoch value if the release date is unknown.",
    "format": "date-time"
  }),
  "display_name": Schema.String.annotate({
    "title": "Display Name",
    "description": "A human-readable name for the model."
  }),
  "id": Schema.String.annotate({ "title": "Id", "description": "Unique model identifier." }),
  "type": Schema.Literal("model").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Models, this is always `\"model\"`.",
    "default": "model"
  })
}).annotate({ "title": "ModelInfo" })
export type BetaNotFoundError = { readonly "message": string; readonly "type": "not_found_error" }
export const BetaNotFoundError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Not found" }),
  "type": Schema.Literal("not_found_error").annotate({ "title": "Type", "default": "not_found_error" })
}).annotate({ "title": "NotFoundError" })
export type BetaOverloadedError = { readonly "message": string; readonly "type": "overloaded_error" }
export const BetaOverloadedError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Overloaded" }),
  "type": Schema.Literal("overloaded_error").annotate({ "title": "Type", "default": "overloaded_error" })
}).annotate({ "title": "OverloadedError" })
export type BetaPermissionError = { readonly "message": string; readonly "type": "permission_error" }
export const BetaPermissionError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Permission denied" }),
  "type": Schema.Literal("permission_error").annotate({ "title": "Type", "default": "permission_error" })
}).annotate({ "title": "PermissionError" })
export type BetaPlainTextSource = {
  readonly "data": string
  readonly "media_type": "text/plain"
  readonly "type": "text"
}
export const BetaPlainTextSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data" }),
  "media_type": Schema.Literal("text/plain").annotate({ "title": "Media Type" }),
  "type": Schema.Literal("text").annotate({ "title": "Type" })
}).annotate({ "title": "PlainTextSource" })
export type BetaRateLimitError = { readonly "message": string; readonly "type": "rate_limit_error" }
export const BetaRateLimitError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Rate limited" }),
  "type": Schema.Literal("rate_limit_error").annotate({ "title": "Type", "default": "rate_limit_error" })
}).annotate({ "title": "RateLimitError" })
export type BetaRequestBashCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "bash_code_execution_output"
}
export const BetaRequestBashCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("bash_code_execution_output").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionOutputBlock" })
export type BetaRequestCharLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_char_index": number
  readonly "start_char_index": number
  readonly "type": "char_location"
}
export const BetaRequestCharLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_char_index": Schema.Number.annotate({ "title": "End Char Index" }).check(Schema.isInt()),
  "start_char_index": Schema.Number.annotate({ "title": "Start Char Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("char_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCharLocationCitation" })
export type BetaRequestCitationsConfig = { readonly "enabled"?: boolean }
export const BetaRequestCitationsConfig = Schema.Struct({
  "enabled": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Enabled" }))
}).annotate({ "title": "RequestCitationsConfig" })
export type BetaRequestCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "code_execution_output"
}
export const BetaRequestCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("code_execution_output").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionOutputBlock" })
export type BetaRequestContentBlockLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_block_index": number
  readonly "start_block_index": number
  readonly "type": "content_block_location"
}
export const BetaRequestContentBlockLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("content_block_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestContentBlockLocationCitation" })
export type BetaRequestMCPServerToolConfiguration = {
  readonly "allowed_tools"?: ReadonlyArray<string> | null
  readonly "enabled"?: boolean | null
}
export const BetaRequestMCPServerToolConfiguration = Schema.Struct({
  "allowed_tools": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Allowed Tools" })
  ),
  "enabled": Schema.optionalKey(Schema.Union([Schema.Boolean, Schema.Null]).annotate({ "title": "Enabled" }))
}).annotate({ "title": "RequestMCPServerToolConfiguration" })
export type BetaRequestPageLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_page_number": number
  readonly "start_page_number": number
  readonly "type": "page_location"
}
export const BetaRequestPageLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_page_number": Schema.Number.annotate({ "title": "End Page Number" }).check(Schema.isInt()),
  "start_page_number": Schema.Number.annotate({ "title": "Start Page Number" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(1)
  ),
  "type": Schema.Literal("page_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestPageLocationCitation" })
export type BetaRequestSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "end_block_index": number
  readonly "search_result_index": number
  readonly "source": string
  readonly "start_block_index": number
  readonly "title": string | null
  readonly "type": "search_result_location"
}
export const BetaRequestSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "search_result_index": Schema.Number.annotate({ "title": "Search Result Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "source": Schema.String.annotate({ "title": "Source" }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestSearchResultLocationCitation" })
export type BetaRequestTextEditorCodeExecutionCreateResultBlock = {
  readonly "is_file_update": boolean
  readonly "type": "text_editor_code_execution_create_result"
}
export const BetaRequestTextEditorCodeExecutionCreateResultBlock = Schema.Struct({
  "is_file_update": Schema.Boolean.annotate({ "title": "Is File Update" }),
  "type": Schema.Literal("text_editor_code_execution_create_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionCreateResultBlock" })
export type BetaRequestTextEditorCodeExecutionStrReplaceResultBlock = {
  readonly "lines"?: ReadonlyArray<string> | null
  readonly "new_lines"?: number | null
  readonly "new_start"?: number | null
  readonly "old_lines"?: number | null
  readonly "old_start"?: number | null
  readonly "type": "text_editor_code_execution_str_replace_result"
}
export const BetaRequestTextEditorCodeExecutionStrReplaceResultBlock = Schema.Struct({
  "lines": Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Lines" })),
  "new_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "New Lines" })
  ),
  "new_start": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "New Start" })
  ),
  "old_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Old Lines" })
  ),
  "old_start": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Old Start" })
  ),
  "type": Schema.Literal("text_editor_code_execution_str_replace_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionStrReplaceResultBlock" })
export type BetaRequestTextEditorCodeExecutionViewResultBlock = {
  readonly "content": string
  readonly "file_type": "text" | "image" | "pdf"
  readonly "num_lines"?: number | null
  readonly "start_line"?: number | null
  readonly "total_lines"?: number | null
  readonly "type": "text_editor_code_execution_view_result"
}
export const BetaRequestTextEditorCodeExecutionViewResultBlock = Schema.Struct({
  "content": Schema.String.annotate({ "title": "Content" }),
  "file_type": Schema.Literals(["text", "image", "pdf"]).annotate({ "title": "File Type" }),
  "num_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Num Lines" })
  ),
  "start_line": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Start Line" })
  ),
  "total_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Total Lines" })
  ),
  "type": Schema.Literal("text_editor_code_execution_view_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionViewResultBlock" })
export type BetaRequestWebSearchResultBlock = {
  readonly "encrypted_content": string
  readonly "page_age"?: string | null
  readonly "title": string
  readonly "type": "web_search_result"
  readonly "url": string
}
export const BetaRequestWebSearchResultBlock = Schema.Struct({
  "encrypted_content": Schema.String.annotate({ "title": "Encrypted Content" }),
  "page_age": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Page Age" })),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "RequestWebSearchResultBlock" })
export type BetaRequestWebSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "encrypted_index": string
  readonly "title": string | null
  readonly "type": "web_search_result_location"
  readonly "url": string
}
export const BetaRequestWebSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "encrypted_index": Schema.String.annotate({ "title": "Encrypted Index" }),
  "title": Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(512)), Schema.Null])
    .annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result_location").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(2048))
}).annotate({ "title": "RequestWebSearchResultLocationCitation" })
export type BetaResponseBashCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "bash_code_execution_output"
}
export const BetaResponseBashCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("bash_code_execution_output").annotate({
    "title": "Type",
    "default": "bash_code_execution_output"
  })
}).annotate({ "title": "ResponseBashCodeExecutionOutputBlock" })
export type BetaResponseCharLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_char_index": number
  readonly "file_id": string | null
  readonly "start_char_index": number
  readonly "type": "char_location"
}
export const BetaResponseCharLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_char_index": Schema.Number.annotate({ "title": "End Char Index" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_char_index": Schema.Number.annotate({ "title": "Start Char Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("char_location").annotate({ "title": "Type", "default": "char_location" })
}).annotate({ "title": "ResponseCharLocationCitation" })
export type BetaResponseCitationsConfig = { readonly "enabled": boolean }
export const BetaResponseCitationsConfig = Schema.Struct({
  "enabled": Schema.Boolean.annotate({ "title": "Enabled", "default": false })
}).annotate({ "title": "ResponseCitationsConfig" })
export type BetaResponseClearThinking20251015Edit = {
  readonly "cleared_input_tokens": number
  readonly "cleared_thinking_turns": number
  readonly "type": "clear_thinking_20251015"
}
export const BetaResponseClearThinking20251015Edit = Schema.Struct({
  "cleared_input_tokens": Schema.Number.annotate({
    "title": "Cleared Input Tokens",
    "description": "Number of input tokens cleared by this edit."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "cleared_thinking_turns": Schema.Number.annotate({
    "title": "Cleared Thinking Turns",
    "description": "Number of thinking turns that were cleared."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("clear_thinking_20251015").annotate({
    "title": "Type",
    "description": "The type of context management edit applied.",
    "default": "clear_thinking_20251015"
  })
}).annotate({ "title": "ResponseClearThinking20251015Edit" })
export type BetaResponseClearToolUses20250919Edit = {
  readonly "cleared_input_tokens": number
  readonly "cleared_tool_uses": number
  readonly "type": "clear_tool_uses_20250919"
}
export const BetaResponseClearToolUses20250919Edit = Schema.Struct({
  "cleared_input_tokens": Schema.Number.annotate({
    "title": "Cleared Input Tokens",
    "description": "Number of input tokens cleared by this edit."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "cleared_tool_uses": Schema.Number.annotate({
    "title": "Cleared Tool Uses",
    "description": "Number of tool uses that were cleared."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("clear_tool_uses_20250919").annotate({
    "title": "Type",
    "description": "The type of context management edit applied.",
    "default": "clear_tool_uses_20250919"
  })
}).annotate({ "title": "ResponseClearToolUses20250919Edit" })
export type BetaResponseCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "code_execution_output"
}
export const BetaResponseCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("code_execution_output").annotate({ "title": "Type", "default": "code_execution_output" })
}).annotate({ "title": "ResponseCodeExecutionOutputBlock" })
export type BetaResponseCompactionBlock = { readonly "content": string | null; readonly "type": "compaction" }
export const BetaResponseCompactionBlock = Schema.Struct({
  "content": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Content",
    "description": "Summary of compacted content, or null if compaction failed"
  }),
  "type": Schema.Literal("compaction").annotate({ "title": "Type", "default": "compaction" })
}).annotate({
  "title": "ResponseCompactionBlock",
  "description":
    "A compaction block returned when autocompact is triggered.\n\nWhen content is None, it indicates the compaction failed to produce a valid\nsummary (e.g., malformed output from the model). Clients may round-trip\ncompaction blocks with null content; the server treats them as no-ops."
})
export type BetaResponseContainerUploadBlock = { readonly "file_id": string; readonly "type": "container_upload" }
export const BetaResponseContainerUploadBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("container_upload").annotate({ "title": "Type", "default": "container_upload" })
}).annotate({
  "title": "ResponseContainerUploadBlock",
  "description": "Response model for a file uploaded to the container."
})
export type BetaResponseContentBlockLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_block_index": number
  readonly "file_id": string | null
  readonly "start_block_index": number
  readonly "type": "content_block_location"
}
export const BetaResponseContentBlockLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("content_block_location").annotate({ "title": "Type", "default": "content_block_location" })
}).annotate({ "title": "ResponseContentBlockLocationCitation" })
export type BetaResponseMCPToolUseBlock = {
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name": string
  readonly "server_name": string
  readonly "type": "mcp_tool_use"
}
export const BetaResponseMCPToolUseBlock = Schema.Struct({
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.String.annotate({ "title": "Name", "description": "The name of the MCP tool" }),
  "server_name": Schema.String.annotate({ "title": "Server Name", "description": "The name of the MCP server" }),
  "type": Schema.Literal("mcp_tool_use").annotate({ "title": "Type", "default": "mcp_tool_use" })
}).annotate({ "title": "ResponseMCPToolUseBlock" })
export type BetaResponsePageLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_page_number": number
  readonly "file_id": string | null
  readonly "start_page_number": number
  readonly "type": "page_location"
}
export const BetaResponsePageLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_page_number": Schema.Number.annotate({ "title": "End Page Number" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_page_number": Schema.Number.annotate({ "title": "Start Page Number" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(1)
  ),
  "type": Schema.Literal("page_location").annotate({ "title": "Type", "default": "page_location" })
}).annotate({ "title": "ResponsePageLocationCitation" })
export type BetaResponseRedactedThinkingBlock = { readonly "data": string; readonly "type": "redacted_thinking" }
export const BetaResponseRedactedThinkingBlock = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data" }),
  "type": Schema.Literal("redacted_thinking").annotate({ "title": "Type", "default": "redacted_thinking" })
}).annotate({ "title": "ResponseRedactedThinkingBlock" })
export type BetaResponseSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "end_block_index": number
  readonly "search_result_index": number
  readonly "source": string
  readonly "start_block_index": number
  readonly "title": string | null
  readonly "type": "search_result_location"
}
export const BetaResponseSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "search_result_index": Schema.Number.annotate({ "title": "Search Result Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "source": Schema.String.annotate({ "title": "Source" }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result_location").annotate({ "title": "Type", "default": "search_result_location" })
}).annotate({ "title": "ResponseSearchResultLocationCitation" })
export type BetaResponseTextEditorCodeExecutionCreateResultBlock = {
  readonly "is_file_update": boolean
  readonly "type": "text_editor_code_execution_create_result"
}
export const BetaResponseTextEditorCodeExecutionCreateResultBlock = Schema.Struct({
  "is_file_update": Schema.Boolean.annotate({ "title": "Is File Update" }),
  "type": Schema.Literal("text_editor_code_execution_create_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_create_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionCreateResultBlock" })
export type BetaResponseTextEditorCodeExecutionStrReplaceResultBlock = {
  readonly "lines": ReadonlyArray<string> | null
  readonly "new_lines": number | null
  readonly "new_start": number | null
  readonly "old_lines": number | null
  readonly "old_start": number | null
  readonly "type": "text_editor_code_execution_str_replace_result"
}
export const BetaResponseTextEditorCodeExecutionStrReplaceResultBlock = Schema.Struct({
  "lines": Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Lines", "default": null }),
  "new_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "New Lines",
    "default": null
  }),
  "new_start": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "New Start",
    "default": null
  }),
  "old_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Old Lines",
    "default": null
  }),
  "old_start": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Old Start",
    "default": null
  }),
  "type": Schema.Literal("text_editor_code_execution_str_replace_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_str_replace_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionStrReplaceResultBlock" })
export type BetaResponseTextEditorCodeExecutionViewResultBlock = {
  readonly "content": string
  readonly "file_type": "text" | "image" | "pdf"
  readonly "num_lines": number | null
  readonly "start_line": number | null
  readonly "total_lines": number | null
  readonly "type": "text_editor_code_execution_view_result"
}
export const BetaResponseTextEditorCodeExecutionViewResultBlock = Schema.Struct({
  "content": Schema.String.annotate({ "title": "Content" }),
  "file_type": Schema.Literals(["text", "image", "pdf"]).annotate({ "title": "File Type" }),
  "num_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Num Lines",
    "default": null
  }),
  "start_line": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Start Line",
    "default": null
  }),
  "total_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Total Lines",
    "default": null
  }),
  "type": Schema.Literal("text_editor_code_execution_view_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_view_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionViewResultBlock" })
export type BetaResponseThinkingBlock = {
  readonly "signature": string
  readonly "thinking": string
  readonly "type": "thinking"
}
export const BetaResponseThinkingBlock = Schema.Struct({
  "signature": Schema.String.annotate({ "title": "Signature" }),
  "thinking": Schema.String.annotate({ "title": "Thinking" }),
  "type": Schema.Literal("thinking").annotate({ "title": "Type", "default": "thinking" })
}).annotate({ "title": "ResponseThinkingBlock" })
export type BetaResponseToolReferenceBlock = { readonly "tool_name": string; readonly "type": "tool_reference" }
export const BetaResponseToolReferenceBlock = Schema.Struct({
  "tool_name": Schema.String.annotate({ "title": "Tool Name" }).check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(256)
  ).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,256}$"))),
  "type": Schema.Literal("tool_reference").annotate({ "title": "Type", "default": "tool_reference" })
}).annotate({ "title": "ResponseToolReferenceBlock" })
export type BetaResponseWebSearchResultBlock = {
  readonly "encrypted_content": string
  readonly "page_age": string | null
  readonly "title": string
  readonly "type": "web_search_result"
  readonly "url": string
}
export const BetaResponseWebSearchResultBlock = Schema.Struct({
  "encrypted_content": Schema.String.annotate({ "title": "Encrypted Content" }),
  "page_age": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Page Age", "default": null }),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result").annotate({ "title": "Type", "default": "web_search_result" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "ResponseWebSearchResultBlock" })
export type BetaResponseWebSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "encrypted_index": string
  readonly "title": string | null
  readonly "type": "web_search_result_location"
  readonly "url": string
}
export const BetaResponseWebSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "encrypted_index": Schema.String.annotate({ "title": "Encrypted Index" }),
  "title": Schema.Union([Schema.String.check(Schema.isMaxLength(512)), Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result_location").annotate({
    "title": "Type",
    "default": "web_search_result_location"
  }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "ResponseWebSearchResultLocationCitation" })
export type BetaServerToolCaller = { readonly "tool_id": string; readonly "type": "code_execution_20250825" }
export const BetaServerToolCaller = Schema.Struct({
  "tool_id": Schema.String.annotate({ "title": "Tool Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_20250825").annotate({ "title": "Type" })
}).annotate({ "title": "ServerToolCaller", "description": "Tool invocation generated by a server-side tool." })
export type BetaServerToolCaller_20260120 = { readonly "tool_id": string; readonly "type": "code_execution_20260120" }
export const BetaServerToolCaller_20260120 = Schema.Struct({
  "tool_id": Schema.String.annotate({ "title": "Tool Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_20260120").annotate({ "title": "Type" })
}).annotate({ "title": "ServerToolCaller_20260120" })
export type BetaServerToolUsage = { readonly "web_fetch_requests": number; readonly "web_search_requests": number }
export const BetaServerToolUsage = Schema.Struct({
  "web_fetch_requests": Schema.Number.annotate({
    "title": "Web Fetch Requests",
    "description": "The number of web fetch tool requests.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "web_search_requests": Schema.Number.annotate({
    "title": "Web Search Requests",
    "description": "The number of web search tool requests.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "ServerToolUsage" })
export type BetaSignatureContentBlockDelta = { readonly "signature": string; readonly "type": "signature_delta" }
export const BetaSignatureContentBlockDelta = Schema.Struct({
  "signature": Schema.String.annotate({ "title": "Signature" }),
  "type": Schema.Literal("signature_delta").annotate({ "title": "Type", "default": "signature_delta" })
}).annotate({ "title": "SignatureContentBlockDelta" })
export type BetaSkill = {
  readonly "skill_id": string
  readonly "type": "anthropic" | "custom"
  readonly "version": string
}
export const BetaSkill = Schema.Struct({
  "skill_id": Schema.String.annotate({ "title": "Skill Id", "description": "Skill ID" }).check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(64)),
  "type": Schema.Literals(["anthropic", "custom"]).annotate({
    "title": "Type",
    "description": "Type of skill - either 'anthropic' (built-in) or 'custom' (user-defined)"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description": "Skill version or 'latest' for most recent version"
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(64))
}).annotate({ "title": "Skill", "description": "A skill that was loaded in a container (response model)." })
export type BetaSkillParams = {
  readonly "skill_id": string
  readonly "type": "anthropic" | "custom"
  readonly "version"?: string
}
export const BetaSkillParams = Schema.Struct({
  "skill_id": Schema.String.annotate({ "title": "Skill Id", "description": "Skill ID" }).check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(64)),
  "type": Schema.Literals(["anthropic", "custom"]).annotate({
    "title": "Type",
    "description": "Type of skill - either 'anthropic' (built-in) or 'custom' (user-defined)"
  }),
  "version": Schema.optionalKey(
    Schema.String.annotate({ "title": "Version", "description": "Skill version or 'latest' for most recent version" })
      .check(Schema.isMinLength(1)).check(Schema.isMaxLength(64))
  )
}).annotate({
  "title": "SkillParams",
  "description": "Specification for a skill to be loaded in a container (request model)."
})
export type BetaSkillVersion = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const BetaSkillVersion = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "SkillVersion" })
export type BetaSpeed = "standard" | "fast"
export const BetaSpeed = Schema.Literals(["standard", "fast"]).annotate({ "title": "Speed" })
export type BetaTextContentBlockDelta = { readonly "text": string; readonly "type": "text_delta" }
export const BetaTextContentBlockDelta = Schema.Struct({
  "text": Schema.String.annotate({ "title": "Text" }),
  "type": Schema.Literal("text_delta").annotate({ "title": "Type", "default": "text_delta" })
}).annotate({ "title": "TextContentBlockDelta" })
export type BetaTextEditorCodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
  | "file_not_found"
export const BetaTextEditorCodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded",
  "file_not_found"
]).annotate({ "title": "TextEditorCodeExecutionToolResultErrorCode" })
export type BetaThinkingConfigAdaptive = { readonly "type": "adaptive" }
export const BetaThinkingConfigAdaptive = Schema.Struct({
  "type": Schema.Literal("adaptive").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigAdaptive" })
export type BetaThinkingConfigDisabled = { readonly "type": "disabled" }
export const BetaThinkingConfigDisabled = Schema.Struct({
  "type": Schema.Literal("disabled").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigDisabled" })
export type BetaThinkingConfigEnabled = { readonly "budget_tokens": number; readonly "type": "enabled" }
export const BetaThinkingConfigEnabled = Schema.Struct({
  "budget_tokens": Schema.Number.annotate({
    "title": "Budget Tokens",
    "description":
      "Determines how many tokens Claude can use for its internal reasoning process. Larger budgets can enable more thorough analysis for complex problems, improving response quality.\n\nMust be ≥1024 and less than `max_tokens`.\n\nSee [extended thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking) for details."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1024)),
  "type": Schema.Literal("enabled").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigEnabled" })
export type BetaThinkingContentBlockDelta = { readonly "thinking": string; readonly "type": "thinking_delta" }
export const BetaThinkingContentBlockDelta = Schema.Struct({
  "thinking": Schema.String.annotate({ "title": "Thinking" }),
  "type": Schema.Literal("thinking_delta").annotate({ "title": "Type", "default": "thinking_delta" })
}).annotate({ "title": "ThinkingContentBlockDelta" })
export type BetaThinkingTurns = { readonly "type": "thinking_turns"; readonly "value": number }
export const BetaThinkingTurns = Schema.Struct({
  "type": Schema.Literal("thinking_turns").annotate({ "title": "Type" }),
  "value": Schema.Number.annotate({ "title": "Value" }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1))
}).annotate({ "title": "ThinkingTurns" })
export type BetaToolChoiceAny = { readonly "disable_parallel_tool_use"?: boolean; readonly "type": "any" }
export const BetaToolChoiceAny = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output exactly one tool use."
    })
  ),
  "type": Schema.Literal("any").annotate({ "title": "Type" })
}).annotate({ "title": "ToolChoiceAny", "description": "The model will use any available tools." })
export type BetaToolChoiceAuto = { readonly "disable_parallel_tool_use"?: boolean; readonly "type": "auto" }
export const BetaToolChoiceAuto = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output at most one tool use."
    })
  ),
  "type": Schema.Literal("auto").annotate({ "title": "Type" })
}).annotate({ "title": "ToolChoiceAuto", "description": "The model will automatically decide whether to use tools." })
export type BetaToolChoiceNone = { readonly "type": "none" }
export const BetaToolChoiceNone = Schema.Struct({ "type": Schema.Literal("none").annotate({ "title": "Type" }) })
  .annotate({ "title": "ToolChoiceNone", "description": "The model will not be allowed to use tools." })
export type BetaToolChoiceTool = {
  readonly "disable_parallel_tool_use"?: boolean
  readonly "name": string
  readonly "type": "tool"
}
export const BetaToolChoiceTool = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output exactly one tool use."
    })
  ),
  "name": Schema.String.annotate({ "title": "Name", "description": "The name of the tool to use." }),
  "type": Schema.Literal("tool").annotate({ "title": "Type" })
}).annotate({
  "title": "ToolChoiceTool",
  "description": "The model will use the specified tool with `tool_choice.name`."
})
export type BetaToolSearchToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
export const BetaToolSearchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded"
]).annotate({ "title": "ToolSearchToolResultErrorCode" })
export type BetaToolUsesKeep = { readonly "type": "tool_uses"; readonly "value": number }
export const BetaToolUsesKeep = Schema.Struct({
  "type": Schema.Literal("tool_uses").annotate({ "title": "Type" }),
  "value": Schema.Number.annotate({ "title": "Value" }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "ToolUsesKeep" })
export type BetaToolUsesTrigger = { readonly "type": "tool_uses"; readonly "value": number }
export const BetaToolUsesTrigger = Schema.Struct({
  "type": Schema.Literal("tool_uses").annotate({ "title": "Type" }),
  "value": Schema.Number.annotate({ "title": "Value" }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1))
}).annotate({ "title": "ToolUsesTrigger" })
export type BetaURLImageSource = { readonly "type": "url"; readonly "url": string }
export const BetaURLImageSource = Schema.Struct({
  "type": Schema.Literal("url").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "URLImageSource" })
export type BetaURLPDFSource = { readonly "type": "url"; readonly "url": string }
export const BetaURLPDFSource = Schema.Struct({
  "type": Schema.Literal("url").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "URLPDFSource" })
export type BetaUserLocation = {
  readonly "city"?: string | null
  readonly "country"?: string | null
  readonly "region"?: string | null
  readonly "timezone"?: string | null
  readonly "type": "approximate"
}
export const BetaUserLocation = Schema.Struct({
  "city": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "City",
      "description": "The city of the user."
    })
  ),
  "country": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(2)).check(Schema.isMaxLength(2)), Schema.Null]).annotate({
      "title": "Country",
      "description": "The two letter [ISO country code](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) of the user."
    })
  ),
  "region": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "Region",
      "description": "The region of the user."
    })
  ),
  "timezone": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "Timezone",
      "description": "The [IANA timezone](https://nodatime.org/TimeZones) of the user."
    })
  ),
  "type": Schema.Literal("approximate").annotate({ "title": "Type" })
}).annotate({ "title": "UserLocation" })
export type BetaWebFetchToolResultErrorCode =
  | "invalid_tool_input"
  | "url_too_long"
  | "url_not_allowed"
  | "url_not_accessible"
  | "unsupported_content_type"
  | "too_many_requests"
  | "max_uses_exceeded"
  | "unavailable"
export const BetaWebFetchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "url_too_long",
  "url_not_allowed",
  "url_not_accessible",
  "unsupported_content_type",
  "too_many_requests",
  "max_uses_exceeded",
  "unavailable"
]).annotate({ "title": "WebFetchToolResultErrorCode" })
export type BetaWebSearchToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "max_uses_exceeded"
  | "too_many_requests"
  | "query_too_long"
  | "request_too_large"
export const BetaWebSearchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "max_uses_exceeded",
  "too_many_requests",
  "query_too_long",
  "request_too_large"
]).annotate({ "title": "WebSearchToolResultErrorCode" })
export type Betaapi__schemas__skills__Skill = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const Betaapi__schemas__skills__Skill = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "Skill" })
export type BillingError = { readonly "message": string; readonly "type": "billing_error" }
export const BillingError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Billing error" }),
  "type": Schema.Literal("billing_error").annotate({ "title": "Type", "default": "billing_error" })
}).annotate({ "title": "BillingError" })
export type Body_create_skill_v1_skills_post = {
  readonly "display_title"?: string | null
  readonly "files"?: ReadonlyArray<string> | null
}
export const Body_create_skill_v1_skills_post = Schema.Struct({
  "display_title": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Display Title",
      "description":
        "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
    })
  ),
  "files": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String.annotate({ "format": "binary" })), Schema.Null]).annotate({
      "title": "Files",
      "description":
        "Files to upload for the skill.\n\nAll files must be in the same top-level directory and must include a SKILL.md file at the root of that directory."
    })
  )
}).annotate({ "title": "Body_create_skill_v1_skills_post" })
export type Body_create_skill_version_v1_skills__skill_id__versions_post = {
  readonly "files"?: ReadonlyArray<string> | null
}
export const Body_create_skill_version_v1_skills__skill_id__versions_post = Schema.Struct({
  "files": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String.annotate({ "format": "binary" })), Schema.Null]).annotate({
      "title": "Files",
      "description":
        "Files to upload for the skill.\n\nAll files must be in the same top-level directory and must include a SKILL.md file at the root of that directory."
    })
  )
}).annotate({ "title": "Body_create_skill_version_v1_skills__skill_id__versions_post" })
export type CacheControlEphemeral = { readonly "ttl"?: "5m" | "1h"; readonly "type": "ephemeral" }
export const CacheControlEphemeral = Schema.Struct({
  "ttl": Schema.optionalKey(
    Schema.Literals(["5m", "1h"]).annotate({
      "title": "Ttl",
      "description":
        "The time-to-live for the cache control breakpoint.\n\nThis may be one the following values:\n- `5m`: 5 minutes\n- `1h`: 1 hour\n\nDefaults to `5m`."
    })
  ),
  "type": Schema.Literal("ephemeral").annotate({ "title": "Type" })
}).annotate({ "title": "CacheControlEphemeral" })
export type CacheCreation = {
  readonly "ephemeral_1h_input_tokens": number
  readonly "ephemeral_5m_input_tokens": number
}
export const CacheCreation = Schema.Struct({
  "ephemeral_1h_input_tokens": Schema.Number.annotate({
    "title": "Ephemeral 1H Input Tokens",
    "description": "The number of input tokens used to create the 1 hour cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "ephemeral_5m_input_tokens": Schema.Number.annotate({
    "title": "Ephemeral 5M Input Tokens",
    "description": "The number of input tokens used to create the 5 minute cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "CacheCreation" })
export type CanceledResult = { readonly "type": "canceled" }
export const CanceledResult = Schema.Struct({
  "type": Schema.Literal("canceled").annotate({ "title": "Type", "default": "canceled" })
}).annotate({ "title": "CanceledResult" })
export type CodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
export const CodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded"
]).annotate({ "title": "CodeExecutionToolResultErrorCode" })
export type Container = { readonly "expires_at": string; readonly "id": string }
export const Container = Schema.Struct({
  "expires_at": Schema.String.annotate({
    "title": "Expires At",
    "description": "The time at which the container will expire.",
    "format": "date-time"
  }),
  "id": Schema.String.annotate({ "title": "Id", "description": "Identifier for the container used in this request" })
}).annotate({
  "title": "Container",
  "description": "Information about the container used in the request (for the code execution tool)"
})
export type ContentBlockStopEvent = { readonly "index": number; readonly "type": "content_block_stop" }
export const ContentBlockStopEvent = Schema.Struct({
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_stop").annotate({ "title": "Type", "default": "content_block_stop" })
}).annotate({ "title": "ContentBlockStopEvent" })
export type CountMessageTokensResponse = { readonly "input_tokens": number }
export const CountMessageTokensResponse = Schema.Struct({
  "input_tokens": Schema.Number.annotate({
    "title": "Input Tokens",
    "description": "The total number of tokens across the provided list of messages, system prompt, and tools."
  }).check(Schema.isInt())
}).annotate({ "title": "CountMessageTokensResponse" })
export type CreateSkillResponse = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const CreateSkillResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "CreateSkillResponse" })
export type CreateSkillVersionResponse = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const CreateSkillVersionResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "CreateSkillVersionResponse" })
export type DeleteMessageBatchResponse = { readonly "id": string; readonly "type": "message_batch_deleted" }
export const DeleteMessageBatchResponse = Schema.Struct({
  "id": Schema.String.annotate({ "title": "Id", "description": "ID of the Message Batch." }),
  "type": Schema.Literal("message_batch_deleted").annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Message Batches, this is always `\"message_batch_deleted\"`.",
    "default": "message_batch_deleted"
  })
}).annotate({ "title": "DeleteMessageBatchResponse" })
export type DeleteSkillResponse = { readonly "id": string; readonly "type": string }
export const DeleteSkillResponse = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Skills, this is always `\"skill_deleted\"`.",
    "default": "skill_deleted"
  })
}).annotate({ "title": "DeleteSkillResponse" })
export type DeleteSkillVersionResponse = { readonly "id": string; readonly "type": string }
export const DeleteSkillVersionResponse = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Deleted object type.\n\nFor Skill Versions, this is always `\"skill_version_deleted\"`.",
    "default": "skill_version_deleted"
  })
}).annotate({ "title": "DeleteSkillVersionResponse" })
export type DirectCaller = { readonly "type": "direct" }
export const DirectCaller = Schema.Struct({ "type": Schema.Literal("direct").annotate({ "title": "Type" }) }).annotate({
  "title": "DirectCaller",
  "description": "Tool invocation directly from the model."
})
export type EffortLevel = "low" | "medium" | "high" | "max"
export const EffortLevel = Schema.Literals(["low", "medium", "high", "max"]).annotate({
  "title": "EffortLevel",
  "description": "All possible effort levels."
})
export type ExpiredResult = { readonly "type": "expired" }
export const ExpiredResult = Schema.Struct({
  "type": Schema.Literal("expired").annotate({ "title": "Type", "default": "expired" })
}).annotate({ "title": "ExpiredResult" })
export type FileDeleteResponse = { readonly "id": string; readonly "type"?: "file_deleted" }
export const FileDeleteResponse = Schema.Struct({
  "id": Schema.String.annotate({ "title": "Id", "description": "ID of the deleted file." }),
  "type": Schema.optionalKey(
    Schema.Literal("file_deleted").annotate({
      "title": "Type",
      "description": "Deleted object type.\n\nFor file deletion, this is always `\"file_deleted\"`.",
      "default": "file_deleted"
    })
  )
}).annotate({ "title": "FileDeleteResponse" })
export type FileMetadataSchema = {
  readonly "created_at": string
  readonly "downloadable"?: boolean
  readonly "filename": string
  readonly "id": string
  readonly "mime_type": string
  readonly "size_bytes": number
  readonly "type": "file"
}
export const FileMetadataSchema = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "RFC 3339 datetime string representing when the file was created.",
    "format": "date-time"
  }),
  "downloadable": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Downloadable",
      "description": "Whether the file can be downloaded.",
      "default": false
    })
  ),
  "filename": Schema.String.annotate({ "title": "Filename", "description": "Original filename of the uploaded file." })
    .check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "mime_type": Schema.String.annotate({ "title": "Mime Type", "description": "MIME type of the file." }).check(
    Schema.isMinLength(1)
  ).check(Schema.isMaxLength(255)),
  "size_bytes": Schema.Number.annotate({ "title": "Size Bytes", "description": "Size of the file in bytes." }).check(
    Schema.isInt()
  ).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("file").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor files, this is always `\"file\"`."
  })
}).annotate({ "title": "FileMetadataSchema" })
export type GatewayTimeoutError = { readonly "message": string; readonly "type": "timeout_error" }
export const GatewayTimeoutError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Request timeout" }),
  "type": Schema.Literal("timeout_error").annotate({ "title": "Type", "default": "timeout_error" })
}).annotate({ "title": "GatewayTimeoutError" })
export type GetSkillResponse = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const GetSkillResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "GetSkillResponse" })
export type GetSkillVersionResponse = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const GetSkillVersionResponse = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "GetSkillVersionResponse" })
export type InputJsonContentBlockDelta = { readonly "partial_json": string; readonly "type": "input_json_delta" }
export const InputJsonContentBlockDelta = Schema.Struct({
  "partial_json": Schema.String.annotate({ "title": "Partial Json" }),
  "type": Schema.Literal("input_json_delta").annotate({ "title": "Type", "default": "input_json_delta" })
}).annotate({ "title": "InputJsonContentBlockDelta" })
export type InvalidRequestError = { readonly "message": string; readonly "type": "invalid_request_error" }
export const InvalidRequestError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Invalid request" }),
  "type": Schema.Literal("invalid_request_error").annotate({ "title": "Type", "default": "invalid_request_error" })
}).annotate({ "title": "InvalidRequestError" })
export type JsonOutputFormat = {
  readonly "schema": { readonly [x: string]: Schema.Json }
  readonly "type": "json_schema"
}
export const JsonOutputFormat = Schema.Struct({
  "schema": Schema.Record(Schema.String, Schema.Json).annotate({
    "title": "Schema",
    "description": "The JSON schema of the format"
  }),
  "type": Schema.Literal("json_schema").annotate({ "title": "Type" })
}).annotate({ "title": "JsonOutputFormat" })
export type JsonValue = unknown
export const JsonValue = Schema.Unknown
export type MessageBatch = {
  readonly "archived_at": string | null
  readonly "cancel_initiated_at": string | null
  readonly "created_at": string
  readonly "ended_at": string | null
  readonly "expires_at": string
  readonly "id": string
  readonly "processing_status": "in_progress" | "canceling" | "ended"
  readonly "request_counts": {
    readonly "canceled": number
    readonly "errored": number
    readonly "expired": number
    readonly "processing": number
    readonly "succeeded": number
  }
  readonly "results_url": string | null
  readonly "type": "message_batch"
}
export const MessageBatch = Schema.Struct({
  "archived_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Archived At",
    "description":
      "RFC 3339 datetime string representing the time at which the Message Batch was archived and its results became unavailable."
  }),
  "cancel_initiated_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Cancel Initiated At",
    "description":
      "RFC 3339 datetime string representing the time at which cancellation was initiated for the Message Batch. Specified only if cancellation was initiated."
  }),
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "RFC 3339 datetime string representing the time at which the Message Batch was created.",
    "format": "date-time"
  }),
  "ended_at": Schema.Union([Schema.String.annotate({ "format": "date-time" }), Schema.Null]).annotate({
    "title": "Ended At",
    "description":
      "RFC 3339 datetime string representing the time at which processing for the Message Batch ended. Specified only once processing ends.\n\nProcessing ends when every request in a Message Batch has either succeeded, errored, canceled, or expired."
  }),
  "expires_at": Schema.String.annotate({
    "title": "Expires At",
    "description":
      "RFC 3339 datetime string representing the time at which the Message Batch will expire and end processing, which is 24 hours after creation.",
    "format": "date-time"
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "processing_status": Schema.Literals(["in_progress", "canceling", "ended"]).annotate({
    "title": "Processing Status",
    "description": "Processing status of the Message Batch."
  }),
  "request_counts": Schema.Struct({
    "canceled": Schema.Number.annotate({
      "title": "Canceled",
      "description":
        "Number of requests in the Message Batch that have been canceled.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "errored": Schema.Number.annotate({
      "title": "Errored",
      "description":
        "Number of requests in the Message Batch that encountered an error.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "expired": Schema.Number.annotate({
      "title": "Expired",
      "description":
        "Number of requests in the Message Batch that have expired.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt()),
    "processing": Schema.Number.annotate({
      "title": "Processing",
      "description": "Number of requests in the Message Batch that are processing.",
      "default": 0
    }).check(Schema.isInt()),
    "succeeded": Schema.Number.annotate({
      "title": "Succeeded",
      "description":
        "Number of requests in the Message Batch that have completed successfully.\n\nThis is zero until processing of the entire Message Batch has ended.",
      "default": 0
    }).check(Schema.isInt())
  }).annotate({
    "title": "RequestCounts",
    "description":
      "Tallies requests within the Message Batch, categorized by their status.\n\nRequests start as `processing` and move to one of the other statuses only once processing of the entire batch ends. The sum of all values always matches the total number of requests in the batch."
  }),
  "results_url": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Results Url",
    "description":
      "URL to a `.jsonl` file containing the results of the Message Batch requests. Specified only once processing ends.\n\nResults in the file are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests."
  }),
  "type": Schema.Literal("message_batch").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Message Batches, this is always `\"message_batch\"`.",
    "default": "message_batch"
  })
}).annotate({ "title": "MessageBatch" })
export type MessageStopEvent = { readonly "type": "message_stop" }
export const MessageStopEvent = Schema.Struct({
  "type": Schema.Literal("message_stop").annotate({ "title": "Type", "default": "message_stop" })
}).annotate({ "title": "MessageStopEvent" })
export type ModelInfo = {
  readonly "created_at": string
  readonly "display_name": string
  readonly "id": string
  readonly "type": "model"
}
export const ModelInfo = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description":
      "RFC 3339 datetime string representing the time at which the model was released. May be set to an epoch value if the release date is unknown.",
    "format": "date-time"
  }),
  "display_name": Schema.String.annotate({
    "title": "Display Name",
    "description": "A human-readable name for the model."
  }),
  "id": Schema.String.annotate({ "title": "Id", "description": "Unique model identifier." }),
  "type": Schema.Literal("model").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Models, this is always `\"model\"`.",
    "default": "model"
  })
}).annotate({ "title": "ModelInfo" })
export type NotFoundError = { readonly "message": string; readonly "type": "not_found_error" }
export const NotFoundError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Not found" }),
  "type": Schema.Literal("not_found_error").annotate({ "title": "Type", "default": "not_found_error" })
}).annotate({ "title": "NotFoundError" })
export type OverloadedError = { readonly "message": string; readonly "type": "overloaded_error" }
export const OverloadedError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Overloaded" }),
  "type": Schema.Literal("overloaded_error").annotate({ "title": "Type", "default": "overloaded_error" })
}).annotate({ "title": "OverloadedError" })
export type PermissionError = { readonly "message": string; readonly "type": "permission_error" }
export const PermissionError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Permission denied" }),
  "type": Schema.Literal("permission_error").annotate({ "title": "Type", "default": "permission_error" })
}).annotate({ "title": "PermissionError" })
export type PlainTextSource = { readonly "data": string; readonly "media_type": "text/plain"; readonly "type": "text" }
export const PlainTextSource = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data" }),
  "media_type": Schema.Literal("text/plain").annotate({ "title": "Media Type" }),
  "type": Schema.Literal("text").annotate({ "title": "Type" })
}).annotate({ "title": "PlainTextSource" })
export type RateLimitError = { readonly "message": string; readonly "type": "rate_limit_error" }
export const RateLimitError = Schema.Struct({
  "message": Schema.String.annotate({ "title": "Message", "default": "Rate limited" }),
  "type": Schema.Literal("rate_limit_error").annotate({ "title": "Type", "default": "rate_limit_error" })
}).annotate({ "title": "RateLimitError" })
export type RequestBashCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "bash_code_execution_output"
}
export const RequestBashCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("bash_code_execution_output").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionOutputBlock" })
export type RequestCharLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_char_index": number
  readonly "start_char_index": number
  readonly "type": "char_location"
}
export const RequestCharLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_char_index": Schema.Number.annotate({ "title": "End Char Index" }).check(Schema.isInt()),
  "start_char_index": Schema.Number.annotate({ "title": "Start Char Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("char_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCharLocationCitation" })
export type RequestCitationsConfig = { readonly "enabled"?: boolean }
export const RequestCitationsConfig = Schema.Struct({
  "enabled": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Enabled" }))
}).annotate({ "title": "RequestCitationsConfig" })
export type RequestCodeExecutionOutputBlock = { readonly "file_id": string; readonly "type": "code_execution_output" }
export const RequestCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("code_execution_output").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionOutputBlock" })
export type RequestContentBlockLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_block_index": number
  readonly "start_block_index": number
  readonly "type": "content_block_location"
}
export const RequestContentBlockLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("content_block_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestContentBlockLocationCitation" })
export type RequestPageLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_page_number": number
  readonly "start_page_number": number
  readonly "type": "page_location"
}
export const RequestPageLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
    Schema.Null
  ]).annotate({ "title": "Document Title" }),
  "end_page_number": Schema.Number.annotate({ "title": "End Page Number" }).check(Schema.isInt()),
  "start_page_number": Schema.Number.annotate({ "title": "Start Page Number" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(1)
  ),
  "type": Schema.Literal("page_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestPageLocationCitation" })
export type RequestSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "end_block_index": number
  readonly "search_result_index": number
  readonly "source": string
  readonly "start_block_index": number
  readonly "title": string | null
  readonly "type": "search_result_location"
}
export const RequestSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "search_result_index": Schema.Number.annotate({ "title": "Search Result Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "source": Schema.String.annotate({ "title": "Source" }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result_location").annotate({ "title": "Type" })
}).annotate({ "title": "RequestSearchResultLocationCitation" })
export type RequestTextEditorCodeExecutionCreateResultBlock = {
  readonly "is_file_update": boolean
  readonly "type": "text_editor_code_execution_create_result"
}
export const RequestTextEditorCodeExecutionCreateResultBlock = Schema.Struct({
  "is_file_update": Schema.Boolean.annotate({ "title": "Is File Update" }),
  "type": Schema.Literal("text_editor_code_execution_create_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionCreateResultBlock" })
export type RequestTextEditorCodeExecutionStrReplaceResultBlock = {
  readonly "lines"?: ReadonlyArray<string> | null
  readonly "new_lines"?: number | null
  readonly "new_start"?: number | null
  readonly "old_lines"?: number | null
  readonly "old_start"?: number | null
  readonly "type": "text_editor_code_execution_str_replace_result"
}
export const RequestTextEditorCodeExecutionStrReplaceResultBlock = Schema.Struct({
  "lines": Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Lines" })),
  "new_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "New Lines" })
  ),
  "new_start": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "New Start" })
  ),
  "old_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Old Lines" })
  ),
  "old_start": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Old Start" })
  ),
  "type": Schema.Literal("text_editor_code_execution_str_replace_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionStrReplaceResultBlock" })
export type RequestTextEditorCodeExecutionViewResultBlock = {
  readonly "content": string
  readonly "file_type": "text" | "image" | "pdf"
  readonly "num_lines"?: number | null
  readonly "start_line"?: number | null
  readonly "total_lines"?: number | null
  readonly "type": "text_editor_code_execution_view_result"
}
export const RequestTextEditorCodeExecutionViewResultBlock = Schema.Struct({
  "content": Schema.String.annotate({ "title": "Content" }),
  "file_type": Schema.Literals(["text", "image", "pdf"]).annotate({ "title": "File Type" }),
  "num_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Num Lines" })
  ),
  "start_line": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Start Line" })
  ),
  "total_lines": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({ "title": "Total Lines" })
  ),
  "type": Schema.Literal("text_editor_code_execution_view_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionViewResultBlock" })
export type RequestWebSearchResultBlock = {
  readonly "encrypted_content": string
  readonly "page_age"?: string | null
  readonly "title": string
  readonly "type": "web_search_result"
  readonly "url": string
}
export const RequestWebSearchResultBlock = Schema.Struct({
  "encrypted_content": Schema.String.annotate({ "title": "Encrypted Content" }),
  "page_age": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Page Age" })),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "RequestWebSearchResultBlock" })
export type RequestWebSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "encrypted_index": string
  readonly "title": string | null
  readonly "type": "web_search_result_location"
  readonly "url": string
}
export const RequestWebSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "encrypted_index": Schema.String.annotate({ "title": "Encrypted Index" }),
  "title": Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(512)), Schema.Null])
    .annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result_location").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(2048))
}).annotate({ "title": "RequestWebSearchResultLocationCitation" })
export type ResponseBashCodeExecutionOutputBlock = {
  readonly "file_id": string
  readonly "type": "bash_code_execution_output"
}
export const ResponseBashCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("bash_code_execution_output").annotate({
    "title": "Type",
    "default": "bash_code_execution_output"
  })
}).annotate({ "title": "ResponseBashCodeExecutionOutputBlock" })
export type ResponseCharLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_char_index": number
  readonly "file_id": string | null
  readonly "start_char_index": number
  readonly "type": "char_location"
}
export const ResponseCharLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_char_index": Schema.Number.annotate({ "title": "End Char Index" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_char_index": Schema.Number.annotate({ "title": "Start Char Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("char_location").annotate({ "title": "Type", "default": "char_location" })
}).annotate({ "title": "ResponseCharLocationCitation" })
export type ResponseCitationsConfig = { readonly "enabled": boolean }
export const ResponseCitationsConfig = Schema.Struct({
  "enabled": Schema.Boolean.annotate({ "title": "Enabled", "default": false })
}).annotate({ "title": "ResponseCitationsConfig" })
export type ResponseCodeExecutionOutputBlock = { readonly "file_id": string; readonly "type": "code_execution_output" }
export const ResponseCodeExecutionOutputBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("code_execution_output").annotate({ "title": "Type", "default": "code_execution_output" })
}).annotate({ "title": "ResponseCodeExecutionOutputBlock" })
export type ResponseContainerUploadBlock = { readonly "file_id": string; readonly "type": "container_upload" }
export const ResponseContainerUploadBlock = Schema.Struct({
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("container_upload").annotate({ "title": "Type", "default": "container_upload" })
}).annotate({
  "title": "ResponseContainerUploadBlock",
  "description": "Response model for a file uploaded to the container."
})
export type ResponseContentBlockLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_block_index": number
  readonly "file_id": string | null
  readonly "start_block_index": number
  readonly "type": "content_block_location"
}
export const ResponseContentBlockLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "type": Schema.Literal("content_block_location").annotate({ "title": "Type", "default": "content_block_location" })
}).annotate({ "title": "ResponseContentBlockLocationCitation" })
export type ResponsePageLocationCitation = {
  readonly "cited_text": string
  readonly "document_index": number
  readonly "document_title": string | null
  readonly "end_page_number": number
  readonly "file_id": string | null
  readonly "start_page_number": number
  readonly "type": "page_location"
}
export const ResponsePageLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "document_index": Schema.Number.annotate({ "title": "Document Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "document_title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Document Title" }),
  "end_page_number": Schema.Number.annotate({ "title": "End Page Number" }).check(Schema.isInt()),
  "file_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "File Id", "default": null }),
  "start_page_number": Schema.Number.annotate({ "title": "Start Page Number" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(1)
  ),
  "type": Schema.Literal("page_location").annotate({ "title": "Type", "default": "page_location" })
}).annotate({ "title": "ResponsePageLocationCitation" })
export type ResponseRedactedThinkingBlock = { readonly "data": string; readonly "type": "redacted_thinking" }
export const ResponseRedactedThinkingBlock = Schema.Struct({
  "data": Schema.String.annotate({ "title": "Data" }),
  "type": Schema.Literal("redacted_thinking").annotate({ "title": "Type", "default": "redacted_thinking" })
}).annotate({ "title": "ResponseRedactedThinkingBlock" })
export type ResponseSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "end_block_index": number
  readonly "search_result_index": number
  readonly "source": string
  readonly "start_block_index": number
  readonly "title": string | null
  readonly "type": "search_result_location"
}
export const ResponseSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "end_block_index": Schema.Number.annotate({ "title": "End Block Index" }).check(Schema.isInt()),
  "search_result_index": Schema.Number.annotate({ "title": "Search Result Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "source": Schema.String.annotate({ "title": "Source" }),
  "start_block_index": Schema.Number.annotate({ "title": "Start Block Index" }).check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0)
  ),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result_location").annotate({ "title": "Type", "default": "search_result_location" })
}).annotate({ "title": "ResponseSearchResultLocationCitation" })
export type ResponseTextEditorCodeExecutionCreateResultBlock = {
  readonly "is_file_update": boolean
  readonly "type": "text_editor_code_execution_create_result"
}
export const ResponseTextEditorCodeExecutionCreateResultBlock = Schema.Struct({
  "is_file_update": Schema.Boolean.annotate({ "title": "Is File Update" }),
  "type": Schema.Literal("text_editor_code_execution_create_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_create_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionCreateResultBlock" })
export type ResponseTextEditorCodeExecutionStrReplaceResultBlock = {
  readonly "lines": ReadonlyArray<string> | null
  readonly "new_lines": number | null
  readonly "new_start": number | null
  readonly "old_lines": number | null
  readonly "old_start": number | null
  readonly "type": "text_editor_code_execution_str_replace_result"
}
export const ResponseTextEditorCodeExecutionStrReplaceResultBlock = Schema.Struct({
  "lines": Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Lines", "default": null }),
  "new_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "New Lines",
    "default": null
  }),
  "new_start": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "New Start",
    "default": null
  }),
  "old_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Old Lines",
    "default": null
  }),
  "old_start": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Old Start",
    "default": null
  }),
  "type": Schema.Literal("text_editor_code_execution_str_replace_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_str_replace_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionStrReplaceResultBlock" })
export type ResponseTextEditorCodeExecutionViewResultBlock = {
  readonly "content": string
  readonly "file_type": "text" | "image" | "pdf"
  readonly "num_lines": number | null
  readonly "start_line": number | null
  readonly "total_lines": number | null
  readonly "type": "text_editor_code_execution_view_result"
}
export const ResponseTextEditorCodeExecutionViewResultBlock = Schema.Struct({
  "content": Schema.String.annotate({ "title": "Content" }),
  "file_type": Schema.Literals(["text", "image", "pdf"]).annotate({ "title": "File Type" }),
  "num_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Num Lines",
    "default": null
  }),
  "start_line": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Start Line",
    "default": null
  }),
  "total_lines": Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
    "title": "Total Lines",
    "default": null
  }),
  "type": Schema.Literal("text_editor_code_execution_view_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_view_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionViewResultBlock" })
export type ResponseThinkingBlock = {
  readonly "signature": string
  readonly "thinking": string
  readonly "type": "thinking"
}
export const ResponseThinkingBlock = Schema.Struct({
  "signature": Schema.String.annotate({ "title": "Signature" }),
  "thinking": Schema.String.annotate({ "title": "Thinking" }),
  "type": Schema.Literal("thinking").annotate({ "title": "Type", "default": "thinking" })
}).annotate({ "title": "ResponseThinkingBlock" })
export type ResponseToolReferenceBlock = { readonly "tool_name": string; readonly "type": "tool_reference" }
export const ResponseToolReferenceBlock = Schema.Struct({
  "tool_name": Schema.String.annotate({ "title": "Tool Name" }).check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(256)
  ).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,256}$"))),
  "type": Schema.Literal("tool_reference").annotate({ "title": "Type", "default": "tool_reference" })
}).annotate({ "title": "ResponseToolReferenceBlock" })
export type ResponseWebSearchResultBlock = {
  readonly "encrypted_content": string
  readonly "page_age": string | null
  readonly "title": string
  readonly "type": "web_search_result"
  readonly "url": string
}
export const ResponseWebSearchResultBlock = Schema.Struct({
  "encrypted_content": Schema.String.annotate({ "title": "Encrypted Content" }),
  "page_age": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Page Age", "default": null }),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result").annotate({ "title": "Type", "default": "web_search_result" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "ResponseWebSearchResultBlock" })
export type ResponseWebSearchResultLocationCitation = {
  readonly "cited_text": string
  readonly "encrypted_index": string
  readonly "title": string | null
  readonly "type": "web_search_result_location"
  readonly "url": string
}
export const ResponseWebSearchResultLocationCitation = Schema.Struct({
  "cited_text": Schema.String.annotate({ "title": "Cited Text" }),
  "encrypted_index": Schema.String.annotate({ "title": "Encrypted Index" }),
  "title": Schema.Union([Schema.String.check(Schema.isMaxLength(512)), Schema.Null]).annotate({ "title": "Title" }),
  "type": Schema.Literal("web_search_result_location").annotate({
    "title": "Type",
    "default": "web_search_result_location"
  }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "ResponseWebSearchResultLocationCitation" })
export type ServerToolCaller = { readonly "tool_id": string; readonly "type": "code_execution_20250825" }
export const ServerToolCaller = Schema.Struct({
  "tool_id": Schema.String.annotate({ "title": "Tool Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_20250825").annotate({ "title": "Type" })
}).annotate({ "title": "ServerToolCaller", "description": "Tool invocation generated by a server-side tool." })
export type ServerToolCaller_20260120 = { readonly "tool_id": string; readonly "type": "code_execution_20260120" }
export const ServerToolCaller_20260120 = Schema.Struct({
  "tool_id": Schema.String.annotate({ "title": "Tool Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_20260120").annotate({ "title": "Type" })
}).annotate({ "title": "ServerToolCaller_20260120" })
export type ServerToolUsage = { readonly "web_fetch_requests": number; readonly "web_search_requests": number }
export const ServerToolUsage = Schema.Struct({
  "web_fetch_requests": Schema.Number.annotate({
    "title": "Web Fetch Requests",
    "description": "The number of web fetch tool requests.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "web_search_requests": Schema.Number.annotate({
    "title": "Web Search Requests",
    "description": "The number of web search tool requests.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ "title": "ServerToolUsage" })
export type SignatureContentBlockDelta = { readonly "signature": string; readonly "type": "signature_delta" }
export const SignatureContentBlockDelta = Schema.Struct({
  "signature": Schema.String.annotate({ "title": "Signature" }),
  "type": Schema.Literal("signature_delta").annotate({ "title": "Type", "default": "signature_delta" })
}).annotate({ "title": "SignatureContentBlockDelta" })
export type Skill = {
  readonly "created_at": string
  readonly "display_title": string | null
  readonly "id": string
  readonly "latest_version": string | null
  readonly "source": string
  readonly "type": string
  readonly "updated_at": string
}
export const Skill = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill was created."
  }),
  "display_title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Display Title",
    "description":
      "Display title for the skill.\n\nThis is a human-readable label that is not included in the prompt sent to the model."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill.\n\nThe format and length of IDs may change over time."
  }),
  "latest_version": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Latest Version",
    "description":
      "The latest version identifier for the skill.\n\nThis represents the most recent version of the skill that has been created."
  }),
  "source": Schema.String.annotate({
    "title": "Source",
    "description":
      "Source of the skill.\n\nThis may be one of the following values:\n* `\"custom\"`: the skill was created by a user\n* `\"anthropic\"`: the skill was created by Anthropic"
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skills, this is always `\"skill\"`.",
    "default": "skill"
  }),
  "updated_at": Schema.String.annotate({
    "title": "Updated At",
    "description": "ISO 8601 timestamp of when the skill was last updated."
  })
}).annotate({ "title": "Skill" })
export type SkillVersion = {
  readonly "created_at": string
  readonly "description": string
  readonly "directory": string
  readonly "id": string
  readonly "name": string
  readonly "skill_id": string
  readonly "type": string
  readonly "version": string
}
export const SkillVersion = Schema.Struct({
  "created_at": Schema.String.annotate({
    "title": "Created At",
    "description": "ISO 8601 timestamp of when the skill version was created."
  }),
  "description": Schema.String.annotate({
    "title": "Description",
    "description": "Description of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "directory": Schema.String.annotate({
    "title": "Directory",
    "description":
      "Directory name of the skill version.\n\nThis is the top-level directory name that was extracted from the uploaded files."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique identifier for the skill version.\n\nThe format and length of IDs may change over time."
  }),
  "name": Schema.String.annotate({
    "title": "Name",
    "description":
      "Human-readable name of the skill version.\n\nThis is extracted from the SKILL.md file in the skill upload."
  }),
  "skill_id": Schema.String.annotate({
    "title": "Skill Id",
    "description": "Identifier for the skill that this version belongs to."
  }),
  "type": Schema.String.annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Skill Versions, this is always `\"skill_version\"`.",
    "default": "skill_version"
  }),
  "version": Schema.String.annotate({
    "title": "Version",
    "description":
      "Version identifier for the skill.\n\nEach version is identified by a Unix epoch timestamp (e.g., \"1759178010641129\")."
  })
}).annotate({ "title": "SkillVersion" })
export type TextContentBlockDelta = { readonly "text": string; readonly "type": "text_delta" }
export const TextContentBlockDelta = Schema.Struct({
  "text": Schema.String.annotate({ "title": "Text" }),
  "type": Schema.Literal("text_delta").annotate({ "title": "Type", "default": "text_delta" })
}).annotate({ "title": "TextContentBlockDelta" })
export type TextEditorCodeExecutionToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
  | "file_not_found"
export const TextEditorCodeExecutionToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded",
  "file_not_found"
]).annotate({ "title": "TextEditorCodeExecutionToolResultErrorCode" })
export type ThinkingConfigAdaptive = { readonly "type": "adaptive" }
export const ThinkingConfigAdaptive = Schema.Struct({
  "type": Schema.Literal("adaptive").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigAdaptive" })
export type ThinkingConfigDisabled = { readonly "type": "disabled" }
export const ThinkingConfigDisabled = Schema.Struct({
  "type": Schema.Literal("disabled").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigDisabled" })
export type ThinkingConfigEnabled = { readonly "budget_tokens": number; readonly "type": "enabled" }
export const ThinkingConfigEnabled = Schema.Struct({
  "budget_tokens": Schema.Number.annotate({
    "title": "Budget Tokens",
    "description":
      "Determines how many tokens Claude can use for its internal reasoning process. Larger budgets can enable more thorough analysis for complex problems, improving response quality.\n\nMust be ≥1024 and less than `max_tokens`.\n\nSee [extended thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking) for details."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1024)),
  "type": Schema.Literal("enabled").annotate({ "title": "Type" })
}).annotate({ "title": "ThinkingConfigEnabled" })
export type ThinkingContentBlockDelta = { readonly "thinking": string; readonly "type": "thinking_delta" }
export const ThinkingContentBlockDelta = Schema.Struct({
  "thinking": Schema.String.annotate({ "title": "Thinking" }),
  "type": Schema.Literal("thinking_delta").annotate({ "title": "Type", "default": "thinking_delta" })
}).annotate({ "title": "ThinkingContentBlockDelta" })
export type ToolChoiceAny = { readonly "disable_parallel_tool_use"?: boolean; readonly "type": "any" }
export const ToolChoiceAny = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output exactly one tool use."
    })
  ),
  "type": Schema.Literal("any").annotate({ "title": "Type" })
}).annotate({ "title": "ToolChoiceAny", "description": "The model will use any available tools." })
export type ToolChoiceAuto = { readonly "disable_parallel_tool_use"?: boolean; readonly "type": "auto" }
export const ToolChoiceAuto = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output at most one tool use."
    })
  ),
  "type": Schema.Literal("auto").annotate({ "title": "Type" })
}).annotate({ "title": "ToolChoiceAuto", "description": "The model will automatically decide whether to use tools." })
export type ToolChoiceNone = { readonly "type": "none" }
export const ToolChoiceNone = Schema.Struct({ "type": Schema.Literal("none").annotate({ "title": "Type" }) }).annotate({
  "title": "ToolChoiceNone",
  "description": "The model will not be allowed to use tools."
})
export type ToolChoiceTool = {
  readonly "disable_parallel_tool_use"?: boolean
  readonly "name": string
  readonly "type": "tool"
}
export const ToolChoiceTool = Schema.Struct({
  "disable_parallel_tool_use": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Disable Parallel Tool Use",
      "description":
        "Whether to disable parallel tool use.\n\nDefaults to `false`. If set to `true`, the model will output exactly one tool use."
    })
  ),
  "name": Schema.String.annotate({ "title": "Name", "description": "The name of the tool to use." }),
  "type": Schema.Literal("tool").annotate({ "title": "Type" })
}).annotate({
  "title": "ToolChoiceTool",
  "description": "The model will use the specified tool with `tool_choice.name`."
})
export type ToolSearchToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "too_many_requests"
  | "execution_time_exceeded"
export const ToolSearchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "too_many_requests",
  "execution_time_exceeded"
]).annotate({ "title": "ToolSearchToolResultErrorCode" })
export type URLImageSource = { readonly "type": "url"; readonly "url": string }
export const URLImageSource = Schema.Struct({
  "type": Schema.Literal("url").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "URLImageSource" })
export type URLPDFSource = { readonly "type": "url"; readonly "url": string }
export const URLPDFSource = Schema.Struct({
  "type": Schema.Literal("url").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "URLPDFSource" })
export type UserLocation = {
  readonly "city"?: string | null
  readonly "country"?: string | null
  readonly "region"?: string | null
  readonly "timezone"?: string | null
  readonly "type": "approximate"
}
export const UserLocation = Schema.Struct({
  "city": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "City",
      "description": "The city of the user."
    })
  ),
  "country": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(2)).check(Schema.isMaxLength(2)), Schema.Null]).annotate({
      "title": "Country",
      "description": "The two letter [ISO country code](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) of the user."
    })
  ),
  "region": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "Region",
      "description": "The region of the user."
    })
  ),
  "timezone": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)), Schema.Null]).annotate({
      "title": "Timezone",
      "description": "The [IANA timezone](https://nodatime.org/TimeZones) of the user."
    })
  ),
  "type": Schema.Literal("approximate").annotate({ "title": "Type" })
}).annotate({ "title": "UserLocation" })
export type WebFetchToolResultErrorCode =
  | "invalid_tool_input"
  | "url_too_long"
  | "url_not_allowed"
  | "url_not_accessible"
  | "unsupported_content_type"
  | "too_many_requests"
  | "max_uses_exceeded"
  | "unavailable"
export const WebFetchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "url_too_long",
  "url_not_allowed",
  "url_not_accessible",
  "unsupported_content_type",
  "too_many_requests",
  "max_uses_exceeded",
  "unavailable"
]).annotate({ "title": "WebFetchToolResultErrorCode" })
export type WebSearchToolResultErrorCode =
  | "invalid_tool_input"
  | "unavailable"
  | "max_uses_exceeded"
  | "too_many_requests"
  | "query_too_long"
  | "request_too_large"
export const WebSearchToolResultErrorCode = Schema.Literals([
  "invalid_tool_input",
  "unavailable",
  "max_uses_exceeded",
  "too_many_requests",
  "query_too_long",
  "request_too_large"
]).annotate({ "title": "WebSearchToolResultErrorCode" })
export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal"
export const StopReason = Schema.Literals([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal"
])
export type BetaStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "pause_turn"
  | "compaction"
  | "refusal"
  | "model_context_window_exceeded"
export const BetaStopReason = Schema.Literals([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "compaction",
  "refusal",
  "model_context_window_exceeded"
])
export type Model =
  | string
  | "claude-sonnet-5"
  | "claude-fable-5"
  | "claude-mythos-5"
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "claude-mythos-preview"
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-haiku-4-5-20251001"
  | "claude-opus-4-5"
  | "claude-opus-4-5-20251101"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-5-20250929"
  | "claude-opus-4-1"
  | "claude-opus-4-1-20250805"
export const Model = Schema.Union([
  Schema.String,
  Schema.Literals([
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-mythos-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-mythos-preview",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-1",
    "claude-opus-4-1-20250805"
  ])
]).annotate({
  "title": "Model",
  "description":
    "The model that will complete your prompt.\n\nSee [models](https://docs.anthropic.com/en/docs/models-overview) for additional details and options."
})
export type BetaMemoryTool_20250818_ViewCommand = {
  readonly "command": "view"
  readonly "path": string
  readonly "view_range"?: ReadonlyArray<number>
}
export const BetaMemoryTool_20250818_ViewCommand = Schema.Struct({
  "command": Schema.Literal("view").annotate({ "description": "Command type identifier", "default": "view" }),
  "path": Schema.String.annotate({ "description": "Path to directory or file to view" }),
  "view_range": Schema.optionalKey(
    Schema.Array(Schema.Number.check(Schema.isInt())).annotate({
      "description": "Optional line range for viewing specific lines"
    }).check(Schema.isMinLength(2)).check(Schema.isMaxLength(2))
  )
})
export type BetaMemoryTool_20250818_CreateCommand = {
  readonly "command": "create"
  readonly "path": string
  readonly "file_text": string
}
export const BetaMemoryTool_20250818_CreateCommand = Schema.Struct({
  "command": Schema.Literal("create").annotate({ "description": "Command type identifier", "default": "create" }),
  "path": Schema.String.annotate({ "description": "Path where the file should be created" }),
  "file_text": Schema.String.annotate({ "description": "Content to write to the file" })
})
export type BetaMemoryTool_20250818_StrReplaceCommand = {
  readonly "command": "str_replace"
  readonly "path": string
  readonly "old_str": string
  readonly "new_str": string
}
export const BetaMemoryTool_20250818_StrReplaceCommand = Schema.Struct({
  "command": Schema.Literal("str_replace").annotate({
    "description": "Command type identifier",
    "default": "str_replace"
  }),
  "path": Schema.String.annotate({ "description": "Path to the file where text should be replaced" }),
  "old_str": Schema.String.annotate({ "description": "Text to search for and replace" }),
  "new_str": Schema.String.annotate({ "description": "Text to replace with" })
})
export type BetaMemoryTool_20250818_InsertCommand = {
  readonly "command": "insert"
  readonly "path": string
  readonly "insert_line": number
  readonly "insert_text": string
}
export const BetaMemoryTool_20250818_InsertCommand = Schema.Struct({
  "command": Schema.Literal("insert").annotate({ "description": "Command type identifier", "default": "insert" }),
  "path": Schema.String.annotate({ "description": "Path to the file where text should be inserted" }),
  "insert_line": Schema.Number.annotate({ "description": "Line number where text should be inserted" }).check(
    Schema.isInt()
  ).check(Schema.isGreaterThanOrEqualTo(1)),
  "insert_text": Schema.String.annotate({ "description": "Text to insert at the specified line" })
})
export type BetaMemoryTool_20250818_DeleteCommand = { readonly "command": "delete"; readonly "path": string }
export const BetaMemoryTool_20250818_DeleteCommand = Schema.Struct({
  "command": Schema.Literal("delete").annotate({ "description": "Command type identifier", "default": "delete" }),
  "path": Schema.String.annotate({ "description": "Path to the file or directory to delete" })
})
export type BetaMemoryTool_20250818_RenameCommand = {
  readonly "command": "rename"
  readonly "old_path": string
  readonly "new_path": string
}
export const BetaMemoryTool_20250818_RenameCommand = Schema.Struct({
  "command": Schema.Literal("rename").annotate({ "description": "Command type identifier", "default": "rename" }),
  "old_path": Schema.String.annotate({ "description": "Current path of the file or directory" }),
  "new_path": Schema.String.annotate({ "description": "New path for the file or directory" })
})
export type RequestBashCodeExecutionToolResultError = {
  readonly "error_code": BashCodeExecutionToolResultErrorCode
  readonly "type": "bash_code_execution_tool_result_error"
}
export const RequestBashCodeExecutionToolResultError = Schema.Struct({
  "error_code": BashCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("bash_code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionToolResultError" })
export type ResponseBashCodeExecutionToolResultError = {
  readonly "error_code": BashCodeExecutionToolResultErrorCode
  readonly "type": "bash_code_execution_tool_result_error"
}
export const ResponseBashCodeExecutionToolResultError = Schema.Struct({
  "error_code": BashCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("bash_code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "bash_code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseBashCodeExecutionToolResultError" })
export type BetaRequestBashCodeExecutionToolResultError = {
  readonly "error_code": BetaBashCodeExecutionToolResultErrorCode
  readonly "type": "bash_code_execution_tool_result_error"
}
export const BetaRequestBashCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaBashCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("bash_code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionToolResultError" })
export type BetaResponseBashCodeExecutionToolResultError = {
  readonly "error_code": BetaBashCodeExecutionToolResultErrorCode
  readonly "type": "bash_code_execution_tool_result_error"
}
export const BetaResponseBashCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaBashCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("bash_code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "bash_code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseBashCodeExecutionToolResultError" })
export type BetaCodeExecutionTool_20250522 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20250522"
}
export const BetaCodeExecutionTool_20250522 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20250522").annotate({ "title": "Type" })
}).annotate({ "title": "CodeExecutionTool_20250522" })
export type BetaCodeExecutionTool_20250825 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20250825"
}
export const BetaCodeExecutionTool_20250825 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20250825").annotate({ "title": "Type" })
}).annotate({ "title": "CodeExecutionTool_20250825" })
export type BetaCodeExecutionTool_20260120 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20260120"
}
export const BetaCodeExecutionTool_20260120 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20260120").annotate({ "title": "Type" })
}).annotate({
  "title": "CodeExecutionTool_20260120",
  "description": "Code execution tool with REPL state persistence (daemon mode + gVisor checkpoint)."
})
export type BetaRequestCompactionBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content": string | null
  readonly "type": "compaction"
}
export const BetaRequestCompactionBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Content",
    "description": "Summary of previously compacted content, or null if compaction failed"
  }),
  "type": Schema.Literal("compaction").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestCompactionBlock",
  "description":
    "A compaction block containing summary of previous context.\n\nUsers should round-trip these blocks from responses to subsequent requests\nto maintain context across compaction boundaries.\n\nWhen content is None, the block represents a failed compaction. The server\ntreats these as no-ops. Empty string content is not allowed."
})
export type BetaRequestContainerUploadBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "file_id": string
  readonly "type": "container_upload"
}
export const BetaRequestContainerUploadBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("container_upload").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestContainerUploadBlock",
  "description":
    "A content block that represents a file to be uploaded to the container\nFiles uploaded via this block will be available in the container's input directory."
})
export type BetaRequestMCPToolUseBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name": string
  readonly "server_name": string
  readonly "type": "mcp_tool_use"
}
export const BetaRequestMCPToolUseBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.String.annotate({ "title": "Name" }),
  "server_name": Schema.String.annotate({ "title": "Server Name", "description": "The name of the MCP server" }),
  "type": Schema.Literal("mcp_tool_use").annotate({ "title": "Type" })
}).annotate({ "title": "RequestMCPToolUseBlock" })
export type BetaRequestToolReferenceBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "tool_name": string
  readonly "type": "tool_reference"
}
export const BetaRequestToolReferenceBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "tool_name": Schema.String.annotate({ "title": "Tool Name" }).check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(256)
  ).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,256}$"))),
  "type": Schema.Literal("tool_reference").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestToolReferenceBlock",
  "description": "Tool reference block that can be included in tool_result content."
})
export type BetaToolSearchToolBM25_20251119 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "tool_search_tool_bm25"
  readonly "strict"?: boolean
  readonly "type": "tool_search_tool_bm25_20251119" | "tool_search_tool_bm25"
}
export const BetaToolSearchToolBM25_20251119 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("tool_search_tool_bm25").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literals(["tool_search_tool_bm25_20251119", "tool_search_tool_bm25"]).annotate({ "title": "Type" })
}).annotate({ "title": "ToolSearchToolBM25_20251119" })
export type BetaToolSearchToolRegex_20251119 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "tool_search_tool_regex"
  readonly "strict"?: boolean
  readonly "type": "tool_search_tool_regex_20251119" | "tool_search_tool_regex"
}
export const BetaToolSearchToolRegex_20251119 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("tool_search_tool_regex").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literals(["tool_search_tool_regex_20251119", "tool_search_tool_regex"]).annotate({ "title": "Type" })
}).annotate({ "title": "ToolSearchToolRegex_20251119" })
export type BetaCompactionIterationUsage = {
  readonly "cache_creation": BetaCacheCreation | null
  readonly "cache_creation_input_tokens": number
  readonly "cache_read_input_tokens": number
  readonly "input_tokens": number
  readonly "output_tokens": number
  readonly "type": "compaction"
}
export const BetaCompactionIterationUsage = Schema.Struct({
  "cache_creation": Schema.Union([BetaCacheCreation, Schema.Null]).annotate({
    "description": "Breakdown of cached tokens by TTL",
    "default": null
  }),
  "cache_creation_input_tokens": Schema.Number.annotate({
    "title": "Cache Creation Input Tokens",
    "description": "The number of input tokens used to create the cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "cache_read_input_tokens": Schema.Number.annotate({
    "title": "Cache Read Input Tokens",
    "description": "The number of input tokens read from the cache.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "input_tokens": Schema.Number.annotate({
    "title": "Input Tokens",
    "description": "The number of input tokens which were used."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "output_tokens": Schema.Number.annotate({
    "title": "Output Tokens",
    "description": "The number of output tokens which were used."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("compaction").annotate({
    "title": "Type",
    "description": "Usage for a compaction iteration",
    "default": "compaction"
  })
}).annotate({ "title": "CompactionIterationUsage", "description": "Token usage for a compaction iteration." })
export type BetaMessageIterationUsage = {
  readonly "cache_creation": BetaCacheCreation | null
  readonly "cache_creation_input_tokens": number
  readonly "cache_read_input_tokens": number
  readonly "input_tokens": number
  readonly "output_tokens": number
  readonly "type": "message"
}
export const BetaMessageIterationUsage = Schema.Struct({
  "cache_creation": Schema.Union([BetaCacheCreation, Schema.Null]).annotate({
    "description": "Breakdown of cached tokens by TTL",
    "default": null
  }),
  "cache_creation_input_tokens": Schema.Number.annotate({
    "title": "Cache Creation Input Tokens",
    "description": "The number of input tokens used to create the cache entry.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "cache_read_input_tokens": Schema.Number.annotate({
    "title": "Cache Read Input Tokens",
    "description": "The number of input tokens read from the cache.",
    "default": 0
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "input_tokens": Schema.Number.annotate({
    "title": "Input Tokens",
    "description": "The number of input tokens which were used."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "output_tokens": Schema.Number.annotate({
    "title": "Output Tokens",
    "description": "The number of output tokens which were used."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  "type": Schema.Literal("message").annotate({
    "title": "Type",
    "description": "Usage for a sampling iteration",
    "default": "message"
  })
}).annotate({ "title": "MessageIterationUsage", "description": "Token usage for a sampling iteration." })
export type BetaRequestCodeExecutionToolResultError = {
  readonly "error_code": BetaCodeExecutionToolResultErrorCode
  readonly "type": "code_execution_tool_result_error"
}
export const BetaRequestCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "Error" })
export type BetaResponseCodeExecutionToolResultError = {
  readonly "error_code": BetaCodeExecutionToolResultErrorCode
  readonly "type": "code_execution_tool_result_error"
}
export const BetaResponseCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaCodeExecutionToolResultErrorCode,
  "type": Schema.Literal("code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseCodeExecutionToolResultError" })
export type BetaCountMessageTokensResponse = {
  readonly "context_management": BetaContextManagementResponse | null
  readonly "input_tokens": number
}
export const BetaCountMessageTokensResponse = Schema.Struct({
  "context_management": Schema.Union([BetaContextManagementResponse, Schema.Null]).annotate({
    "description": "Information about context management applied to the message."
  }),
  "input_tokens": Schema.Number.annotate({
    "title": "Input Tokens",
    "description": "The total number of tokens across the provided list of messages, system prompt, and tools."
  }).check(Schema.isInt())
}).annotate({ "title": "CountMessageTokensResponse" })
export type BetaFileListResponse = {
  readonly "data": ReadonlyArray<BetaFileMetadataSchema>
  readonly "first_id"?: string | null
  readonly "has_more"?: boolean
  readonly "last_id"?: string | null
}
export const BetaFileListResponse = Schema.Struct({
  "data": Schema.Array(BetaFileMetadataSchema).annotate({
    "title": "Data",
    "description": "List of file metadata objects."
  }),
  "first_id": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "First Id",
      "description": "ID of the first file in this page of results."
    })
  ),
  "has_more": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Has More",
      "description": "Whether there are more results available.",
      "default": false
    })
  ),
  "last_id": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Last Id",
      "description": "ID of the last file in this page of results."
    })
  )
}).annotate({ "title": "FileListResponse" })
export type BetaCompact20260112 = {
  readonly "instructions"?: string | null
  readonly "pause_after_compaction"?: boolean
  readonly "trigger"?: BetaInputTokensTrigger | null
  readonly "type": "compact_20260112"
}
export const BetaCompact20260112 = Schema.Struct({
  "instructions": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Instructions",
      "description": "Additional instructions for summarization."
    })
  ),
  "pause_after_compaction": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Pause After Compaction",
      "description": "Whether to pause after compaction and return the compaction block to the user."
    })
  ),
  "trigger": Schema.optionalKey(
    Schema.Union([BetaInputTokensTrigger, Schema.Null]).annotate({
      "description": "When to trigger compaction. Defaults to 150000 input tokens."
    })
  ),
  "type": Schema.Literal("compact_20260112").annotate({ "title": "Type" })
}).annotate({
  "title": "Compact20260112",
  "description": "Automatically compact older context when reaching the configured trigger threshold."
})
export type BetaBashTool_20241022 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "bash"
  readonly "strict"?: boolean
  readonly "type": "bash_20241022"
}
export const BetaBashTool_20241022 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("bash").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("bash_20241022").annotate({ "title": "Type" })
}).annotate({ "title": "BashTool_20241022" })
export type BetaBashTool_20250124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "bash"
  readonly "strict"?: boolean
  readonly "type": "bash_20250124"
}
export const BetaBashTool_20250124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("bash").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("bash_20250124").annotate({ "title": "Type" })
}).annotate({ "title": "BashTool_20250124" })
export type BetaComputerUseTool_20241022 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "display_height_px": number
  readonly "display_number"?: number | null
  readonly "display_width_px": number
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "computer"
  readonly "strict"?: boolean
  readonly "type": "computer_20241022"
}
export const BetaComputerUseTool_20241022 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "display_height_px": Schema.Number.annotate({
    "title": "Display Height Px",
    "description": "The height of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "display_number": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)), Schema.Null]).annotate({
      "title": "Display Number",
      "description": "The X11 display number (e.g. 0, 1) for the display."
    })
  ),
  "display_width_px": Schema.Number.annotate({
    "title": "Display Width Px",
    "description": "The width of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("computer").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("computer_20241022").annotate({ "title": "Type" })
}).annotate({ "title": "ComputerUseTool_20241022" })
export type BetaComputerUseTool_20250124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "display_height_px": number
  readonly "display_number"?: number | null
  readonly "display_width_px": number
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "computer"
  readonly "strict"?: boolean
  readonly "type": "computer_20250124"
}
export const BetaComputerUseTool_20250124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "display_height_px": Schema.Number.annotate({
    "title": "Display Height Px",
    "description": "The height of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "display_number": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)), Schema.Null]).annotate({
      "title": "Display Number",
      "description": "The X11 display number (e.g. 0, 1) for the display."
    })
  ),
  "display_width_px": Schema.Number.annotate({
    "title": "Display Width Px",
    "description": "The width of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("computer").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("computer_20250124").annotate({ "title": "Type" })
}).annotate({ "title": "ComputerUseTool_20250124" })
export type BetaComputerUseTool_20251124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "display_height_px": number
  readonly "display_number"?: number | null
  readonly "display_width_px": number
  readonly "enable_zoom"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "computer"
  readonly "strict"?: boolean
  readonly "type": "computer_20251124"
}
export const BetaComputerUseTool_20251124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "display_height_px": Schema.Number.annotate({
    "title": "Display Height Px",
    "description": "The height of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "display_number": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)), Schema.Null]).annotate({
      "title": "Display Number",
      "description": "The X11 display number (e.g. 0, 1) for the display."
    })
  ),
  "display_width_px": Schema.Number.annotate({
    "title": "Display Width Px",
    "description": "The width of the display in pixels."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "enable_zoom": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Enable Zoom",
      "description": "Whether to enable an action to take a zoomed-in screenshot of the screen."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("computer").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("computer_20251124").annotate({ "title": "Type" })
}).annotate({ "title": "ComputerUseTool_20251124" })
export type BetaMemoryTool_20250818 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "memory"
  readonly "strict"?: boolean
  readonly "type": "memory_20250818"
}
export const BetaMemoryTool_20250818 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("memory").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("memory_20250818").annotate({ "title": "Type" })
}).annotate({ "title": "MemoryTool_20250818" })
export type BetaTextEditor_20241022 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "str_replace_editor"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20241022"
}
export const BetaTextEditor_20241022 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("str_replace_editor").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20241022").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20241022" })
export type BetaTextEditor_20250124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "str_replace_editor"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250124"
}
export const BetaTextEditor_20250124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("str_replace_editor").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250124").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250124" })
export type BetaTextEditor_20250429 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "name": "str_replace_based_edit_tool"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250429"
}
export const BetaTextEditor_20250429 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("str_replace_based_edit_tool").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250429").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250429" })
export type BetaTextEditor_20250728 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
  readonly "max_characters"?: number | null
  readonly "name": "str_replace_based_edit_tool"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250728"
}
export const BetaTextEditor_20250728 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  ),
  "max_characters": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)), Schema.Null]).annotate({
      "title": "Max Characters",
      "description":
        "Maximum number of characters to display when viewing a file. If not specified, defaults to displaying the full file."
    })
  ),
  "name": Schema.Literal("str_replace_based_edit_tool").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250728").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250728" })
export type BetaTool = {
  readonly "type"?: null | "custom"
  readonly "description"?: string
  readonly "name": string
  readonly "input_schema": {
    readonly "properties"?: { readonly [x: string]: Schema.Json } | null
    readonly "required"?: ReadonlyArray<string> | null
    readonly "type": "object"
    readonly [x: string]: Schema.Json
  }
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "strict"?: boolean
  readonly "eager_input_streaming"?: boolean | null
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: BetaJsonValue }>
}
export const BetaTool = Schema.Struct({
  "type": Schema.optionalKey(Schema.Union([Schema.Null, Schema.Literal("custom")]).annotate({ "title": "Type" })),
  "description": Schema.optionalKey(Schema.String.annotate({
    "title": "Description",
    "description":
      "Description of what this tool does.\n\nTool descriptions should be as detailed as possible. The more information that the model has about what the tool is and how to use it, the better it will perform. You can use natural language descriptions to reinforce important aspects of the tool input JSON schema."
  })),
  "name": Schema.String.annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(128)).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,128}$"))
  ),
  "input_schema": Schema.StructWithRest(
    Schema.Struct({
      "properties": Schema.optionalKey(
        Schema.Union([Schema.Record(Schema.String, Schema.Json), Schema.Null]).annotate({ "title": "Properties" })
      ),
      "required": Schema.optionalKey(
        Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Required" })
      ),
      "type": Schema.Literal("object").annotate({ "title": "Type" })
    }),
    [Schema.Record(Schema.String, Schema.Json)]
  ).annotate({
    "title": "InputSchema",
    "description":
      "[JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.\n\nThis defines the shape of the `input` that your tool accepts and that the model will produce."
  }),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "eager_input_streaming": Schema.optionalKey(
    Schema.Union([Schema.Boolean, Schema.Null]).annotate({
      "title": "Eager Input Streaming",
      "description":
        "Enable eager input streaming for this tool. When true, tool input parameters will be streamed incrementally as they are generated, and types will be inferred on-the-fly rather than buffering the full JSON output. When false, streaming is disabled for this tool even if the fine-grained-tool-streaming beta is active. When null (default), uses the default behavior based on beta headers."
    })
  ),
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, BetaJsonValue)).annotate({ "title": "Input Examples" })
  )
}).annotate({ "title": "Tool" })
export type BetaMCPToolset = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "configs"?: { readonly [x: string]: BetaMCPToolConfig } | null
  readonly "default_config"?: { readonly "defer_loading"?: boolean; readonly "enabled"?: boolean }
  readonly "mcp_server_name": string
  readonly "type": "mcp_toolset"
}
export const BetaMCPToolset = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "configs": Schema.optionalKey(
    Schema.Union([Schema.Record(Schema.String, BetaMCPToolConfig), Schema.Null]).annotate({
      "title": "Configs",
      "description": "Configuration overrides for specific tools, keyed by tool name"
    })
  ),
  "default_config": Schema.optionalKey(
    Schema.Struct({
      "defer_loading": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Defer Loading" })),
      "enabled": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Enabled" }))
    }).annotate({
      "title": "MCPToolDefaultConfig",
      "description": "Default configuration applied to all tools from this server"
    })
  ),
  "mcp_server_name": Schema.String.annotate({
    "title": "Mcp Server Name",
    "description": "Name of the MCP server to configure tools for"
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(255)),
  "type": Schema.Literal("mcp_toolset").annotate({ "title": "Type" })
}).annotate({
  "title": "MCPToolset",
  "description":
    "Configuration for a group of tools from an MCP server.\n\nAllows configuring enabled status and defer_loading for all tools\nfrom an MCP server, with optional per-tool overrides."
})
export type BetaListResponse_MessageBatch_ = {
  readonly "data": ReadonlyArray<BetaMessageBatch>
  readonly "first_id": string | null
  readonly "has_more": boolean
  readonly "last_id": string | null
}
export const BetaListResponse_MessageBatch_ = Schema.Struct({
  "data": Schema.Array(BetaMessageBatch).annotate({ "title": "Data" }),
  "first_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "First Id",
    "description": "First ID in the `data` list. Can be used as the `before_id` for the previous page."
  }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "last_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Last Id",
    "description": "Last ID in the `data` list. Can be used as the `after_id` for the next page."
  })
}).annotate({ "title": "ListResponse[MessageBatch]" })
export type BetaListResponse_ModelInfo_ = {
  readonly "data": ReadonlyArray<BetaModelInfo>
  readonly "first_id": string | null
  readonly "has_more": boolean
  readonly "last_id": string | null
}
export const BetaListResponse_ModelInfo_ = Schema.Struct({
  "data": Schema.Array(BetaModelInfo).annotate({ "title": "Data" }),
  "first_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "First Id",
    "description": "First ID in the `data` list. Can be used as the `before_id` for the previous page."
  }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "last_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Last Id",
    "description": "Last ID in the `data` list. Can be used as the `after_id` for the next page."
  })
}).annotate({ "title": "ListResponse[ModelInfo]" })
export type BetaErrorResponse = {
  readonly "error":
    | BetaInvalidRequestError
    | BetaAuthenticationError
    | BetaBillingError
    | BetaPermissionError
    | BetaNotFoundError
    | BetaRateLimitError
    | BetaGatewayTimeoutError
    | BetaAPIError
    | BetaOverloadedError
  readonly "request_id": string | null
  readonly "type": "error"
}
export const BetaErrorResponse = Schema.Struct({
  "error": Schema.Union([
    BetaInvalidRequestError,
    BetaAuthenticationError,
    BetaBillingError,
    BetaPermissionError,
    BetaNotFoundError,
    BetaRateLimitError,
    BetaGatewayTimeoutError,
    BetaAPIError,
    BetaOverloadedError
  ], { mode: "oneOf" }).annotate({ "title": "Error" }),
  "request_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Request Id", "default": null }),
  "type": Schema.Literal("error").annotate({ "title": "Type", "default": "error" })
}).annotate({ "title": "ErrorResponse" })
export type BetaRequestBashCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaRequestBashCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "bash_code_execution_result"
}
export const BetaRequestBashCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaRequestBashCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("bash_code_execution_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionResultBlock" })
export type BetaWebFetchTool_20250910 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "citations"?: BetaRequestCitationsConfig | null
  readonly "defer_loading"?: boolean
  readonly "max_content_tokens"?: number | null
  readonly "max_uses"?: number | null
  readonly "name": "web_fetch"
  readonly "strict"?: boolean
  readonly "type": "web_fetch_20250910"
}
export const BetaWebFetchTool_20250910 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description": "List of domains to allow fetching from"
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description": "List of domains to block fetching from"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([BetaRequestCitationsConfig, Schema.Null]).annotate({
      "description": "Citations configuration for fetched documents. Citations are disabled by default."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_content_tokens": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Content Tokens",
      "description":
        "Maximum number of tokens used by including web page text content in the context. The limit is approximate and does not apply to binary content such as PDFs."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_fetch").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_fetch_20250910").annotate({ "title": "Type" })
}).annotate({ "title": "WebFetchTool_20250910" })
export type BetaWebFetchTool_20260209 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "citations"?: BetaRequestCitationsConfig | null
  readonly "defer_loading"?: boolean
  readonly "max_content_tokens"?: number | null
  readonly "max_uses"?: number | null
  readonly "name": "web_fetch"
  readonly "strict"?: boolean
  readonly "type": "web_fetch_20260209"
}
export const BetaWebFetchTool_20260209 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description": "List of domains to allow fetching from"
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description": "List of domains to block fetching from"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([BetaRequestCitationsConfig, Schema.Null]).annotate({
      "description": "Citations configuration for fetched documents. Citations are disabled by default."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_content_tokens": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Content Tokens",
      "description":
        "Maximum number of tokens used by including web page text content in the context. The limit is approximate and does not apply to binary content such as PDFs."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_fetch").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_fetch_20260209").annotate({ "title": "Type" })
}).annotate({ "title": "WebFetchTool_20260209" })
export type BetaRequestCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaRequestCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "code_execution_result"
}
export const BetaRequestCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaRequestCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("code_execution_result").annotate({ "title": "Type" })
}).annotate({ "title": "Result Block" })
export type BetaRequestEncryptedCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaRequestCodeExecutionOutputBlock>
  readonly "encrypted_stdout": string
  readonly "return_code": number
  readonly "stderr": string
  readonly "type": "encrypted_code_execution_result"
}
export const BetaRequestEncryptedCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaRequestCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "encrypted_stdout": Schema.String.annotate({ "title": "Encrypted Stdout" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "type": Schema.Literal("encrypted_code_execution_result").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestEncryptedCodeExecutionResultBlock",
  "description": "Code execution result with encrypted stdout for PFC + web_search results."
})
export type BetaRequestMCPServerURLDefinition = {
  readonly "authorization_token"?: string | null
  readonly "name": string
  readonly "tool_configuration"?: BetaRequestMCPServerToolConfiguration | null
  readonly "type": "url"
  readonly "url": string
}
export const BetaRequestMCPServerURLDefinition = Schema.Struct({
  "authorization_token": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Authorization Token" })
  ),
  "name": Schema.String.annotate({ "title": "Name" }),
  "tool_configuration": Schema.optionalKey(Schema.Union([BetaRequestMCPServerToolConfiguration, Schema.Null])),
  "type": Schema.Literal("url").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url" })
}).annotate({ "title": "RequestMCPServerURLDefinition" })
export type BetaRequestMCPToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content"?:
    | string
    | ReadonlyArray<
      {
        readonly "cache_control"?: BetaCacheControlEphemeral | null
        readonly "citations"?:
          | ReadonlyArray<
            | BetaRequestCharLocationCitation
            | BetaRequestPageLocationCitation
            | BetaRequestContentBlockLocationCitation
            | BetaRequestWebSearchResultLocationCitation
            | BetaRequestSearchResultLocationCitation
          >
          | null
        readonly "text": string
        readonly "type": "text"
      }
    >
  readonly "is_error"?: boolean
  readonly "tool_use_id": string
  readonly "type": "mcp_tool_result"
}
export const BetaRequestMCPToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.optionalKey(
    Schema.Union([
      Schema.String,
      Schema.Array(
        Schema.Struct({
          "cache_control": Schema.optionalKey(
            Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
              "title": "Cache Control",
              "description": "Create a cache control breakpoint at this content block."
            })
          ),
          "citations": Schema.optionalKey(
            Schema.Union([
              Schema.Array(
                Schema.Union([
                  BetaRequestCharLocationCitation,
                  BetaRequestPageLocationCitation,
                  BetaRequestContentBlockLocationCitation,
                  BetaRequestWebSearchResultLocationCitation,
                  BetaRequestSearchResultLocationCitation
                ], { mode: "oneOf" })
              ),
              Schema.Null
            ]).annotate({ "title": "Citations" })
          ),
          "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(1)),
          "type": Schema.Literal("text").annotate({ "title": "Type" })
        }).annotate({ "title": "beta_mcp_tool_result_block_param_content_item" })
      ).annotate({ "title": "beta_mcp_tool_result_block_param_content" })
    ]).annotate({ "title": "Content" })
  ),
  "is_error": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Is Error" })),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))
  ),
  "type": Schema.Literal("mcp_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestMCPToolResultBlock" })
export type BetaRequestTextBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "citations"?:
    | ReadonlyArray<
      | BetaRequestCharLocationCitation
      | BetaRequestPageLocationCitation
      | BetaRequestContentBlockLocationCitation
      | BetaRequestWebSearchResultLocationCitation
      | BetaRequestSearchResultLocationCitation
    >
    | null
  readonly "text": string
  readonly "type": "text"
}
export const BetaRequestTextBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([
      Schema.Array(
        Schema.Union([
          BetaRequestCharLocationCitation,
          BetaRequestPageLocationCitation,
          BetaRequestContentBlockLocationCitation,
          BetaRequestWebSearchResultLocationCitation,
          BetaRequestSearchResultLocationCitation
        ], { mode: "oneOf" })
      ),
      Schema.Null
    ]).annotate({ "title": "Citations" })
  ),
  "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(1)),
  "type": Schema.Literal("text").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextBlock" })
export type BetaResponseBashCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaResponseBashCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "bash_code_execution_result"
}
export const BetaResponseBashCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaResponseBashCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("bash_code_execution_result").annotate({
    "title": "Type",
    "default": "bash_code_execution_result"
  })
}).annotate({ "title": "ResponseBashCodeExecutionResultBlock" })
export type BetaResponseDocumentBlock = {
  readonly "citations": BetaResponseCitationsConfig | null
  readonly "source": BetaBase64PDFSource | BetaPlainTextSource
  readonly "title": string | null
  readonly "type": "document"
}
export const BetaResponseDocumentBlock = Schema.Struct({
  "citations": Schema.Union([BetaResponseCitationsConfig, Schema.Null]).annotate({
    "description": "Citation configuration for the document",
    "default": null
  }),
  "source": Schema.Union([BetaBase64PDFSource, BetaPlainTextSource], { mode: "oneOf" }).annotate({ "title": "Source" }),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Title",
    "description": "The title of the document",
    "default": null
  }),
  "type": Schema.Literal("document").annotate({ "title": "Type", "default": "document" })
}).annotate({ "title": "ResponseDocumentBlock" })
export type BetaResponseContextManagement = {
  readonly "applied_edits": ReadonlyArray<BetaResponseClearToolUses20250919Edit | BetaResponseClearThinking20251015Edit>
}
export const BetaResponseContextManagement = Schema.Struct({
  "applied_edits": Schema.Array(
    Schema.Union([BetaResponseClearToolUses20250919Edit, BetaResponseClearThinking20251015Edit], { mode: "oneOf" })
  ).annotate({ "title": "Applied Edits", "description": "List of context management edits that were applied." })
}).annotate({ "title": "ResponseContextManagement" })
export type BetaResponseCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaResponseCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "code_execution_result"
}
export const BetaResponseCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaResponseCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("code_execution_result").annotate({ "title": "Type", "default": "code_execution_result" })
}).annotate({ "title": "ResponseCodeExecutionResultBlock" })
export type BetaResponseEncryptedCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<BetaResponseCodeExecutionOutputBlock>
  readonly "encrypted_stdout": string
  readonly "return_code": number
  readonly "stderr": string
  readonly "type": "encrypted_code_execution_result"
}
export const BetaResponseEncryptedCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(BetaResponseCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "encrypted_stdout": Schema.String.annotate({ "title": "Encrypted Stdout" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "type": Schema.Literal("encrypted_code_execution_result").annotate({
    "title": "Type",
    "default": "encrypted_code_execution_result"
  })
}).annotate({
  "title": "ResponseEncryptedCodeExecutionResultBlock",
  "description": "Code execution result with encrypted stdout for PFC + web_search results."
})
export type BetaResponseToolSearchToolSearchResultBlock = {
  readonly "tool_references": ReadonlyArray<BetaResponseToolReferenceBlock>
  readonly "type": "tool_search_tool_search_result"
}
export const BetaResponseToolSearchToolSearchResultBlock = Schema.Struct({
  "tool_references": Schema.Array(BetaResponseToolReferenceBlock).annotate({ "title": "Tool References" }),
  "type": Schema.Literal("tool_search_tool_search_result").annotate({
    "title": "Type",
    "default": "tool_search_tool_search_result"
  })
}).annotate({ "title": "ResponseToolSearchToolSearchResultBlock" })
export type BetaCitationsDelta = {
  readonly "citation":
    | BetaResponseCharLocationCitation
    | BetaResponsePageLocationCitation
    | BetaResponseContentBlockLocationCitation
    | BetaResponseWebSearchResultLocationCitation
    | BetaResponseSearchResultLocationCitation
  readonly "type": "citations_delta"
}
export const BetaCitationsDelta = Schema.Struct({
  "citation": Schema.Union([
    BetaResponseCharLocationCitation,
    BetaResponsePageLocationCitation,
    BetaResponseContentBlockLocationCitation,
    BetaResponseWebSearchResultLocationCitation,
    BetaResponseSearchResultLocationCitation
  ], { mode: "oneOf" }).annotate({ "title": "Citation" }),
  "type": Schema.Literal("citations_delta").annotate({ "title": "Type", "default": "citations_delta" })
}).annotate({ "title": "CitationsDelta" })
export type BetaResponseMCPToolResultBlock = {
  readonly "content":
    | string
    | ReadonlyArray<
      {
        readonly "citations":
          | ReadonlyArray<
            | BetaResponseCharLocationCitation
            | BetaResponsePageLocationCitation
            | BetaResponseContentBlockLocationCitation
            | BetaResponseWebSearchResultLocationCitation
            | BetaResponseSearchResultLocationCitation
          >
          | null
        readonly "text": string
        readonly "type": "text"
      }
    >
  readonly "is_error": boolean
  readonly "tool_use_id": string
  readonly "type": "mcp_tool_result"
}
export const BetaResponseMCPToolResultBlock = Schema.Struct({
  "content": Schema.Union([
    Schema.String,
    Schema.Array(
      Schema.Struct({
        "citations": Schema.Union([
          Schema.Array(
            Schema.Union([
              BetaResponseCharLocationCitation,
              BetaResponsePageLocationCitation,
              BetaResponseContentBlockLocationCitation,
              BetaResponseWebSearchResultLocationCitation,
              BetaResponseSearchResultLocationCitation
            ], { mode: "oneOf" })
          ),
          Schema.Null
        ]).annotate({
          "title": "Citations",
          "description":
            "Citations supporting the text block.\n\nThe type of citation returned will depend on the type of document being cited. Citing a PDF results in `page_location`, plain text results in `char_location`, and content document results in `content_block_location`.",
          "default": null
        }),
        "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(0)).check(
          Schema.isMaxLength(5000000)
        ),
        "type": Schema.Literal("text").annotate({ "title": "Type", "default": "text" })
      }).annotate({ "title": "beta_mcp_tool_result_block_content_item" })
    ).annotate({ "title": "beta_mcp_tool_result_block_content" })
  ]).annotate({ "title": "Content" }),
  "is_error": Schema.Boolean.annotate({ "title": "Is Error", "default": false }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))
  ),
  "type": Schema.Literal("mcp_tool_result").annotate({ "title": "Type", "default": "mcp_tool_result" })
}).annotate({ "title": "ResponseMCPToolResultBlock" })
export type BetaResponseTextBlock = {
  readonly "citations"?:
    | ReadonlyArray<
      | BetaResponseCharLocationCitation
      | BetaResponsePageLocationCitation
      | BetaResponseContentBlockLocationCitation
      | BetaResponseWebSearchResultLocationCitation
      | BetaResponseSearchResultLocationCitation
    >
    | null
  readonly "text": string
  readonly "type": "text"
}
export const BetaResponseTextBlock = Schema.Struct({
  "citations": Schema.optionalKey(
    Schema.Union([
      Schema.Array(
        Schema.Union([
          BetaResponseCharLocationCitation,
          BetaResponsePageLocationCitation,
          BetaResponseContentBlockLocationCitation,
          BetaResponseWebSearchResultLocationCitation,
          BetaResponseSearchResultLocationCitation
        ], { mode: "oneOf" })
      ),
      Schema.Null
    ]).annotate({
      "title": "Citations",
      "description":
        "Citations supporting the text block.\n\nThe type of citation returned will depend on the type of document being cited. Citing a PDF results in `page_location`, plain text results in `char_location`, and content document results in `content_block_location`.",
      "default": null
    })
  ),
  "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(0)).check(Schema.isMaxLength(5000000)),
  "type": Schema.Literal("text").annotate({ "title": "Type", "default": "text" })
}).annotate({ "title": "ResponseTextBlock" })
export type BetaRequestServerToolUseBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name":
    | "web_search"
    | "web_fetch"
    | "code_execution"
    | "bash_code_execution"
    | "text_editor_code_execution"
    | "tool_search_tool_regex"
    | "tool_search_tool_bm25"
  readonly "type": "server_tool_use"
}
export const BetaRequestServerToolUseBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.Literals([
    "web_search",
    "web_fetch",
    "code_execution",
    "bash_code_execution",
    "text_editor_code_execution",
    "tool_search_tool_regex",
    "tool_search_tool_bm25"
  ]).annotate({ "title": "Name" }),
  "type": Schema.Literal("server_tool_use").annotate({ "title": "Type" })
}).annotate({ "title": "RequestServerToolUseBlock" })
export type BetaResponseServerToolUseBlock = {
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name":
    | "web_search"
    | "web_fetch"
    | "code_execution"
    | "bash_code_execution"
    | "text_editor_code_execution"
    | "tool_search_tool_regex"
    | "tool_search_tool_bm25"
  readonly "type": "server_tool_use"
}
export const BetaResponseServerToolUseBlock = Schema.Struct({
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.Literals([
    "web_search",
    "web_fetch",
    "code_execution",
    "bash_code_execution",
    "text_editor_code_execution",
    "tool_search_tool_regex",
    "tool_search_tool_bm25"
  ]).annotate({ "title": "Name" }),
  "type": Schema.Literal("server_tool_use").annotate({ "title": "Type", "default": "server_tool_use" })
}).annotate({ "title": "ResponseServerToolUseBlock" })
export type BetaResponseToolUseBlock = {
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name": string
  readonly "type": "tool_use"
}
export const BetaResponseToolUseBlock = Schema.Struct({
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.String.annotate({ "title": "Name" }).check(Schema.isMinLength(1)),
  "type": Schema.Literal("tool_use").annotate({ "title": "Type", "default": "tool_use" })
}).annotate({ "title": "ResponseToolUseBlock" })
export type BetaContainer = {
  readonly "expires_at": string
  readonly "id": string
  readonly "skills": ReadonlyArray<BetaSkill> | null
}
export const BetaContainer = Schema.Struct({
  "expires_at": Schema.String.annotate({
    "title": "Expires At",
    "description": "The time at which the container will expire.",
    "format": "date-time"
  }),
  "id": Schema.String.annotate({ "title": "Id", "description": "Identifier for the container used in this request" }),
  "skills": Schema.Union([Schema.Array(BetaSkill), Schema.Null]).annotate({
    "title": "Skills",
    "description": "Skills loaded in the container",
    "default": null
  })
}).annotate({
  "title": "Container",
  "description": "Information about the container used in the request (for the code execution tool)"
})
export type BetaContainerParams = {
  readonly "id"?: string | null
  readonly "skills"?: ReadonlyArray<BetaSkillParams> | null
}
export const BetaContainerParams = Schema.Struct({
  "id": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Id", "description": "Container id" })
  ),
  "skills": Schema.optionalKey(
    Schema.Union([Schema.Array(BetaSkillParams).check(Schema.isMaxLength(8)), Schema.Null]).annotate({
      "title": "Skills",
      "description": "List of skills to load in the container"
    })
  )
}).annotate({ "title": "ContainerParams", "description": "Container parameters with skills to be loaded." })
export type BetaListSkillVersionsResponse = {
  readonly "data": ReadonlyArray<BetaSkillVersion>
  readonly "has_more": boolean
  readonly "next_page": string | null
}
export const BetaListSkillVersionsResponse = Schema.Struct({
  "data": Schema.Array(BetaSkillVersion).annotate({ "title": "Data", "description": "List of skill versions." }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "next_page": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Next Page",
    "description": "Token to provide in as `page` in the subsequent request to retrieve the next page of data."
  })
}).annotate({ "title": "ListSkillVersionsResponse" })
export type BetaRequestTextEditorCodeExecutionToolResultError = {
  readonly "error_code": BetaTextEditorCodeExecutionToolResultErrorCode
  readonly "error_message"?: string | null
  readonly "type": "text_editor_code_execution_tool_result_error"
}
export const BetaRequestTextEditorCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaTextEditorCodeExecutionToolResultErrorCode,
  "error_message": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message" })
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionToolResultError" })
export type BetaResponseTextEditorCodeExecutionToolResultError = {
  readonly "error_code": BetaTextEditorCodeExecutionToolResultErrorCode
  readonly "error_message": string | null
  readonly "type": "text_editor_code_execution_tool_result_error"
}
export const BetaResponseTextEditorCodeExecutionToolResultError = Schema.Struct({
  "error_code": BetaTextEditorCodeExecutionToolResultErrorCode,
  "error_message": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message", "default": null }),
  "type": Schema.Literal("text_editor_code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionToolResultError" })
export type BetaThinkingConfigParam =
  | BetaThinkingConfigEnabled
  | BetaThinkingConfigDisabled
  | BetaThinkingConfigAdaptive
export const BetaThinkingConfigParam = Schema.Union([
  BetaThinkingConfigEnabled,
  BetaThinkingConfigDisabled,
  BetaThinkingConfigAdaptive
], { mode: "oneOf" }).annotate({
  "title": "Thinking",
  "description":
    "Configuration for enabling Claude's extended thinking.\n\nWhen enabled, responses include `thinking` content blocks showing Claude's thinking process before the final answer. Requires a minimum budget of 1,024 tokens and counts towards your `max_tokens` limit.\n\nSee [extended thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking) for details."
})
export type BetaClearThinking20251015 = {
  readonly "keep"?: BetaThinkingTurns | BetaAllThinkingTurns | "all"
  readonly "type": "clear_thinking_20251015"
}
export const BetaClearThinking20251015 = Schema.Struct({
  "keep": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaThinkingTurns, BetaAllThinkingTurns], { mode: "oneOf" }), Schema.Literal("all")])
      .annotate({
        "title": "Keep",
        "description":
          "Number of most recent assistant turns to keep thinking blocks for. Older turns will have their thinking blocks removed."
      })
  ),
  "type": Schema.Literal("clear_thinking_20251015").annotate({ "title": "Type" })
}).annotate({ "title": "ClearThinking20251015" })
export type BetaToolChoice = BetaToolChoiceAuto | BetaToolChoiceAny | BetaToolChoiceTool | BetaToolChoiceNone
export const BetaToolChoice = Schema.Union([
  BetaToolChoiceAuto,
  BetaToolChoiceAny,
  BetaToolChoiceTool,
  BetaToolChoiceNone
], { mode: "oneOf" }).annotate({
  "title": "Tool Choice",
  "description":
    "How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all."
})
export type BetaRequestToolSearchToolResultError = {
  readonly "error_code": BetaToolSearchToolResultErrorCode
  readonly "type": "tool_search_tool_result_error"
}
export const BetaRequestToolSearchToolResultError = Schema.Struct({
  "error_code": BetaToolSearchToolResultErrorCode,
  "type": Schema.Literal("tool_search_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolResultError" })
export type BetaResponseToolSearchToolResultError = {
  readonly "error_code": BetaToolSearchToolResultErrorCode
  readonly "error_message": string | null
  readonly "type": "tool_search_tool_result_error"
}
export const BetaResponseToolSearchToolResultError = Schema.Struct({
  "error_code": BetaToolSearchToolResultErrorCode,
  "error_message": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message", "default": null }),
  "type": Schema.Literal("tool_search_tool_result_error").annotate({
    "title": "Type",
    "default": "tool_search_tool_result_error"
  })
}).annotate({ "title": "ResponseToolSearchToolResultError" })
export type BetaClearToolUses20250919 = {
  readonly "clear_at_least"?: BetaInputTokensClearAtLeast | null
  readonly "clear_tool_inputs"?: boolean | ReadonlyArray<string> | null
  readonly "exclude_tools"?: ReadonlyArray<string> | null
  readonly "keep"?: BetaToolUsesKeep
  readonly "trigger"?: BetaInputTokensTrigger | BetaToolUsesTrigger
  readonly "type": "clear_tool_uses_20250919"
}
export const BetaClearToolUses20250919 = Schema.Struct({
  "clear_at_least": Schema.optionalKey(
    Schema.Union([BetaInputTokensClearAtLeast, Schema.Null]).annotate({
      "description":
        "Minimum number of tokens that must be cleared when triggered. Context will only be modified if at least this many tokens can be removed."
    })
  ),
  "clear_tool_inputs": Schema.optionalKey(
    Schema.Union([Schema.Boolean, Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Clear Tool Inputs",
      "description": "Whether to clear all tool inputs (bool) or specific tool inputs to clear (list)"
    })
  ),
  "exclude_tools": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Exclude Tools",
      "description": "Tool names whose uses are preserved from clearing"
    })
  ),
  "keep": Schema.optionalKey(
    Schema.Union([BetaToolUsesKeep], { mode: "oneOf" }).annotate({
      "title": "Keep",
      "description": "Number of tool uses to retain in the conversation"
    })
  ),
  "trigger": Schema.optionalKey(
    Schema.Union([BetaInputTokensTrigger, BetaToolUsesTrigger], { mode: "oneOf" }).annotate({
      "title": "Trigger",
      "description": "Condition that triggers the context management strategy"
    })
  ),
  "type": Schema.Literal("clear_tool_uses_20250919").annotate({ "title": "Type" })
}).annotate({ "title": "ClearToolUses20250919" })
export type BetaRequestImageBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "source": BetaBase64ImageSource | BetaURLImageSource | BetaFileImageSource
  readonly "type": "image"
}
export const BetaRequestImageBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "source": Schema.Union([BetaBase64ImageSource, BetaURLImageSource, BetaFileImageSource], { mode: "oneOf" }).annotate({
    "title": "Source"
  }),
  "type": Schema.Literal("image").annotate({ "title": "Type" })
}).annotate({ "title": "RequestImageBlock" })
export type BetaWebSearchTool_20250305 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "max_uses"?: number | null
  readonly "name": "web_search"
  readonly "strict"?: boolean
  readonly "type": "web_search_20250305"
  readonly "user_location"?: BetaUserLocation | null
}
export const BetaWebSearchTool_20250305 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description":
        "If provided, only these domains will be included in results. Cannot be used alongside `blocked_domains`."
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description":
        "If provided, these domains will never appear in results. Cannot be used alongside `allowed_domains`."
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_search").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_search_20250305").annotate({ "title": "Type" }),
  "user_location": Schema.optionalKey(
    Schema.Union([BetaUserLocation, Schema.Null]).annotate({
      "description": "Parameters for the user's location. Used to provide more relevant search results."
    })
  )
}).annotate({ "title": "WebSearchTool_20250305" })
export type BetaWebSearchTool_20260209 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "max_uses"?: number | null
  readonly "name": "web_search"
  readonly "strict"?: boolean
  readonly "type": "web_search_20260209"
  readonly "user_location"?: BetaUserLocation | null
}
export const BetaWebSearchTool_20260209 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description":
        "If provided, only these domains will be included in results. Cannot be used alongside `blocked_domains`."
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description":
        "If provided, these domains will never appear in results. Cannot be used alongside `allowed_domains`."
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_search").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_search_20260209").annotate({ "title": "Type" }),
  "user_location": Schema.optionalKey(
    Schema.Union([BetaUserLocation, Schema.Null]).annotate({
      "description": "Parameters for the user's location. Used to provide more relevant search results."
    })
  )
}).annotate({ "title": "WebSearchTool_20260209" })
export type BetaRequestWebFetchToolResultError = {
  readonly "error_code": BetaWebFetchToolResultErrorCode
  readonly "type": "web_fetch_tool_result_error"
}
export const BetaRequestWebFetchToolResultError = Schema.Struct({
  "error_code": BetaWebFetchToolResultErrorCode,
  "type": Schema.Literal("web_fetch_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebFetchToolResultError" })
export type BetaResponseWebFetchToolResultError = {
  readonly "error_code": BetaWebFetchToolResultErrorCode
  readonly "type": "web_fetch_tool_result_error"
}
export const BetaResponseWebFetchToolResultError = Schema.Struct({
  "error_code": BetaWebFetchToolResultErrorCode,
  "type": Schema.Literal("web_fetch_tool_result_error").annotate({
    "title": "Type",
    "default": "web_fetch_tool_result_error"
  })
}).annotate({ "title": "ResponseWebFetchToolResultError" })
export type BetaRequestWebSearchToolResultError = {
  readonly "error_code": BetaWebSearchToolResultErrorCode
  readonly "type": "web_search_tool_result_error"
}
export const BetaRequestWebSearchToolResultError = Schema.Struct({
  "error_code": BetaWebSearchToolResultErrorCode,
  "type": Schema.Literal("web_search_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "Error" })
export type BetaResponseWebSearchToolResultError = {
  readonly "error_code": BetaWebSearchToolResultErrorCode
  readonly "type": "web_search_tool_result_error"
}
export const BetaResponseWebSearchToolResultError = Schema.Struct({
  "error_code": BetaWebSearchToolResultErrorCode,
  "type": Schema.Literal("web_search_tool_result_error").annotate({
    "title": "Type",
    "default": "web_search_tool_result_error"
  })
}).annotate({ "title": "ResponseWebSearchToolResultError" })
export type BetaListSkillsResponse = {
  readonly "data": ReadonlyArray<Betaapi__schemas__skills__Skill>
  readonly "has_more": boolean
  readonly "next_page": string | null
}
export const BetaListSkillsResponse = Schema.Struct({
  "data": Schema.Array(Betaapi__schemas__skills__Skill).annotate({ "title": "Data", "description": "List of skills." }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description":
      "Whether there are more results available.\n\nIf `true`, there are additional results that can be fetched using the `next_page` token."
  }),
  "next_page": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Next Page",
    "description":
      "Token for fetching the next page of results.\n\nIf `null`, there are no more results available. Pass this value to the `page_token` parameter in the next request to get the next page."
  })
}).annotate({ "title": "ListSkillsResponse" })
export type CodeExecutionTool_20250522 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20250522"
}
export const CodeExecutionTool_20250522 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20250522").annotate({ "title": "Type" })
}).annotate({ "title": "CodeExecutionTool_20250522" })
export type CodeExecutionTool_20250825 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20250825"
}
export const CodeExecutionTool_20250825 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20250825").annotate({ "title": "Type" })
}).annotate({ "title": "CodeExecutionTool_20250825" })
export type CodeExecutionTool_20260120 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "code_execution"
  readonly "strict"?: boolean
  readonly "type": "code_execution_20260120"
}
export const CodeExecutionTool_20260120 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("code_execution").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("code_execution_20260120").annotate({ "title": "Type" })
}).annotate({
  "title": "CodeExecutionTool_20260120",
  "description": "Code execution tool with REPL state persistence (daemon mode + gVisor checkpoint)."
})
export type RequestContainerUploadBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "file_id": string
  readonly "type": "container_upload"
}
export const RequestContainerUploadBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "file_id": Schema.String.annotate({ "title": "File Id" }),
  "type": Schema.Literal("container_upload").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestContainerUploadBlock",
  "description":
    "A content block that represents a file to be uploaded to the container\nFiles uploaded via this block will be available in the container's input directory."
})
export type RequestToolReferenceBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "tool_name": string
  readonly "type": "tool_reference"
}
export const RequestToolReferenceBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "tool_name": Schema.String.annotate({ "title": "Tool Name" }).check(Schema.isMinLength(1)).check(
    Schema.isMaxLength(256)
  ).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,256}$"))),
  "type": Schema.Literal("tool_reference").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestToolReferenceBlock",
  "description": "Tool reference block that can be included in tool_result content."
})
export type ToolSearchToolBM25_20251119 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "tool_search_tool_bm25"
  readonly "strict"?: boolean
  readonly "type": "tool_search_tool_bm25_20251119" | "tool_search_tool_bm25"
}
export const ToolSearchToolBM25_20251119 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("tool_search_tool_bm25").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literals(["tool_search_tool_bm25_20251119", "tool_search_tool_bm25"]).annotate({ "title": "Type" })
}).annotate({ "title": "ToolSearchToolBM25_20251119" })
export type ToolSearchToolRegex_20251119 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "name": "tool_search_tool_regex"
  readonly "strict"?: boolean
  readonly "type": "tool_search_tool_regex_20251119" | "tool_search_tool_regex"
}
export const ToolSearchToolRegex_20251119 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "name": Schema.Literal("tool_search_tool_regex").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literals(["tool_search_tool_regex_20251119", "tool_search_tool_regex"]).annotate({ "title": "Type" })
}).annotate({ "title": "ToolSearchToolRegex_20251119" })
export type RequestCodeExecutionToolResultError = {
  readonly "error_code": CodeExecutionToolResultErrorCode
  readonly "type": "code_execution_tool_result_error"
}
export const RequestCodeExecutionToolResultError = Schema.Struct({
  "error_code": CodeExecutionToolResultErrorCode,
  "type": Schema.Literal("code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionToolResultError" })
export type ResponseCodeExecutionToolResultError = {
  readonly "error_code": CodeExecutionToolResultErrorCode
  readonly "type": "code_execution_tool_result_error"
}
export const ResponseCodeExecutionToolResultError = Schema.Struct({
  "error_code": CodeExecutionToolResultErrorCode,
  "type": Schema.Literal("code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseCodeExecutionToolResultError" })
export type FileListResponse = {
  readonly "data": ReadonlyArray<FileMetadataSchema>
  readonly "first_id"?: string | null
  readonly "has_more"?: boolean
  readonly "last_id"?: string | null
}
export const FileListResponse = Schema.Struct({
  "data": Schema.Array(FileMetadataSchema).annotate({
    "title": "Data",
    "description": "List of file metadata objects."
  }),
  "first_id": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "First Id",
      "description": "ID of the first file in this page of results."
    })
  ),
  "has_more": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Has More",
      "description": "Whether there are more results available.",
      "default": false
    })
  ),
  "last_id": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Last Id",
      "description": "ID of the last file in this page of results."
    })
  )
}).annotate({ "title": "FileListResponse" })
export type BashTool_20250124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly "name": "bash"
  readonly "strict"?: boolean
  readonly "type": "bash_20250124"
}
export const BashTool_20250124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("bash").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("bash_20250124").annotate({ "title": "Type" })
}).annotate({ "title": "BashTool_20250124" })
export type MemoryTool_20250818 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly "name": "memory"
  readonly "strict"?: boolean
  readonly "type": "memory_20250818"
}
export const MemoryTool_20250818 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("memory").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("memory_20250818").annotate({ "title": "Type" })
}).annotate({ "title": "MemoryTool_20250818" })
export type TextEditor_20250124 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly "name": "str_replace_editor"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250124"
}
export const TextEditor_20250124 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("str_replace_editor").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250124").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250124" })
export type TextEditor_20250429 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly "name": "str_replace_based_edit_tool"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250429"
}
export const TextEditor_20250429 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  ),
  "name": Schema.Literal("str_replace_based_edit_tool").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250429").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250429" })
export type TextEditor_20250728 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly "max_characters"?: number | null
  readonly "name": "str_replace_based_edit_tool"
  readonly "strict"?: boolean
  readonly "type": "text_editor_20250728"
}
export const TextEditor_20250728 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  ),
  "max_characters": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)), Schema.Null]).annotate({
      "title": "Max Characters",
      "description":
        "Maximum number of characters to display when viewing a file. If not specified, defaults to displaying the full file."
    })
  ),
  "name": Schema.Literal("str_replace_based_edit_tool").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("text_editor_20250728").annotate({ "title": "Type" })
}).annotate({ "title": "TextEditor_20250728" })
export type Tool = {
  readonly "type"?: null | "custom"
  readonly "description"?: string
  readonly "name": string
  readonly "input_schema": {
    readonly "properties"?: { readonly [x: string]: Schema.Json } | null
    readonly "required"?: ReadonlyArray<string> | null
    readonly "type": "object"
    readonly [x: string]: Schema.Json
  }
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "strict"?: boolean
  readonly "eager_input_streaming"?: boolean | null
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "defer_loading"?: boolean
  readonly "input_examples"?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
}
export const Tool = Schema.Struct({
  "type": Schema.optionalKey(Schema.Union([Schema.Null, Schema.Literal("custom")]).annotate({ "title": "Type" })),
  "description": Schema.optionalKey(Schema.String.annotate({
    "title": "Description",
    "description":
      "Description of what this tool does.\n\nTool descriptions should be as detailed as possible. The more information that the model has about what the tool is and how to use it, the better it will perform. You can use natural language descriptions to reinforce important aspects of the tool input JSON schema."
  })),
  "name": Schema.String.annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(128)).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,128}$"))
  ),
  "input_schema": Schema.StructWithRest(
    Schema.Struct({
      "properties": Schema.optionalKey(
        Schema.Union([Schema.Record(Schema.String, Schema.Json), Schema.Null]).annotate({ "title": "Properties" })
      ),
      "required": Schema.optionalKey(
        Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({ "title": "Required" })
      ),
      "type": Schema.Literal("object").annotate({ "title": "Type" })
    }),
    [Schema.Record(Schema.String, Schema.Json)]
  ).annotate({
    "title": "InputSchema",
    "description":
      "[JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.\n\nThis defines the shape of the `input` that your tool accepts and that the model will produce."
  }),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "eager_input_streaming": Schema.optionalKey(
    Schema.Union([Schema.Boolean, Schema.Null]).annotate({
      "title": "Eager Input Streaming",
      "description":
        "Enable eager input streaming for this tool. When true, tool input parameters will be streamed incrementally as they are generated, and types will be inferred on-the-fly rather than buffering the full JSON output. When false, streaming is disabled for this tool even if the fine-grained-tool-streaming beta is active. When null (default), uses the default behavior based on beta headers."
    })
  ),
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "input_examples": Schema.optionalKey(
    Schema.Array(Schema.Record(Schema.String, JsonValue)).annotate({ "title": "Input Examples" })
  )
}).annotate({ "title": "Tool" })
export type ListResponse_MessageBatch_ = {
  readonly "data": ReadonlyArray<MessageBatch>
  readonly "first_id": string | null
  readonly "has_more": boolean
  readonly "last_id": string | null
}
export const ListResponse_MessageBatch_ = Schema.Struct({
  "data": Schema.Array(MessageBatch).annotate({ "title": "Data" }),
  "first_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "First Id",
    "description": "First ID in the `data` list. Can be used as the `before_id` for the previous page."
  }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "last_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Last Id",
    "description": "Last ID in the `data` list. Can be used as the `after_id` for the next page."
  })
}).annotate({ "title": "ListResponse[MessageBatch]" })
export type ListResponse_ModelInfo_ = {
  readonly "data": ReadonlyArray<ModelInfo>
  readonly "first_id": string | null
  readonly "has_more": boolean
  readonly "last_id": string | null
}
export const ListResponse_ModelInfo_ = Schema.Struct({
  "data": Schema.Array(ModelInfo).annotate({ "title": "Data" }),
  "first_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "First Id",
    "description": "First ID in the `data` list. Can be used as the `before_id` for the previous page."
  }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "last_id": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Last Id",
    "description": "Last ID in the `data` list. Can be used as the `after_id` for the next page."
  })
}).annotate({ "title": "ListResponse[ModelInfo]" })
export type ErrorResponse = {
  readonly "error":
    | InvalidRequestError
    | AuthenticationError
    | BillingError
    | PermissionError
    | NotFoundError
    | RateLimitError
    | GatewayTimeoutError
    | APIError
    | OverloadedError
  readonly "request_id": string | null
  readonly "type": "error"
}
export const ErrorResponse = Schema.Struct({
  "error": Schema.Union([
    InvalidRequestError,
    AuthenticationError,
    BillingError,
    PermissionError,
    NotFoundError,
    RateLimitError,
    GatewayTimeoutError,
    APIError,
    OverloadedError
  ], { mode: "oneOf" }).annotate({ "title": "Error" }),
  "request_id": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Request Id", "default": null }),
  "type": Schema.Literal("error").annotate({ "title": "Type", "default": "error" })
}).annotate({ "title": "ErrorResponse" })
export type RequestBashCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<RequestBashCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "bash_code_execution_result"
}
export const RequestBashCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(RequestBashCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("bash_code_execution_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionResultBlock" })
export type WebFetchTool_20250910 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "citations"?: RequestCitationsConfig | null
  readonly "defer_loading"?: boolean
  readonly "max_content_tokens"?: number | null
  readonly "max_uses"?: number | null
  readonly "name": "web_fetch"
  readonly "strict"?: boolean
  readonly "type": "web_fetch_20250910"
}
export const WebFetchTool_20250910 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description": "List of domains to allow fetching from"
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description": "List of domains to block fetching from"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([RequestCitationsConfig, Schema.Null]).annotate({
      "description": "Citations configuration for fetched documents. Citations are disabled by default."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_content_tokens": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Content Tokens",
      "description":
        "Maximum number of tokens used by including web page text content in the context. The limit is approximate and does not apply to binary content such as PDFs."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_fetch").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_fetch_20250910").annotate({ "title": "Type" })
}).annotate({ "title": "WebFetchTool_20250910" })
export type WebFetchTool_20260209 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "citations"?: RequestCitationsConfig | null
  readonly "defer_loading"?: boolean
  readonly "max_content_tokens"?: number | null
  readonly "max_uses"?: number | null
  readonly "name": "web_fetch"
  readonly "strict"?: boolean
  readonly "type": "web_fetch_20260209"
}
export const WebFetchTool_20260209 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description": "List of domains to allow fetching from"
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description": "List of domains to block fetching from"
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([RequestCitationsConfig, Schema.Null]).annotate({
      "description": "Citations configuration for fetched documents. Citations are disabled by default."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_content_tokens": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Content Tokens",
      "description":
        "Maximum number of tokens used by including web page text content in the context. The limit is approximate and does not apply to binary content such as PDFs."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_fetch").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_fetch_20260209").annotate({ "title": "Type" })
}).annotate({ "title": "WebFetchTool_20260209" })
export type RequestCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<RequestCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "code_execution_result"
}
export const RequestCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(RequestCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("code_execution_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionResultBlock" })
export type RequestEncryptedCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<RequestCodeExecutionOutputBlock>
  readonly "encrypted_stdout": string
  readonly "return_code": number
  readonly "stderr": string
  readonly "type": "encrypted_code_execution_result"
}
export const RequestEncryptedCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(RequestCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "encrypted_stdout": Schema.String.annotate({ "title": "Encrypted Stdout" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "type": Schema.Literal("encrypted_code_execution_result").annotate({ "title": "Type" })
}).annotate({
  "title": "RequestEncryptedCodeExecutionResultBlock",
  "description": "Code execution result with encrypted stdout for PFC + web_search results."
})
export type RequestTextBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "citations"?:
    | ReadonlyArray<
      | RequestCharLocationCitation
      | RequestPageLocationCitation
      | RequestContentBlockLocationCitation
      | RequestWebSearchResultLocationCitation
      | RequestSearchResultLocationCitation
    >
    | null
  readonly "text": string
  readonly "type": "text"
}
export const RequestTextBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(
    Schema.Union([
      Schema.Array(
        Schema.Union([
          RequestCharLocationCitation,
          RequestPageLocationCitation,
          RequestContentBlockLocationCitation,
          RequestWebSearchResultLocationCitation,
          RequestSearchResultLocationCitation
        ], { mode: "oneOf" })
      ),
      Schema.Null
    ]).annotate({ "title": "Citations" })
  ),
  "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(1)),
  "type": Schema.Literal("text").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextBlock" })
export type ResponseBashCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<ResponseBashCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "bash_code_execution_result"
}
export const ResponseBashCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(ResponseBashCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("bash_code_execution_result").annotate({
    "title": "Type",
    "default": "bash_code_execution_result"
  })
}).annotate({ "title": "ResponseBashCodeExecutionResultBlock" })
export type ResponseDocumentBlock = {
  readonly "citations": ResponseCitationsConfig | null
  readonly "source": Base64PDFSource | PlainTextSource
  readonly "title": string | null
  readonly "type": "document"
}
export const ResponseDocumentBlock = Schema.Struct({
  "citations": Schema.Union([ResponseCitationsConfig, Schema.Null]).annotate({
    "description": "Citation configuration for the document",
    "default": null
  }),
  "source": Schema.Union([Base64PDFSource, PlainTextSource], { mode: "oneOf" }).annotate({ "title": "Source" }),
  "title": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Title",
    "description": "The title of the document",
    "default": null
  }),
  "type": Schema.Literal("document").annotate({ "title": "Type", "default": "document" })
}).annotate({ "title": "ResponseDocumentBlock" })
export type ResponseCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<ResponseCodeExecutionOutputBlock>
  readonly "return_code": number
  readonly "stderr": string
  readonly "stdout": string
  readonly "type": "code_execution_result"
}
export const ResponseCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(ResponseCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "stdout": Schema.String.annotate({ "title": "Stdout" }),
  "type": Schema.Literal("code_execution_result").annotate({ "title": "Type", "default": "code_execution_result" })
}).annotate({ "title": "ResponseCodeExecutionResultBlock" })
export type ResponseEncryptedCodeExecutionResultBlock = {
  readonly "content": ReadonlyArray<ResponseCodeExecutionOutputBlock>
  readonly "encrypted_stdout": string
  readonly "return_code": number
  readonly "stderr": string
  readonly "type": "encrypted_code_execution_result"
}
export const ResponseEncryptedCodeExecutionResultBlock = Schema.Struct({
  "content": Schema.Array(ResponseCodeExecutionOutputBlock).annotate({ "title": "Content" }),
  "encrypted_stdout": Schema.String.annotate({ "title": "Encrypted Stdout" }),
  "return_code": Schema.Number.annotate({ "title": "Return Code" }).check(Schema.isInt()),
  "stderr": Schema.String.annotate({ "title": "Stderr" }),
  "type": Schema.Literal("encrypted_code_execution_result").annotate({
    "title": "Type",
    "default": "encrypted_code_execution_result"
  })
}).annotate({
  "title": "ResponseEncryptedCodeExecutionResultBlock",
  "description": "Code execution result with encrypted stdout for PFC + web_search results."
})
export type ResponseToolSearchToolSearchResultBlock = {
  readonly "tool_references": ReadonlyArray<ResponseToolReferenceBlock>
  readonly "type": "tool_search_tool_search_result"
}
export const ResponseToolSearchToolSearchResultBlock = Schema.Struct({
  "tool_references": Schema.Array(ResponseToolReferenceBlock).annotate({ "title": "Tool References" }),
  "type": Schema.Literal("tool_search_tool_search_result").annotate({
    "title": "Type",
    "default": "tool_search_tool_search_result"
  })
}).annotate({ "title": "ResponseToolSearchToolSearchResultBlock" })
export type CitationsDelta = {
  readonly "citation":
    | ResponseCharLocationCitation
    | ResponsePageLocationCitation
    | ResponseContentBlockLocationCitation
    | ResponseWebSearchResultLocationCitation
    | ResponseSearchResultLocationCitation
  readonly "type": "citations_delta"
}
export const CitationsDelta = Schema.Struct({
  "citation": Schema.Union([
    ResponseCharLocationCitation,
    ResponsePageLocationCitation,
    ResponseContentBlockLocationCitation,
    ResponseWebSearchResultLocationCitation,
    ResponseSearchResultLocationCitation
  ], { mode: "oneOf" }).annotate({ "title": "Citation" }),
  "type": Schema.Literal("citations_delta").annotate({ "title": "Type", "default": "citations_delta" })
}).annotate({ "title": "CitationsDelta" })
export type ResponseTextBlock = {
  readonly "citations"?:
    | ReadonlyArray<
      | ResponseCharLocationCitation
      | ResponsePageLocationCitation
      | ResponseContentBlockLocationCitation
      | ResponseWebSearchResultLocationCitation
      | ResponseSearchResultLocationCitation
    >
    | null
  readonly "text": string
  readonly "type": "text"
}
export const ResponseTextBlock = Schema.Struct({
  "citations": Schema.optionalKey(
    Schema.Union([
      Schema.Array(
        Schema.Union([
          ResponseCharLocationCitation,
          ResponsePageLocationCitation,
          ResponseContentBlockLocationCitation,
          ResponseWebSearchResultLocationCitation,
          ResponseSearchResultLocationCitation
        ], { mode: "oneOf" })
      ),
      Schema.Null
    ]).annotate({
      "title": "Citations",
      "description":
        "Citations supporting the text block.\n\nThe type of citation returned will depend on the type of document being cited. Citing a PDF results in `page_location`, plain text results in `char_location`, and content document results in `content_block_location`.",
      "default": null
    })
  ),
  "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(0)).check(Schema.isMaxLength(5000000)),
  "type": Schema.Literal("text").annotate({ "title": "Type", "default": "text" })
}).annotate({ "title": "ResponseTextBlock" })
export type RequestServerToolUseBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "caller"?: DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name":
    | "web_search"
    | "web_fetch"
    | "code_execution"
    | "bash_code_execution"
    | "text_editor_code_execution"
    | "tool_search_tool_regex"
    | "tool_search_tool_bm25"
  readonly "type": "server_tool_use"
}
export const RequestServerToolUseBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.Literals([
    "web_search",
    "web_fetch",
    "code_execution",
    "bash_code_execution",
    "text_editor_code_execution",
    "tool_search_tool_regex",
    "tool_search_tool_bm25"
  ]).annotate({ "title": "Name" }),
  "type": Schema.Literal("server_tool_use").annotate({ "title": "Type" })
}).annotate({ "title": "RequestServerToolUseBlock" })
export type ResponseServerToolUseBlock = {
  readonly "caller": DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name":
    | "web_search"
    | "web_fetch"
    | "code_execution"
    | "bash_code_execution"
    | "text_editor_code_execution"
    | "tool_search_tool_regex"
    | "tool_search_tool_bm25"
  readonly "type": "server_tool_use"
}
export const ResponseServerToolUseBlock = Schema.Struct({
  "caller": Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
    "title": "Caller",
    "default": { "type": "direct" }
  }),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.Literals([
    "web_search",
    "web_fetch",
    "code_execution",
    "bash_code_execution",
    "text_editor_code_execution",
    "tool_search_tool_regex",
    "tool_search_tool_bm25"
  ]).annotate({ "title": "Name" }),
  "type": Schema.Literal("server_tool_use").annotate({ "title": "Type", "default": "server_tool_use" })
}).annotate({ "title": "ResponseServerToolUseBlock" })
export type ResponseToolUseBlock = {
  readonly "caller": DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "id": string
  readonly "input": { readonly [x: string]: Schema.Json }
  readonly "name": string
  readonly "type": "tool_use"
}
export const ResponseToolUseBlock = Schema.Struct({
  "caller": Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
    "title": "Caller",
    "default": { "type": "direct" }
  }),
  "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
  "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
  "name": Schema.String.annotate({ "title": "Name" }).check(Schema.isMinLength(1)),
  "type": Schema.Literal("tool_use").annotate({ "title": "Type", "default": "tool_use" })
}).annotate({ "title": "ResponseToolUseBlock" })
export type ListSkillsResponse = {
  readonly "data": ReadonlyArray<Skill>
  readonly "has_more": boolean
  readonly "next_page": string | null
}
export const ListSkillsResponse = Schema.Struct({
  "data": Schema.Array(Skill).annotate({ "title": "Data", "description": "List of skills." }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description":
      "Whether there are more results available.\n\nIf `true`, there are additional results that can be fetched using the `next_page` token."
  }),
  "next_page": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Next Page",
    "description":
      "Token for fetching the next page of results.\n\nIf `null`, there are no more results available. Pass this value to the `page_token` parameter in the next request to get the next page."
  })
}).annotate({ "title": "ListSkillsResponse" })
export type ListSkillVersionsResponse = {
  readonly "data": ReadonlyArray<SkillVersion>
  readonly "has_more": boolean
  readonly "next_page": string | null
}
export const ListSkillVersionsResponse = Schema.Struct({
  "data": Schema.Array(SkillVersion).annotate({ "title": "Data", "description": "List of skill versions." }),
  "has_more": Schema.Boolean.annotate({
    "title": "Has More",
    "description": "Indicates if there are more results in the requested page direction."
  }),
  "next_page": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Next Page",
    "description": "Token to provide in as `page` in the subsequent request to retrieve the next page of data."
  })
}).annotate({ "title": "ListSkillVersionsResponse" })
export type RequestTextEditorCodeExecutionToolResultError = {
  readonly "error_code": TextEditorCodeExecutionToolResultErrorCode
  readonly "error_message"?: string | null
  readonly "type": "text_editor_code_execution_tool_result_error"
}
export const RequestTextEditorCodeExecutionToolResultError = Schema.Struct({
  "error_code": TextEditorCodeExecutionToolResultErrorCode,
  "error_message": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message" })
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionToolResultError" })
export type ResponseTextEditorCodeExecutionToolResultError = {
  readonly "error_code": TextEditorCodeExecutionToolResultErrorCode
  readonly "error_message": string | null
  readonly "type": "text_editor_code_execution_tool_result_error"
}
export const ResponseTextEditorCodeExecutionToolResultError = Schema.Struct({
  "error_code": TextEditorCodeExecutionToolResultErrorCode,
  "error_message": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message", "default": null }),
  "type": Schema.Literal("text_editor_code_execution_tool_result_error").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_tool_result_error"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionToolResultError" })
export type ThinkingConfigParam = ThinkingConfigEnabled | ThinkingConfigDisabled | ThinkingConfigAdaptive
export const ThinkingConfigParam = Schema.Union(
  [ThinkingConfigEnabled, ThinkingConfigDisabled, ThinkingConfigAdaptive],
  { mode: "oneOf" }
).annotate({
  "title": "Thinking",
  "description":
    "Configuration for enabling Claude's extended thinking.\n\nWhen enabled, responses include `thinking` content blocks showing Claude's thinking process before the final answer. Requires a minimum budget of 1,024 tokens and counts towards your `max_tokens` limit.\n\nSee [extended thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking) for details."
})
export type ToolChoice = ToolChoiceAuto | ToolChoiceAny | ToolChoiceTool | ToolChoiceNone
export const ToolChoice = Schema.Union([ToolChoiceAuto, ToolChoiceAny, ToolChoiceTool, ToolChoiceNone], {
  mode: "oneOf"
}).annotate({
  "title": "Tool Choice",
  "description":
    "How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all."
})
export type RequestToolSearchToolResultError = {
  readonly "error_code": ToolSearchToolResultErrorCode
  readonly "type": "tool_search_tool_result_error"
}
export const RequestToolSearchToolResultError = Schema.Struct({
  "error_code": ToolSearchToolResultErrorCode,
  "type": Schema.Literal("tool_search_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolResultError" })
export type ResponseToolSearchToolResultError = {
  readonly "error_code": ToolSearchToolResultErrorCode
  readonly "error_message": string | null
  readonly "type": "tool_search_tool_result_error"
}
export const ResponseToolSearchToolResultError = Schema.Struct({
  "error_code": ToolSearchToolResultErrorCode,
  "error_message": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Error Message", "default": null }),
  "type": Schema.Literal("tool_search_tool_result_error").annotate({
    "title": "Type",
    "default": "tool_search_tool_result_error"
  })
}).annotate({ "title": "ResponseToolSearchToolResultError" })
export type RequestImageBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "source": Base64ImageSource | URLImageSource
  readonly "type": "image"
}
export const RequestImageBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "source": Schema.Union([Base64ImageSource, URLImageSource], { mode: "oneOf" }).annotate({ "title": "Source" }),
  "type": Schema.Literal("image").annotate({ "title": "Type" })
}).annotate({ "title": "RequestImageBlock" })
export type WebSearchTool_20250305 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "max_uses"?: number | null
  readonly "name": "web_search"
  readonly "strict"?: boolean
  readonly "type": "web_search_20250305"
  readonly "user_location"?: UserLocation | null
}
export const WebSearchTool_20250305 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description":
        "If provided, only these domains will be included in results. Cannot be used alongside `blocked_domains`."
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description":
        "If provided, these domains will never appear in results. Cannot be used alongside `allowed_domains`."
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_search").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_search_20250305").annotate({ "title": "Type" }),
  "user_location": Schema.optionalKey(
    Schema.Union([UserLocation, Schema.Null]).annotate({
      "description": "Parameters for the user's location. Used to provide more relevant search results."
    })
  )
}).annotate({ "title": "WebSearchTool_20250305" })
export type WebSearchTool_20260209 = {
  readonly "allowed_callers"?: ReadonlyArray<"direct" | "code_execution_20250825" | "code_execution_20260120">
  readonly "allowed_domains"?: ReadonlyArray<string> | null
  readonly "blocked_domains"?: ReadonlyArray<string> | null
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "defer_loading"?: boolean
  readonly "max_uses"?: number | null
  readonly "name": "web_search"
  readonly "strict"?: boolean
  readonly "type": "web_search_20260209"
  readonly "user_location"?: UserLocation | null
}
export const WebSearchTool_20260209 = Schema.Struct({
  "allowed_callers": Schema.optionalKey(
    Schema.Array(Schema.Literals(["direct", "code_execution_20250825", "code_execution_20260120"])).annotate({
      "title": "Allowed Callers"
    })
  ),
  "allowed_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Allowed Domains",
      "description":
        "If provided, only these domains will be included in results. Cannot be used alongside `blocked_domains`."
    })
  ),
  "blocked_domains": Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      "title": "Blocked Domains",
      "description":
        "If provided, these domains will never appear in results. Cannot be used alongside `allowed_domains`."
    })
  ),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "defer_loading": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Defer Loading",
      "description":
        "If true, tool will not be included in initial system prompt. Only loaded when returned via tool_reference from tool search."
    })
  ),
  "max_uses": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)), Schema.Null]).annotate({
      "title": "Max Uses",
      "description": "Maximum number of times the tool can be used in the API request."
    })
  ),
  "name": Schema.Literal("web_search").annotate({
    "title": "Name",
    "description": "Name of the tool.\n\nThis is how the tool will be called by the model and in `tool_use` blocks."
  }),
  "strict": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Strict",
      "description": "When true, guarantees schema validation on tool names and inputs"
    })
  ),
  "type": Schema.Literal("web_search_20260209").annotate({ "title": "Type" }),
  "user_location": Schema.optionalKey(
    Schema.Union([UserLocation, Schema.Null]).annotate({
      "description": "Parameters for the user's location. Used to provide more relevant search results."
    })
  )
}).annotate({ "title": "WebSearchTool_20260209" })
export type RequestWebFetchToolResultError = {
  readonly "error_code": WebFetchToolResultErrorCode
  readonly "type": "web_fetch_tool_result_error"
}
export const RequestWebFetchToolResultError = Schema.Struct({
  "error_code": WebFetchToolResultErrorCode,
  "type": Schema.Literal("web_fetch_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebFetchToolResultError" })
export type ResponseWebFetchToolResultError = {
  readonly "error_code": WebFetchToolResultErrorCode
  readonly "type": "web_fetch_tool_result_error"
}
export const ResponseWebFetchToolResultError = Schema.Struct({
  "error_code": WebFetchToolResultErrorCode,
  "type": Schema.Literal("web_fetch_tool_result_error").annotate({
    "title": "Type",
    "default": "web_fetch_tool_result_error"
  })
}).annotate({ "title": "ResponseWebFetchToolResultError" })
export type RequestWebSearchToolResultError = {
  readonly "error_code": WebSearchToolResultErrorCode
  readonly "type": "web_search_tool_result_error"
}
export const RequestWebSearchToolResultError = Schema.Struct({
  "error_code": WebSearchToolResultErrorCode,
  "type": Schema.Literal("web_search_tool_result_error").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebSearchToolResultError" })
export type ResponseWebSearchToolResultError = {
  readonly "error_code": WebSearchToolResultErrorCode
  readonly "type": "web_search_tool_result_error"
}
export const ResponseWebSearchToolResultError = Schema.Struct({
  "error_code": WebSearchToolResultErrorCode,
  "type": Schema.Literal("web_search_tool_result_error").annotate({
    "title": "Type",
    "default": "web_search_tool_result_error"
  })
}).annotate({ "title": "ResponseWebSearchToolResultError" })
export type MessageDelta = {
  readonly "container": Container | null
  readonly "stop_reason": StopReason | null
  readonly "stop_sequence": string | null
}
export const MessageDelta = Schema.Struct({
  "container": Schema.Union([Container, Schema.Null]).annotate({
    "description":
      "Information about the container used in this request.\n\nThis will be non-null if a container tool (e.g. code execution) was used.",
    "default": null
  }),
  "stop_reason": Schema.Union([StopReason, Schema.Null]).annotate({ "title": "Stop Reason", "default": null }),
  "stop_sequence": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Stop Sequence", "default": null })
}).annotate({ "title": "MessageDelta" })
export type CompletionRequest = {
  readonly "model": Model
  readonly "prompt": string
  readonly "max_tokens_to_sample": number
  readonly "stop_sequences"?: ReadonlyArray<string>
  readonly "temperature"?: number
  readonly "top_p"?: number
  readonly "top_k"?: number
  readonly "metadata"?: { readonly "user_id"?: string | null }
  readonly "stream"?: boolean
}
export const CompletionRequest = Schema.Struct({
  "model": Model,
  "prompt": Schema.String.annotate({
    "title": "Prompt",
    "description":
      "The prompt that you want Claude to complete.\n\nFor proper response generation you will need to format your prompt using alternating `\\n\\nHuman:` and `\\n\\nAssistant:` conversational turns. For example:\n\n```\n\"\\n\\nHuman: {userQuestion}\\n\\nAssistant:\"\n```\n\nSee [prompt validation](https://docs.claude.com/en/api/prompt-validation) and our guide to [prompt design](https://docs.claude.com/en/docs/intro-to-prompting) for more details."
  }).check(Schema.isMinLength(1)),
  "max_tokens_to_sample": Schema.Number.annotate({
    "title": "Max Tokens To Sample",
    "description":
      "The maximum number of tokens to generate before stopping.\n\nNote that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "stop_sequences": Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      "title": "Stop Sequences",
      "description":
        "Sequences that will cause the model to stop generating.\n\nOur models stop on `\"\\n\\nHuman:\"`, and may include additional built-in stop sequences in the future. By providing the stop_sequences parameter, you may include additional strings that will cause the model to stop generating."
    })
  ),
  "temperature": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Temperature",
      "description":
        "Amount of randomness injected into the response.\n\nDefaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.\n\nNote that even with `temperature` of `0.0`, the results will not be fully deterministic."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  ),
  "top_p": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top P",
      "description":
        "Use nucleus sampling.\n\nIn nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`. You should either alter `temperature` or `top_p`, but not both.\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  ),
  "top_k": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top K",
      "description":
        "Only sample from the top K options for each subsequent token.\n\nUsed to remove \"long tail\" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
  ),
  "metadata": Schema.optionalKey(
    Schema.Struct({
      "user_id": Schema.optionalKey(
        Schema.Union([Schema.String.check(Schema.isMaxLength(256)), Schema.Null]).annotate({
          "title": "User Id",
          "description":
            "An external identifier for the user who is associated with the request.\n\nThis should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number."
        })
      )
    }).annotate({ "title": "Metadata", "description": "An object describing metadata about the request." })
  ),
  "stream": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Stream",
      "description":
        "Whether to incrementally stream the response using server-sent events.\n\nSee [streaming](https://docs.claude.com/en/api/streaming) for details."
    })
  )
}).annotate({ "title": "CompletionRequest" })
export type CompletionResponse = {
  readonly "completion": string
  readonly "id": string
  readonly "model": Model
  readonly "stop_reason": string | null
  readonly "type": "completion"
}
export const CompletionResponse = Schema.Struct({
  "completion": Schema.String.annotate({
    "title": "Completion",
    "description": "The resulting completion up to and excluding the stop sequences."
  }),
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "model": Model,
  "stop_reason": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Stop Reason",
    "description":
      "The reason that we stopped.\n\nThis may be one the following values:\n* `\"stop_sequence\"`: we reached a stop sequence — either provided by you via the `stop_sequences` parameter, or a stop sequence built into the model\n* `\"max_tokens\"`: we exceeded `max_tokens_to_sample` or the model's maximum"
  }),
  "type": Schema.Literal("completion").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Text Completions, this is always `\"completion\"`.",
    "default": "completion"
  })
}).annotate({ "title": "CompletionResponse" })
export type BetaRequestToolSearchToolSearchResultBlock = {
  readonly "tool_references": ReadonlyArray<BetaRequestToolReferenceBlock>
  readonly "type": "tool_search_tool_search_result"
}
export const BetaRequestToolSearchToolSearchResultBlock = Schema.Struct({
  "tool_references": Schema.Array(BetaRequestToolReferenceBlock).annotate({ "title": "Tool References" }),
  "type": Schema.Literal("tool_search_tool_search_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolSearchResultBlock" })
export type BetaIterationsUsage = ReadonlyArray<BetaMessageIterationUsage | BetaCompactionIterationUsage> | null
export const BetaIterationsUsage = Schema.Union([
  Schema.Array(Schema.Union([BetaMessageIterationUsage, BetaCompactionIterationUsage])),
  Schema.Null
]).annotate({
  "title": "Iterations",
  "description":
    "Per-iteration token usage breakdown.\n\nEach entry represents one sampling iteration, with its own input/output token counts and cache statistics. This allows you to:\n- Determine which iterations exceeded long context thresholds (>=200k tokens)\n- Calculate the true context window size from the last iteration\n- Understand token accumulation across server-side tool use loops",
  "default": null
})
export type BetaErroredResult = { readonly "error": BetaErrorResponse; readonly "type": "errored" }
export const BetaErroredResult = Schema.Struct({
  "error": BetaErrorResponse,
  "type": Schema.Literal("errored").annotate({ "title": "Type", "default": "errored" })
}).annotate({ "title": "ErroredResult" })
export type BetaRequestBashCodeExecutionToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content": BetaRequestBashCodeExecutionToolResultError | BetaRequestBashCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "bash_code_execution_tool_result"
}
export const BetaRequestBashCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([BetaRequestBashCodeExecutionToolResultError, BetaRequestBashCodeExecutionResultBlock])
    .annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("bash_code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionToolResultBlock" })
export type BetaRequestCodeExecutionToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content":
    | BetaRequestCodeExecutionToolResultError
    | BetaRequestCodeExecutionResultBlock
    | BetaRequestEncryptedCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "code_execution_tool_result"
}
export const BetaRequestCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([
    BetaRequestCodeExecutionToolResultError,
    BetaRequestCodeExecutionResultBlock,
    BetaRequestEncryptedCodeExecutionResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionToolResultBlock" })
export type BetaRequestSearchResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "citations"?: BetaRequestCitationsConfig
  readonly "content": ReadonlyArray<BetaRequestTextBlock>
  readonly "source": string
  readonly "title": string
  readonly "type": "search_result"
}
export const BetaRequestSearchResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(BetaRequestCitationsConfig),
  "content": Schema.Array(BetaRequestTextBlock).annotate({ "title": "Content" }),
  "source": Schema.String.annotate({ "title": "Source" }),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestSearchResultBlock" })
export type BetaResponseBashCodeExecutionToolResultBlock = {
  readonly "content": BetaResponseBashCodeExecutionToolResultError | BetaResponseBashCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "bash_code_execution_tool_result"
}
export const BetaResponseBashCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([BetaResponseBashCodeExecutionToolResultError, BetaResponseBashCodeExecutionResultBlock])
    .annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("bash_code_execution_tool_result").annotate({
    "title": "Type",
    "default": "bash_code_execution_tool_result"
  })
}).annotate({ "title": "ResponseBashCodeExecutionToolResultBlock" })
export type BetaResponseWebFetchResultBlock = {
  readonly "content": BetaResponseDocumentBlock
  readonly "retrieved_at": string | null
  readonly "type": "web_fetch_result"
  readonly "url": string
}
export const BetaResponseWebFetchResultBlock = Schema.Struct({
  "content": BetaResponseDocumentBlock,
  "retrieved_at": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Retrieved At",
    "description": "ISO 8601 timestamp when the content was retrieved",
    "default": null
  }),
  "type": Schema.Literal("web_fetch_result").annotate({ "title": "Type", "default": "web_fetch_result" }),
  "url": Schema.String.annotate({ "title": "Url", "description": "Fetched content URL" })
}).annotate({ "title": "ResponseWebFetchResultBlock" })
export type BetaResponseCodeExecutionToolResultBlock = {
  readonly "content":
    | BetaResponseCodeExecutionToolResultError
    | BetaResponseCodeExecutionResultBlock
    | BetaResponseEncryptedCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "code_execution_tool_result"
}
export const BetaResponseCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([
    BetaResponseCodeExecutionToolResultError,
    BetaResponseCodeExecutionResultBlock,
    BetaResponseEncryptedCodeExecutionResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_tool_result").annotate({
    "title": "Type",
    "default": "code_execution_tool_result"
  })
}).annotate({ "title": "ResponseCodeExecutionToolResultBlock" })
export type BetaContentBlockDeltaEvent = {
  readonly "delta":
    | BetaTextContentBlockDelta
    | BetaInputJsonContentBlockDelta
    | BetaCitationsDelta
    | BetaThinkingContentBlockDelta
    | BetaSignatureContentBlockDelta
    | BetaCompactionContentBlockDelta
  readonly "index": number
  readonly "type": "content_block_delta"
}
export const BetaContentBlockDeltaEvent = Schema.Struct({
  "delta": Schema.Union([
    BetaTextContentBlockDelta,
    BetaInputJsonContentBlockDelta,
    BetaCitationsDelta,
    BetaThinkingContentBlockDelta,
    BetaSignatureContentBlockDelta,
    BetaCompactionContentBlockDelta
  ], { mode: "oneOf" }).annotate({ "title": "Delta" }),
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_delta").annotate({ "title": "Type", "default": "content_block_delta" })
}).annotate({ "title": "ContentBlockDeltaEvent" })
export type BetaMessageDelta = {
  readonly "container"?: BetaContainer | null
  readonly "stop_reason": BetaStopReason | null
  readonly "stop_sequence": string | null
}
export const BetaMessageDelta = Schema.Struct({
  "container": Schema.optionalKey(
    Schema.Union([BetaContainer, Schema.Null]).annotate({
      "description":
        "Information about the container used in this request.\n\nThis will be non-null if a container tool (e.g. code execution) was used.",
      "default": null
    })
  ),
  "stop_reason": Schema.Union([BetaStopReason, Schema.Null]).annotate({ "title": "Stop Reason", "default": null }),
  "stop_sequence": Schema.Union([Schema.String, Schema.Null]).annotate({ "title": "Stop Sequence", "default": null })
}).annotate({ "title": "MessageDelta" })
export type BetaRequestTextEditorCodeExecutionToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content":
    | BetaRequestTextEditorCodeExecutionToolResultError
    | BetaRequestTextEditorCodeExecutionViewResultBlock
    | BetaRequestTextEditorCodeExecutionCreateResultBlock
    | BetaRequestTextEditorCodeExecutionStrReplaceResultBlock
  readonly "tool_use_id": string
  readonly "type": "text_editor_code_execution_tool_result"
}
export const BetaRequestTextEditorCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([
    BetaRequestTextEditorCodeExecutionToolResultError,
    BetaRequestTextEditorCodeExecutionViewResultBlock,
    BetaRequestTextEditorCodeExecutionCreateResultBlock,
    BetaRequestTextEditorCodeExecutionStrReplaceResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionToolResultBlock" })
export type BetaResponseTextEditorCodeExecutionToolResultBlock = {
  readonly "content":
    | BetaResponseTextEditorCodeExecutionToolResultError
    | BetaResponseTextEditorCodeExecutionViewResultBlock
    | BetaResponseTextEditorCodeExecutionCreateResultBlock
    | BetaResponseTextEditorCodeExecutionStrReplaceResultBlock
  readonly "tool_use_id": string
  readonly "type": "text_editor_code_execution_tool_result"
}
export const BetaResponseTextEditorCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([
    BetaResponseTextEditorCodeExecutionToolResultError,
    BetaResponseTextEditorCodeExecutionViewResultBlock,
    BetaResponseTextEditorCodeExecutionCreateResultBlock,
    BetaResponseTextEditorCodeExecutionStrReplaceResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_tool_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionToolResultBlock" })
export type BetaResponseToolSearchToolResultBlock = {
  readonly "content": BetaResponseToolSearchToolResultError | BetaResponseToolSearchToolSearchResultBlock
  readonly "tool_use_id": string
  readonly "type": "tool_search_tool_result"
}
export const BetaResponseToolSearchToolResultBlock = Schema.Struct({
  "content": Schema.Union([BetaResponseToolSearchToolResultError, BetaResponseToolSearchToolSearchResultBlock])
    .annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("tool_search_tool_result").annotate({ "title": "Type", "default": "tool_search_tool_result" })
}).annotate({ "title": "ResponseToolSearchToolResultBlock" })
export type BetaContextManagementConfig = {
  readonly "edits"?: ReadonlyArray<BetaClearToolUses20250919 | BetaClearThinking20251015 | BetaCompact20260112>
}
export const BetaContextManagementConfig = Schema.Struct({
  "edits": Schema.optionalKey(
    Schema.Array(
      Schema.Union([BetaClearToolUses20250919, BetaClearThinking20251015, BetaCompact20260112], { mode: "oneOf" })
    ).annotate({ "title": "Edits", "description": "List of context management edits to apply" }).check(
      Schema.isMinLength(0)
    )
  )
}).annotate({ "title": "ContextManagementConfig" })
export type BetaContentBlockSource = {
  readonly "content": string | ReadonlyArray<BetaRequestTextBlock | BetaRequestImageBlock>
  readonly "type": "content"
}
export const BetaContentBlockSource = Schema.Struct({
  "content": Schema.Union([
    Schema.String,
    Schema.Array(
      Schema.Union([BetaRequestTextBlock, BetaRequestImageBlock], { mode: "oneOf" }).annotate({
        "title": "beta_content_block_source_content_item"
      })
    ).annotate({ "title": "beta_content_block_source_content" })
  ]).annotate({ "title": "Content" }),
  "type": Schema.Literal("content").annotate({ "title": "Type" })
}).annotate({ "title": "ContentBlockSource" })
export type BetaRequestWebSearchToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "content": ReadonlyArray<BetaRequestWebSearchResultBlock> | BetaRequestWebSearchToolResultError
  readonly "tool_use_id": string
  readonly "type": "web_search_tool_result"
}
export const BetaRequestWebSearchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([
    Schema.Array(BetaRequestWebSearchResultBlock).annotate({ "title": "Result Block" }),
    BetaRequestWebSearchToolResultError
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_search_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebSearchToolResultBlock" })
export type BetaResponseWebSearchToolResultBlock = {
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "content": BetaResponseWebSearchToolResultError | ReadonlyArray<BetaResponseWebSearchResultBlock>
  readonly "tool_use_id": string
  readonly "type": "web_search_tool_result"
}
export const BetaResponseWebSearchToolResultBlock = Schema.Struct({
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([BetaResponseWebSearchToolResultError, Schema.Array(BetaResponseWebSearchResultBlock)])
    .annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_search_tool_result").annotate({ "title": "Type", "default": "web_search_tool_result" })
}).annotate({ "title": "ResponseWebSearchToolResultBlock" })
export type RequestToolSearchToolSearchResultBlock = {
  readonly "tool_references": ReadonlyArray<RequestToolReferenceBlock>
  readonly "type": "tool_search_tool_search_result"
}
export const RequestToolSearchToolSearchResultBlock = Schema.Struct({
  "tool_references": Schema.Array(RequestToolReferenceBlock).annotate({ "title": "Tool References" }),
  "type": Schema.Literal("tool_search_tool_search_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolSearchResultBlock" })
export type ErroredResult = { readonly "error": ErrorResponse; readonly "type": "errored" }
export const ErroredResult = Schema.Struct({
  "error": ErrorResponse,
  "type": Schema.Literal("errored").annotate({ "title": "Type", "default": "errored" })
}).annotate({ "title": "ErroredResult" })
export type RequestBashCodeExecutionToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "content": RequestBashCodeExecutionToolResultError | RequestBashCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "bash_code_execution_tool_result"
}
export const RequestBashCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([RequestBashCodeExecutionToolResultError, RequestBashCodeExecutionResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("bash_code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestBashCodeExecutionToolResultBlock" })
export type RequestCodeExecutionToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "content":
    | RequestCodeExecutionToolResultError
    | RequestCodeExecutionResultBlock
    | RequestEncryptedCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "code_execution_tool_result"
}
export const RequestCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([
    RequestCodeExecutionToolResultError,
    RequestCodeExecutionResultBlock,
    RequestEncryptedCodeExecutionResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestCodeExecutionToolResultBlock" })
export type RequestSearchResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "citations"?: RequestCitationsConfig
  readonly "content": ReadonlyArray<RequestTextBlock>
  readonly "source": string
  readonly "title": string
  readonly "type": "search_result"
}
export const RequestSearchResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(RequestCitationsConfig),
  "content": Schema.Array(RequestTextBlock).annotate({ "title": "Content" }),
  "source": Schema.String.annotate({ "title": "Source" }),
  "title": Schema.String.annotate({ "title": "Title" }),
  "type": Schema.Literal("search_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestSearchResultBlock" })
export type ResponseBashCodeExecutionToolResultBlock = {
  readonly "content": ResponseBashCodeExecutionToolResultError | ResponseBashCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "bash_code_execution_tool_result"
}
export const ResponseBashCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([ResponseBashCodeExecutionToolResultError, ResponseBashCodeExecutionResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("bash_code_execution_tool_result").annotate({
    "title": "Type",
    "default": "bash_code_execution_tool_result"
  })
}).annotate({ "title": "ResponseBashCodeExecutionToolResultBlock" })
export type ResponseWebFetchResultBlock = {
  readonly "content": ResponseDocumentBlock
  readonly "retrieved_at": string | null
  readonly "type": "web_fetch_result"
  readonly "url": string
}
export const ResponseWebFetchResultBlock = Schema.Struct({
  "content": ResponseDocumentBlock,
  "retrieved_at": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Retrieved At",
    "description": "ISO 8601 timestamp when the content was retrieved",
    "default": null
  }),
  "type": Schema.Literal("web_fetch_result").annotate({ "title": "Type", "default": "web_fetch_result" }),
  "url": Schema.String.annotate({ "title": "Url", "description": "Fetched content URL" })
}).annotate({ "title": "ResponseWebFetchResultBlock" })
export type ResponseCodeExecutionToolResultBlock = {
  readonly "content":
    | ResponseCodeExecutionToolResultError
    | ResponseCodeExecutionResultBlock
    | ResponseEncryptedCodeExecutionResultBlock
  readonly "tool_use_id": string
  readonly "type": "code_execution_tool_result"
}
export const ResponseCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([
    ResponseCodeExecutionToolResultError,
    ResponseCodeExecutionResultBlock,
    ResponseEncryptedCodeExecutionResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("code_execution_tool_result").annotate({
    "title": "Type",
    "default": "code_execution_tool_result"
  })
}).annotate({ "title": "ResponseCodeExecutionToolResultBlock" })
export type ContentBlockDeltaEvent = {
  readonly "delta":
    | TextContentBlockDelta
    | InputJsonContentBlockDelta
    | CitationsDelta
    | ThinkingContentBlockDelta
    | SignatureContentBlockDelta
  readonly "index": number
  readonly "type": "content_block_delta"
}
export const ContentBlockDeltaEvent = Schema.Struct({
  "delta": Schema.Union([
    TextContentBlockDelta,
    InputJsonContentBlockDelta,
    CitationsDelta,
    ThinkingContentBlockDelta,
    SignatureContentBlockDelta
  ], { mode: "oneOf" }).annotate({ "title": "Delta" }),
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_delta").annotate({ "title": "Type", "default": "content_block_delta" })
}).annotate({ "title": "ContentBlockDeltaEvent" })
export type RequestTextEditorCodeExecutionToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "content":
    | RequestTextEditorCodeExecutionToolResultError
    | RequestTextEditorCodeExecutionViewResultBlock
    | RequestTextEditorCodeExecutionCreateResultBlock
    | RequestTextEditorCodeExecutionStrReplaceResultBlock
  readonly "tool_use_id": string
  readonly "type": "text_editor_code_execution_tool_result"
}
export const RequestTextEditorCodeExecutionToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([
    RequestTextEditorCodeExecutionToolResultError,
    RequestTextEditorCodeExecutionViewResultBlock,
    RequestTextEditorCodeExecutionCreateResultBlock,
    RequestTextEditorCodeExecutionStrReplaceResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestTextEditorCodeExecutionToolResultBlock" })
export type ResponseTextEditorCodeExecutionToolResultBlock = {
  readonly "content":
    | ResponseTextEditorCodeExecutionToolResultError
    | ResponseTextEditorCodeExecutionViewResultBlock
    | ResponseTextEditorCodeExecutionCreateResultBlock
    | ResponseTextEditorCodeExecutionStrReplaceResultBlock
  readonly "tool_use_id": string
  readonly "type": "text_editor_code_execution_tool_result"
}
export const ResponseTextEditorCodeExecutionToolResultBlock = Schema.Struct({
  "content": Schema.Union([
    ResponseTextEditorCodeExecutionToolResultError,
    ResponseTextEditorCodeExecutionViewResultBlock,
    ResponseTextEditorCodeExecutionCreateResultBlock,
    ResponseTextEditorCodeExecutionStrReplaceResultBlock
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("text_editor_code_execution_tool_result").annotate({
    "title": "Type",
    "default": "text_editor_code_execution_tool_result"
  })
}).annotate({ "title": "ResponseTextEditorCodeExecutionToolResultBlock" })
export type ResponseToolSearchToolResultBlock = {
  readonly "content": ResponseToolSearchToolResultError | ResponseToolSearchToolSearchResultBlock
  readonly "tool_use_id": string
  readonly "type": "tool_search_tool_result"
}
export const ResponseToolSearchToolResultBlock = Schema.Struct({
  "content": Schema.Union([ResponseToolSearchToolResultError, ResponseToolSearchToolSearchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("tool_search_tool_result").annotate({ "title": "Type", "default": "tool_search_tool_result" })
}).annotate({ "title": "ResponseToolSearchToolResultBlock" })
export type ContentBlockSource = {
  readonly "content": string | ReadonlyArray<RequestTextBlock | RequestImageBlock>
  readonly "type": "content"
}
export const ContentBlockSource = Schema.Struct({
  "content": Schema.Union([
    Schema.String,
    Schema.Array(
      Schema.Union([RequestTextBlock, RequestImageBlock], { mode: "oneOf" }).annotate({
        "title": "content_block_source_content_item"
      })
    ).annotate({ "title": "content_block_source_content" })
  ]).annotate({ "title": "Content" }),
  "type": Schema.Literal("content").annotate({ "title": "Type" })
}).annotate({ "title": "ContentBlockSource" })
export type RequestWebSearchToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "caller"?: DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "content": ReadonlyArray<RequestWebSearchResultBlock> | RequestWebSearchToolResultError
  readonly "tool_use_id": string
  readonly "type": "web_search_tool_result"
}
export const RequestWebSearchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([
    Schema.Array(RequestWebSearchResultBlock).annotate({ "title": "web_search_tool_result_block_item" }),
    RequestWebSearchToolResultError
  ]).annotate({ "title": "Content" }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_search_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebSearchToolResultBlock" })
export type ResponseWebSearchToolResultBlock = {
  readonly "caller": DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "content": ResponseWebSearchToolResultError | ReadonlyArray<ResponseWebSearchResultBlock>
  readonly "tool_use_id": string
  readonly "type": "web_search_tool_result"
}
export const ResponseWebSearchToolResultBlock = Schema.Struct({
  "caller": Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
    "title": "Caller",
    "default": { "type": "direct" }
  }),
  "content": Schema.Union([ResponseWebSearchToolResultError, Schema.Array(ResponseWebSearchResultBlock)]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_search_tool_result").annotate({ "title": "Type", "default": "web_search_tool_result" })
}).annotate({ "title": "ResponseWebSearchToolResultBlock" })
export type MessageDeltaEvent = {
  readonly "delta": MessageDelta
  readonly "type": "message_delta"
  readonly "usage": {
    readonly "cache_creation_input_tokens": number | null
    readonly "cache_read_input_tokens": number | null
    readonly "input_tokens": number | null
    readonly "output_tokens": number
    readonly "server_tool_use"?: ServerToolUsage | null
  }
}
export const MessageDeltaEvent = Schema.Struct({
  "delta": MessageDelta,
  "type": Schema.Literal("message_delta").annotate({ "title": "Type", "default": "message_delta" }),
  "usage": Schema.Struct({
    "cache_creation_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Creation Input Tokens",
      "description": "The cumulative number of input tokens used to create the cache entry.",
      "default": null
    }),
    "cache_read_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Read Input Tokens",
      "description": "The cumulative number of input tokens read from the cache.",
      "default": null
    }),
    "input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Input Tokens",
      "description": "The cumulative number of input tokens which were used.",
      "default": null
    }),
    "output_tokens": Schema.Number.annotate({
      "title": "Output Tokens",
      "description": "The cumulative number of output tokens which were used."
    }).check(Schema.isInt()),
    "server_tool_use": Schema.optionalKey(
      Schema.Union([ServerToolUsage, Schema.Null]).annotate({
        "description": "The number of server tool requests.",
        "default": null
      })
    )
  }).annotate({
    "title": "MessageDeltaUsage",
    "description":
      "Billing and rate-limit usage.\n\nAnthropic's API bills and rate-limits by token counts, as tokens represent the underlying cost to our systems.\n\nUnder the hood, the API transforms requests into a format suitable for the model. The model's output then goes through a parsing stage before becoming an API response. As a result, the token counts in `usage` will not match one-to-one with the exact visible content of an API request or response.\n\nFor example, `output_tokens` will be non-zero, even for an empty string response from Claude.\n\nTotal input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`."
  })
}).annotate({ "title": "MessageDeltaEvent" })
export type BetaRequestToolSearchToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "content": BetaRequestToolSearchToolResultError | BetaRequestToolSearchToolSearchResultBlock
  readonly "tool_use_id": string
  readonly "type": "tool_search_tool_result"
}
export const BetaRequestToolSearchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([BetaRequestToolSearchToolResultError, BetaRequestToolSearchToolSearchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("tool_search_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolResultBlock" })
export type BetaResponseWebFetchToolResultBlock = {
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "content": BetaResponseWebFetchToolResultError | BetaResponseWebFetchResultBlock
  readonly "tool_use_id": string
  readonly "type": "web_fetch_tool_result"
}
export const BetaResponseWebFetchToolResultBlock = Schema.Struct({
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([BetaResponseWebFetchToolResultError, BetaResponseWebFetchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_fetch_tool_result").annotate({ "title": "Type", "default": "web_fetch_tool_result" })
}).annotate({ "title": "ResponseWebFetchToolResultBlock" })
export type BetaMessageDeltaEvent = {
  readonly "context_management"?: BetaResponseContextManagement | null
  readonly "delta": BetaMessageDelta
  readonly "type": "message_delta"
  readonly "usage": {
    readonly "cache_creation_input_tokens": number | null
    readonly "cache_read_input_tokens": number | null
    readonly "input_tokens": number | null
    readonly "iterations"?: BetaIterationsUsage
    readonly "output_tokens": number
    readonly "server_tool_use"?: BetaServerToolUsage | null
  }
}
export const BetaMessageDeltaEvent = Schema.Struct({
  "context_management": Schema.optionalKey(
    Schema.Union([BetaResponseContextManagement, Schema.Null]).annotate({
      "description": "Information about context management strategies applied during the request",
      "default": null
    })
  ),
  "delta": BetaMessageDelta,
  "type": Schema.Literal("message_delta").annotate({ "title": "Type", "default": "message_delta" }),
  "usage": Schema.Struct({
    "cache_creation_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Creation Input Tokens",
      "description": "The cumulative number of input tokens used to create the cache entry.",
      "default": null
    }),
    "cache_read_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Read Input Tokens",
      "description": "The cumulative number of input tokens read from the cache.",
      "default": null
    }),
    "input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Input Tokens",
      "description": "The cumulative number of input tokens which were used.",
      "default": null
    }),
    "iterations": Schema.optionalKey(BetaIterationsUsage),
    "output_tokens": Schema.Number.annotate({
      "title": "Output Tokens",
      "description": "The cumulative number of output tokens which were used."
    }).check(Schema.isInt()),
    "server_tool_use": Schema.optionalKey(
      Schema.Union([BetaServerToolUsage, Schema.Null]).annotate({
        "description": "The number of server tool requests.",
        "default": null
      })
    )
  }).annotate({
    "title": "MessageDeltaUsage",
    "description":
      "Billing and rate-limit usage.\n\nAnthropic's API bills and rate-limits by token counts, as tokens represent the underlying cost to our systems.\n\nUnder the hood, the API transforms requests into a format suitable for the model. The model's output then goes through a parsing stage before becoming an API response. As a result, the token counts in `usage` will not match one-to-one with the exact visible content of an API request or response.\n\nFor example, `output_tokens` will be non-zero, even for an empty string response from Claude.\n\nTotal input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`."
  })
}).annotate({ "title": "MessageDeltaEvent" })
export type BetaRequestDocumentBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "citations"?: BetaRequestCitationsConfig | null
  readonly "context"?: string | null
  readonly "source":
    | BetaBase64PDFSource
    | BetaPlainTextSource
    | BetaContentBlockSource
    | BetaURLPDFSource
    | BetaFileDocumentSource
  readonly "title"?: string | null
  readonly "type": "document"
}
export const BetaRequestDocumentBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(Schema.Union([BetaRequestCitationsConfig, Schema.Null])),
  "context": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Null]).annotate({ "title": "Context" })
  ),
  "source": Schema.Union([
    BetaBase64PDFSource,
    BetaPlainTextSource,
    BetaContentBlockSource,
    BetaURLPDFSource,
    BetaFileDocumentSource
  ], { mode: "oneOf" }).annotate({ "title": "Source" }),
  "title": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)), Schema.Null]).annotate({
      "title": "Title"
    })
  ),
  "type": Schema.Literal("document").annotate({ "title": "Type" })
}).annotate({ "title": "RequestDocumentBlock" })
export type RequestToolSearchToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "content": RequestToolSearchToolResultError | RequestToolSearchToolSearchResultBlock
  readonly "tool_use_id": string
  readonly "type": "tool_search_tool_result"
}
export const RequestToolSearchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "content": Schema.Union([RequestToolSearchToolResultError, RequestToolSearchToolSearchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("tool_search_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestToolSearchToolResultBlock" })
export type ResponseWebFetchToolResultBlock = {
  readonly "caller": DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "content": ResponseWebFetchToolResultError | ResponseWebFetchResultBlock
  readonly "tool_use_id": string
  readonly "type": "web_fetch_tool_result"
}
export const ResponseWebFetchToolResultBlock = Schema.Struct({
  "caller": Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
    "title": "Caller",
    "default": { "type": "direct" }
  }),
  "content": Schema.Union([ResponseWebFetchToolResultError, ResponseWebFetchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_fetch_tool_result").annotate({ "title": "Type", "default": "web_fetch_tool_result" })
}).annotate({ "title": "ResponseWebFetchToolResultBlock" })
export type RequestDocumentBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "citations"?: RequestCitationsConfig | null
  readonly "context"?: string | null
  readonly "source": Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource
  readonly "title"?: string | null
  readonly "type": "document"
}
export const RequestDocumentBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "citations": Schema.optionalKey(Schema.Union([RequestCitationsConfig, Schema.Null])),
  "context": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Null]).annotate({ "title": "Context" })
  ),
  "source": Schema.Union([Base64PDFSource, PlainTextSource, ContentBlockSource, URLPDFSource], { mode: "oneOf" })
    .annotate({ "title": "Source" }),
  "title": Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)), Schema.Null]).annotate({
      "title": "Title"
    })
  ),
  "type": Schema.Literal("document").annotate({ "title": "Type" })
}).annotate({ "title": "RequestDocumentBlock" })
export type BetaContentBlockStartEvent = {
  readonly "content_block":
    | BetaResponseTextBlock
    | BetaResponseThinkingBlock
    | BetaResponseRedactedThinkingBlock
    | BetaResponseToolUseBlock
    | BetaResponseServerToolUseBlock
    | BetaResponseWebSearchToolResultBlock
    | BetaResponseWebFetchToolResultBlock
    | BetaResponseCodeExecutionToolResultBlock
    | BetaResponseBashCodeExecutionToolResultBlock
    | BetaResponseTextEditorCodeExecutionToolResultBlock
    | BetaResponseToolSearchToolResultBlock
    | BetaResponseMCPToolUseBlock
    | BetaResponseMCPToolResultBlock
    | BetaResponseContainerUploadBlock
    | BetaResponseCompactionBlock
  readonly "index": number
  readonly "type": "content_block_start"
}
export const BetaContentBlockStartEvent = Schema.Struct({
  "content_block": Schema.Union([
    BetaResponseTextBlock,
    BetaResponseThinkingBlock,
    BetaResponseRedactedThinkingBlock,
    BetaResponseToolUseBlock,
    BetaResponseServerToolUseBlock,
    BetaResponseWebSearchToolResultBlock,
    BetaResponseWebFetchToolResultBlock,
    BetaResponseCodeExecutionToolResultBlock,
    BetaResponseBashCodeExecutionToolResultBlock,
    BetaResponseTextEditorCodeExecutionToolResultBlock,
    BetaResponseToolSearchToolResultBlock,
    BetaResponseMCPToolUseBlock,
    BetaResponseMCPToolResultBlock,
    BetaResponseContainerUploadBlock,
    BetaResponseCompactionBlock
  ], { mode: "oneOf" }).annotate({ "title": "Content Block" }),
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_start").annotate({ "title": "Type", "default": "content_block_start" })
}).annotate({ "title": "ContentBlockStartEvent" })
export type BetaContentBlock =
  | BetaResponseTextBlock
  | BetaResponseThinkingBlock
  | BetaResponseRedactedThinkingBlock
  | BetaResponseToolUseBlock
  | BetaResponseServerToolUseBlock
  | BetaResponseWebSearchToolResultBlock
  | BetaResponseWebFetchToolResultBlock
  | BetaResponseCodeExecutionToolResultBlock
  | BetaResponseBashCodeExecutionToolResultBlock
  | BetaResponseTextEditorCodeExecutionToolResultBlock
  | BetaResponseToolSearchToolResultBlock
  | BetaResponseMCPToolUseBlock
  | BetaResponseMCPToolResultBlock
  | BetaResponseContainerUploadBlock
  | BetaResponseCompactionBlock
export const BetaContentBlock = Schema.Union([
  BetaResponseTextBlock,
  BetaResponseThinkingBlock,
  BetaResponseRedactedThinkingBlock,
  BetaResponseToolUseBlock,
  BetaResponseServerToolUseBlock,
  BetaResponseWebSearchToolResultBlock,
  BetaResponseWebFetchToolResultBlock,
  BetaResponseCodeExecutionToolResultBlock,
  BetaResponseBashCodeExecutionToolResultBlock,
  BetaResponseTextEditorCodeExecutionToolResultBlock,
  BetaResponseToolSearchToolResultBlock,
  BetaResponseMCPToolUseBlock,
  BetaResponseMCPToolResultBlock,
  BetaResponseContainerUploadBlock,
  BetaResponseCompactionBlock
], { mode: "oneOf" })
export type BetaRequestWebFetchResultBlock = {
  readonly "content": BetaRequestDocumentBlock
  readonly "retrieved_at"?: string | null
  readonly "type": "web_fetch_result"
  readonly "url": string
}
export const BetaRequestWebFetchResultBlock = Schema.Struct({
  "content": BetaRequestDocumentBlock,
  "retrieved_at": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Retrieved At",
      "description": "ISO 8601 timestamp when the content was retrieved"
    })
  ),
  "type": Schema.Literal("web_fetch_result").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url", "description": "Fetched content URL" })
}).annotate({ "title": "RequestWebFetchResultBlock" })
export type ContentBlockStartEvent = {
  readonly "content_block":
    | ResponseTextBlock
    | ResponseThinkingBlock
    | ResponseRedactedThinkingBlock
    | ResponseToolUseBlock
    | ResponseServerToolUseBlock
    | ResponseWebSearchToolResultBlock
    | ResponseWebFetchToolResultBlock
    | ResponseCodeExecutionToolResultBlock
    | ResponseBashCodeExecutionToolResultBlock
    | ResponseTextEditorCodeExecutionToolResultBlock
    | ResponseToolSearchToolResultBlock
    | ResponseContainerUploadBlock
  readonly "index": number
  readonly "type": "content_block_start"
}
export const ContentBlockStartEvent = Schema.Struct({
  "content_block": Schema.Union([
    ResponseTextBlock,
    ResponseThinkingBlock,
    ResponseRedactedThinkingBlock,
    ResponseToolUseBlock,
    ResponseServerToolUseBlock,
    ResponseWebSearchToolResultBlock,
    ResponseWebFetchToolResultBlock,
    ResponseCodeExecutionToolResultBlock,
    ResponseBashCodeExecutionToolResultBlock,
    ResponseTextEditorCodeExecutionToolResultBlock,
    ResponseToolSearchToolResultBlock,
    ResponseContainerUploadBlock
  ], { mode: "oneOf" }).annotate({ "title": "Content Block" }),
  "index": Schema.Number.annotate({ "title": "Index" }).check(Schema.isInt()),
  "type": Schema.Literal("content_block_start").annotate({ "title": "Type", "default": "content_block_start" })
}).annotate({ "title": "ContentBlockStartEvent" })
export type ContentBlock =
  | ResponseTextBlock
  | ResponseThinkingBlock
  | ResponseRedactedThinkingBlock
  | ResponseToolUseBlock
  | ResponseServerToolUseBlock
  | ResponseWebSearchToolResultBlock
  | ResponseWebFetchToolResultBlock
  | ResponseCodeExecutionToolResultBlock
  | ResponseBashCodeExecutionToolResultBlock
  | ResponseTextEditorCodeExecutionToolResultBlock
  | ResponseToolSearchToolResultBlock
  | ResponseContainerUploadBlock
export const ContentBlock = Schema.Union([
  ResponseTextBlock,
  ResponseThinkingBlock,
  ResponseRedactedThinkingBlock,
  ResponseToolUseBlock,
  ResponseServerToolUseBlock,
  ResponseWebSearchToolResultBlock,
  ResponseWebFetchToolResultBlock,
  ResponseCodeExecutionToolResultBlock,
  ResponseBashCodeExecutionToolResultBlock,
  ResponseTextEditorCodeExecutionToolResultBlock,
  ResponseToolSearchToolResultBlock,
  ResponseContainerUploadBlock
], { mode: "oneOf" })
export type RequestWebFetchResultBlock = {
  readonly "content": RequestDocumentBlock
  readonly "retrieved_at"?: string | null
  readonly "type": "web_fetch_result"
  readonly "url": string
}
export const RequestWebFetchResultBlock = Schema.Struct({
  "content": RequestDocumentBlock,
  "retrieved_at": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Retrieved At",
      "description": "ISO 8601 timestamp when the content was retrieved"
    })
  ),
  "type": Schema.Literal("web_fetch_result").annotate({ "title": "Type" }),
  "url": Schema.String.annotate({ "title": "Url", "description": "Fetched content URL" })
}).annotate({ "title": "RequestWebFetchResultBlock" })
export type BetaMessage = {
  readonly "id": string
  readonly "type": "message"
  readonly "role": "assistant"
  readonly "content": ReadonlyArray<BetaContentBlock>
  readonly "model": Model
  readonly "stop_reason": BetaStopReason | null
  readonly "stop_sequence": string | null
  readonly "usage": {
    readonly "cache_creation": BetaCacheCreation | null
    readonly "cache_creation_input_tokens": number | null
    readonly "cache_read_input_tokens": number | null
    readonly "inference_geo"?: string | null
    readonly "input_tokens": number
    readonly "iterations"?: BetaIterationsUsage
    readonly "output_tokens": number
    readonly "server_tool_use"?: BetaServerToolUsage | null
    readonly "service_tier": "standard" | "priority" | "batch" | null
    readonly "speed"?: BetaSpeed | null
  }
  readonly "context_management"?: BetaResponseContextManagement | null
  readonly "container"?: BetaContainer | null
}
export const BetaMessage = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "type": Schema.Literal("message").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Messages, this is always `\"message\"`.",
    "default": "message"
  }),
  "role": Schema.Literal("assistant").annotate({
    "title": "Role",
    "description": "Conversational role of the generated message.\n\nThis will always be `\"assistant\"`.",
    "default": "assistant"
  }),
  "content": Schema.Array(BetaContentBlock).annotate({
    "title": "Content",
    "description":
      "Content generated by the model.\n\nThis is an array of content blocks, each of which has a `type` that determines its shape.\n\nExample:\n\n```json\n[{\"type\": \"text\", \"text\": \"Hi, I'm Claude.\"}]\n```\n\nIf the request input `messages` ended with an `assistant` turn, then the response `content` will continue directly from that last turn. You can use this to constrain the model's output.\n\nFor example, if the input `messages` were:\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"}\n]\n```\n\nThen the response `content` might be:\n\n```json\n[{\"type\": \"text\", \"text\": \"B)\"}]\n```"
  }),
  "model": Model,
  "stop_reason": Schema.Union([BetaStopReason, Schema.Null]).annotate({
    "title": "Stop Reason",
    "description":
      "The reason that we stopped.\n\nThis may be one the following values:\n* `\"end_turn\"`: the model reached a natural stopping point\n* `\"max_tokens\"`: we exceeded the requested `max_tokens` or the model's maximum\n* `\"stop_sequence\"`: one of your provided custom `stop_sequences` was generated\n* `\"tool_use\"`: the model invoked one or more tools\n* `\"pause_turn\"`: we paused a long-running turn. You may provide the response back as-is in a subsequent request to let the model continue.\n* `\"refusal\"`: when streaming classifiers intervene to handle potential policy violations\n\nIn non-streaming mode this value is always non-null. In streaming mode, it is null in the `message_start` event and non-null otherwise."
  }),
  "stop_sequence": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Stop Sequence",
    "description":
      "Which custom stop sequence was generated, if any.\n\nThis value will be a non-null string if one of your custom stop sequences was generated.",
    "default": null
  }),
  "usage": Schema.Struct({
    "cache_creation": Schema.Union([BetaCacheCreation, Schema.Null]).annotate({
      "description": "Breakdown of cached tokens by TTL",
      "default": null
    }),
    "cache_creation_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Creation Input Tokens",
      "description": "The number of input tokens used to create the cache entry.",
      "default": null
    }),
    "cache_read_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Read Input Tokens",
      "description": "The number of input tokens read from the cache.",
      "default": null
    }),
    "inference_geo": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Null]).annotate({
        "title": "Inference Geo",
        "description": "The geographic region where inference was performed for this request.",
        "default": null
      })
    ),
    "input_tokens": Schema.Number.annotate({
      "title": "Input Tokens",
      "description": "The number of input tokens which were used."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    "iterations": Schema.optionalKey(BetaIterationsUsage),
    "output_tokens": Schema.Number.annotate({
      "title": "Output Tokens",
      "description": "The number of output tokens which were used."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    "server_tool_use": Schema.optionalKey(
      Schema.Union([BetaServerToolUsage, Schema.Null]).annotate({
        "description": "The number of server tool requests.",
        "default": null
      })
    ),
    "service_tier": Schema.Union([Schema.Literals(["standard", "priority", "batch"]), Schema.Null]).annotate({
      "title": "Service Tier",
      "description": "If the request used the priority, standard, or batch tier.",
      "default": null
    }),
    "speed": Schema.optionalKey(
      Schema.Union([BetaSpeed, Schema.Null]).annotate({
        "description": "The inference speed mode used for this request.",
        "default": null
      })
    )
  }).annotate({
    "title": "Usage",
    "description":
      "Billing and rate-limit usage.\n\nAnthropic's API bills and rate-limits by token counts, as tokens represent the underlying cost to our systems.\n\nUnder the hood, the API transforms requests into a format suitable for the model. The model's output then goes through a parsing stage before becoming an API response. As a result, the token counts in `usage` will not match one-to-one with the exact visible content of an API request or response.\n\nFor example, `output_tokens` will be non-zero, even for an empty string response from Claude.\n\nTotal input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`."
  }),
  "context_management": Schema.optionalKey(
    Schema.Union([BetaResponseContextManagement, Schema.Null]).annotate({
      "description":
        "Context management response.\n\nInformation about context management strategies applied during the request.",
      "default": null
    })
  ),
  "container": Schema.optionalKey(
    Schema.Union([BetaContainer, Schema.Null]).annotate({
      "description":
        "Information about the container used in this request.\n\nThis will be non-null if a container tool (e.g. code execution) was used.",
      "default": null
    })
  )
}).annotate({ "title": "Message" })
export type BetaRequestWebFetchToolResultBlock = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
  readonly "content": BetaRequestWebFetchToolResultError | BetaRequestWebFetchResultBlock
  readonly "tool_use_id": string
  readonly "type": "web_fetch_tool_result"
}
export const BetaRequestWebFetchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([BetaRequestWebFetchToolResultError, BetaRequestWebFetchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_fetch_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebFetchToolResultBlock" })
export type Message = {
  readonly "id": string
  readonly "type": "message"
  readonly "role": "assistant"
  readonly "content": ReadonlyArray<ContentBlock>
  readonly "model": Model
  readonly "stop_reason": StopReason | null
  readonly "stop_sequence": string | null
  readonly "usage": {
    readonly "cache_creation": CacheCreation | null
    readonly "cache_creation_input_tokens": number | null
    readonly "cache_read_input_tokens": number | null
    readonly "inference_geo"?: string | null
    readonly "input_tokens": number
    readonly "output_tokens": number
    readonly "server_tool_use"?: ServerToolUsage | null
    readonly "service_tier": "standard" | "priority" | "batch" | null
  }
  readonly "container": Container | null
}
export const Message = Schema.Struct({
  "id": Schema.String.annotate({
    "title": "Id",
    "description": "Unique object identifier.\n\nThe format and length of IDs may change over time."
  }),
  "type": Schema.Literal("message").annotate({
    "title": "Type",
    "description": "Object type.\n\nFor Messages, this is always `\"message\"`.",
    "default": "message"
  }),
  "role": Schema.Literal("assistant").annotate({
    "title": "Role",
    "description": "Conversational role of the generated message.\n\nThis will always be `\"assistant\"`.",
    "default": "assistant"
  }),
  "content": Schema.Array(ContentBlock).annotate({
    "title": "Content",
    "description":
      "Content generated by the model.\n\nThis is an array of content blocks, each of which has a `type` that determines its shape.\n\nExample:\n\n```json\n[{\"type\": \"text\", \"text\": \"Hi, I'm Claude.\"}]\n```\n\nIf the request input `messages` ended with an `assistant` turn, then the response `content` will continue directly from that last turn. You can use this to constrain the model's output.\n\nFor example, if the input `messages` were:\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"}\n]\n```\n\nThen the response `content` might be:\n\n```json\n[{\"type\": \"text\", \"text\": \"B)\"}]\n```"
  }),
  "model": Model,
  "stop_reason": Schema.Union([StopReason, Schema.Null]).annotate({
    "title": "Stop Reason",
    "description":
      "The reason that we stopped.\n\nThis may be one the following values:\n* `\"end_turn\"`: the model reached a natural stopping point\n* `\"max_tokens\"`: we exceeded the requested `max_tokens` or the model's maximum\n* `\"stop_sequence\"`: one of your provided custom `stop_sequences` was generated\n* `\"tool_use\"`: the model invoked one or more tools\n* `\"pause_turn\"`: we paused a long-running turn. You may provide the response back as-is in a subsequent request to let the model continue.\n* `\"refusal\"`: when streaming classifiers intervene to handle potential policy violations\n\nIn non-streaming mode this value is always non-null. In streaming mode, it is null in the `message_start` event and non-null otherwise."
  }),
  "stop_sequence": Schema.Union([Schema.String, Schema.Null]).annotate({
    "title": "Stop Sequence",
    "description":
      "Which custom stop sequence was generated, if any.\n\nThis value will be a non-null string if one of your custom stop sequences was generated.",
    "default": null
  }),
  "usage": Schema.Struct({
    "cache_creation": Schema.Union([CacheCreation, Schema.Null]).annotate({
      "description": "Breakdown of cached tokens by TTL",
      "default": null
    }),
    "cache_creation_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Creation Input Tokens",
      "description": "The number of input tokens used to create the cache entry.",
      "default": null
    }),
    "cache_read_input_tokens": Schema.Union([
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.Null
    ]).annotate({
      "title": "Cache Read Input Tokens",
      "description": "The number of input tokens read from the cache.",
      "default": null
    }),
    "inference_geo": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Null]).annotate({
        "title": "Inference Geo",
        "description": "The geographic region where inference was performed for this request.",
        "default": null
      })
    ),
    "input_tokens": Schema.Number.annotate({
      "title": "Input Tokens",
      "description": "The number of input tokens which were used."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    "output_tokens": Schema.Number.annotate({
      "title": "Output Tokens",
      "description": "The number of output tokens which were used."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    "server_tool_use": Schema.optionalKey(
      Schema.Union([ServerToolUsage, Schema.Null]).annotate({
        "description": "The number of server tool requests.",
        "default": null
      })
    ),
    "service_tier": Schema.Union([Schema.Literals(["standard", "priority", "batch"]), Schema.Null]).annotate({
      "title": "Service Tier",
      "description": "If the request used the priority, standard, or batch tier.",
      "default": null
    })
  }).annotate({
    "title": "Usage",
    "description":
      "Billing and rate-limit usage.\n\nAnthropic's API bills and rate-limits by token counts, as tokens represent the underlying cost to our systems.\n\nUnder the hood, the API transforms requests into a format suitable for the model. The model's output then goes through a parsing stage before becoming an API response. As a result, the token counts in `usage` will not match one-to-one with the exact visible content of an API request or response.\n\nFor example, `output_tokens` will be non-zero, even for an empty string response from Claude.\n\nTotal input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`."
  }),
  "container": Schema.Union([Container, Schema.Null]).annotate({
    "description":
      "Information about the container used in this request.\n\nThis will be non-null if a container tool (e.g. code execution) was used.",
    "default": null
  })
}).annotate({ "title": "Message" })
export type RequestWebFetchToolResultBlock = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "caller"?: DirectCaller | ServerToolCaller | ServerToolCaller_20260120
  readonly "content": RequestWebFetchToolResultError | RequestWebFetchResultBlock
  readonly "tool_use_id": string
  readonly "type": "web_fetch_tool_result"
}
export const RequestWebFetchToolResultBlock = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description": "Create a cache control breakpoint at this content block."
    })
  ),
  "caller": Schema.optionalKey(
    Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
      "title": "Caller"
    })
  ),
  "content": Schema.Union([RequestWebFetchToolResultError, RequestWebFetchResultBlock]).annotate({
    "title": "Content"
  }),
  "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
    Schema.isPattern(new RegExp("^srvtoolu_[a-zA-Z0-9_]+$"))
  ),
  "type": Schema.Literal("web_fetch_tool_result").annotate({ "title": "Type" })
}).annotate({ "title": "RequestWebFetchToolResultBlock" })
export type BetaMessageStartEvent = { readonly "message": BetaMessage; readonly "type": "message_start" }
export const BetaMessageStartEvent = Schema.Struct({
  "message": BetaMessage,
  "type": Schema.Literal("message_start").annotate({ "title": "Type", "default": "message_start" })
}).annotate({ "title": "MessageStartEvent" })
export type BetaSucceededResult = { readonly "message": BetaMessage; readonly "type": "succeeded" }
export const BetaSucceededResult = Schema.Struct({
  "message": BetaMessage,
  "type": Schema.Literal("succeeded").annotate({ "title": "Type", "default": "succeeded" })
}).annotate({ "title": "SucceededResult" })
export type BetaInputContentBlock =
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "citations"?:
      | ReadonlyArray<
        | BetaRequestCharLocationCitation
        | BetaRequestPageLocationCitation
        | BetaRequestContentBlockLocationCitation
        | BetaRequestWebSearchResultLocationCitation
        | BetaRequestSearchResultLocationCitation
      >
      | null
    readonly "text": string
    readonly "type": "text"
  }
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "source": BetaBase64ImageSource | BetaURLImageSource | BetaFileImageSource
    readonly "type": "image"
  }
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "citations"?: BetaRequestCitationsConfig | null
    readonly "context"?: string | null
    readonly "source":
      | BetaBase64PDFSource
      | BetaPlainTextSource
      | BetaContentBlockSource
      | BetaURLPDFSource
      | BetaFileDocumentSource
    readonly "title"?: string | null
    readonly "type": "document"
  }
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "citations"?: BetaRequestCitationsConfig
    readonly "content": ReadonlyArray<BetaRequestTextBlock>
    readonly "source": string
    readonly "title": string
    readonly "type": "search_result"
  }
  | { readonly "signature": string; readonly "thinking": string; readonly "type": "thinking" }
  | { readonly "data": string; readonly "type": "redacted_thinking" }
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "caller"?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller_20260120
    readonly "id": string
    readonly "input": { readonly [x: string]: Schema.Json }
    readonly "name": string
    readonly "type": "tool_use"
  }
  | {
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "content"?:
      | string
      | ReadonlyArray<
        | BetaRequestTextBlock
        | BetaRequestImageBlock
        | BetaRequestSearchResultBlock
        | BetaRequestDocumentBlock
        | BetaRequestToolReferenceBlock
      >
    readonly "is_error"?: boolean
    readonly "tool_use_id": string
    readonly "type": "tool_result"
  }
  | BetaRequestServerToolUseBlock
  | BetaRequestWebSearchToolResultBlock
  | BetaRequestWebFetchToolResultBlock
  | BetaRequestCodeExecutionToolResultBlock
  | BetaRequestBashCodeExecutionToolResultBlock
  | BetaRequestTextEditorCodeExecutionToolResultBlock
  | BetaRequestToolSearchToolResultBlock
  | BetaRequestMCPToolUseBlock
  | BetaRequestMCPToolResultBlock
  | BetaRequestContainerUploadBlock
  | BetaRequestCompactionBlock
export const BetaInputContentBlock = Schema.Union([
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(
      Schema.Union([
        Schema.Array(
          Schema.Union([
            BetaRequestCharLocationCitation,
            BetaRequestPageLocationCitation,
            BetaRequestContentBlockLocationCitation,
            BetaRequestWebSearchResultLocationCitation,
            BetaRequestSearchResultLocationCitation
          ], { mode: "oneOf" })
        ),
        Schema.Null
      ]).annotate({ "title": "Citations" })
    ),
    "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(1)),
    "type": Schema.Literal("text").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestTextBlock", "description": "Regular text content." }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "source": Schema.Union([BetaBase64ImageSource, BetaURLImageSource, BetaFileImageSource], { mode: "oneOf" })
      .annotate({ "title": "Source" }),
    "type": Schema.Literal("image").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestImageBlock",
    "description": "Image content specified directly as base64 data or as a reference via a URL."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(Schema.Union([BetaRequestCitationsConfig, Schema.Null])),
    "context": Schema.optionalKey(
      Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Null]).annotate({ "title": "Context" })
    ),
    "source": Schema.Union([
      BetaBase64PDFSource,
      BetaPlainTextSource,
      BetaContentBlockSource,
      BetaURLPDFSource,
      BetaFileDocumentSource
    ], { mode: "oneOf" }).annotate({ "title": "Source" }),
    "title": Schema.optionalKey(
      Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)), Schema.Null]).annotate({
        "title": "Title"
      })
    ),
    "type": Schema.Literal("document").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestDocumentBlock",
    "description": "Document content, either specified directly as base64 data, as text, or as a reference via a URL."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(BetaRequestCitationsConfig),
    "content": Schema.Array(BetaRequestTextBlock).annotate({ "title": "Content" }),
    "source": Schema.String.annotate({ "title": "Source" }),
    "title": Schema.String.annotate({ "title": "Title" }),
    "type": Schema.Literal("search_result").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestSearchResultBlock",
    "description": "A search result block containing source, title, and content from search operations."
  }),
  Schema.Struct({
    "signature": Schema.String.annotate({ "title": "Signature" }),
    "thinking": Schema.String.annotate({ "title": "Thinking" }),
    "type": Schema.Literal("thinking").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestThinkingBlock", "description": "A block specifying internal thinking by the model." }),
  Schema.Struct({
    "data": Schema.String.annotate({ "title": "Data" }),
    "type": Schema.Literal("redacted_thinking").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestRedactedThinkingBlock",
    "description": "A block specifying internal, redacted thinking by the model."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "caller": Schema.optionalKey(
      Schema.Union([BetaDirectCaller, BetaServerToolCaller, BetaServerToolCaller_20260120], { mode: "oneOf" }).annotate(
        { "title": "Caller" }
      )
    ),
    "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
    "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
    "name": Schema.String.annotate({ "title": "Name" }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(200)),
    "type": Schema.Literal("tool_use").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestToolUseBlock", "description": "A block indicating a tool use by the model." }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "content": Schema.optionalKey(
      Schema.Union([
        Schema.String,
        Schema.Array(
          Schema.Union([
            BetaRequestTextBlock,
            BetaRequestImageBlock,
            BetaRequestSearchResultBlock,
            BetaRequestDocumentBlock,
            BetaRequestToolReferenceBlock
          ], { mode: "oneOf" }).annotate({ "title": "Block" })
        )
      ]).annotate({ "title": "Content" })
    ),
    "is_error": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Is Error" })),
    "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
      Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))
    ),
    "type": Schema.Literal("tool_result").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestToolResultBlock",
    "description": "A block specifying the results of a tool use by the model."
  }),
  BetaRequestServerToolUseBlock,
  BetaRequestWebSearchToolResultBlock,
  BetaRequestWebFetchToolResultBlock,
  BetaRequestCodeExecutionToolResultBlock,
  BetaRequestBashCodeExecutionToolResultBlock,
  BetaRequestTextEditorCodeExecutionToolResultBlock,
  BetaRequestToolSearchToolResultBlock,
  BetaRequestMCPToolUseBlock,
  BetaRequestMCPToolResultBlock,
  BetaRequestContainerUploadBlock,
  BetaRequestCompactionBlock
], { mode: "oneOf" })
export type MessageStartEvent = { readonly "message": Message; readonly "type": "message_start" }
export const MessageStartEvent = Schema.Struct({
  "message": Message,
  "type": Schema.Literal("message_start").annotate({ "title": "Type", "default": "message_start" })
}).annotate({ "title": "MessageStartEvent" })
export type SucceededResult = { readonly "message": Message; readonly "type": "succeeded" }
export const SucceededResult = Schema.Struct({
  "message": Message,
  "type": Schema.Literal("succeeded").annotate({ "title": "Type", "default": "succeeded" })
}).annotate({ "title": "SucceededResult" })
export type InputContentBlock =
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "citations"?:
      | ReadonlyArray<
        | RequestCharLocationCitation
        | RequestPageLocationCitation
        | RequestContentBlockLocationCitation
        | RequestWebSearchResultLocationCitation
        | RequestSearchResultLocationCitation
      >
      | null
    readonly "text": string
    readonly "type": "text"
  }
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "source": Base64ImageSource | URLImageSource
    readonly "type": "image"
  }
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "citations"?: RequestCitationsConfig | null
    readonly "context"?: string | null
    readonly "source": Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource
    readonly "title"?: string | null
    readonly "type": "document"
  }
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "citations"?: RequestCitationsConfig
    readonly "content": ReadonlyArray<RequestTextBlock>
    readonly "source": string
    readonly "title": string
    readonly "type": "search_result"
  }
  | { readonly "signature": string; readonly "thinking": string; readonly "type": "thinking" }
  | { readonly "data": string; readonly "type": "redacted_thinking" }
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "caller"?: DirectCaller | ServerToolCaller | ServerToolCaller_20260120
    readonly "id": string
    readonly "input": { readonly [x: string]: Schema.Json }
    readonly "name": string
    readonly "type": "tool_use"
  }
  | {
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "content"?:
      | string
      | ReadonlyArray<
        | RequestTextBlock
        | RequestImageBlock
        | RequestSearchResultBlock
        | RequestDocumentBlock
        | RequestToolReferenceBlock
      >
    readonly "is_error"?: boolean
    readonly "tool_use_id": string
    readonly "type": "tool_result"
  }
  | RequestServerToolUseBlock
  | RequestWebSearchToolResultBlock
  | RequestWebFetchToolResultBlock
  | RequestCodeExecutionToolResultBlock
  | RequestBashCodeExecutionToolResultBlock
  | RequestTextEditorCodeExecutionToolResultBlock
  | RequestToolSearchToolResultBlock
  | RequestContainerUploadBlock
export const InputContentBlock = Schema.Union([
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(
      Schema.Union([
        Schema.Array(
          Schema.Union([
            RequestCharLocationCitation,
            RequestPageLocationCitation,
            RequestContentBlockLocationCitation,
            RequestWebSearchResultLocationCitation,
            RequestSearchResultLocationCitation
          ], { mode: "oneOf" })
        ),
        Schema.Null
      ]).annotate({ "title": "Citations" })
    ),
    "text": Schema.String.annotate({ "title": "Text" }).check(Schema.isMinLength(1)),
    "type": Schema.Literal("text").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestTextBlock", "description": "Regular text content." }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "source": Schema.Union([Base64ImageSource, URLImageSource], { mode: "oneOf" }).annotate({ "title": "Source" }),
    "type": Schema.Literal("image").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestImageBlock",
    "description": "Image content specified directly as base64 data or as a reference via a URL."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(Schema.Union([RequestCitationsConfig, Schema.Null])),
    "context": Schema.optionalKey(
      Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Null]).annotate({ "title": "Context" })
    ),
    "source": Schema.Union([Base64PDFSource, PlainTextSource, ContentBlockSource, URLPDFSource], { mode: "oneOf" })
      .annotate({ "title": "Source" }),
    "title": Schema.optionalKey(
      Schema.Union([Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)), Schema.Null]).annotate({
        "title": "Title"
      })
    ),
    "type": Schema.Literal("document").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestDocumentBlock",
    "description": "Document content, either specified directly as base64 data, as text, or as a reference via a URL."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "citations": Schema.optionalKey(RequestCitationsConfig),
    "content": Schema.Array(RequestTextBlock).annotate({ "title": "Content" }),
    "source": Schema.String.annotate({ "title": "Source" }),
    "title": Schema.String.annotate({ "title": "Title" }),
    "type": Schema.Literal("search_result").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestSearchResultBlock",
    "description": "A search result block containing source, title, and content from search operations."
  }),
  Schema.Struct({
    "signature": Schema.String.annotate({ "title": "Signature" }),
    "thinking": Schema.String.annotate({ "title": "Thinking" }),
    "type": Schema.Literal("thinking").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestThinkingBlock", "description": "A block specifying internal thinking by the model." }),
  Schema.Struct({
    "data": Schema.String.annotate({ "title": "Data" }),
    "type": Schema.Literal("redacted_thinking").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestRedactedThinkingBlock",
    "description": "A block specifying internal, redacted thinking by the model."
  }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "caller": Schema.optionalKey(
      Schema.Union([DirectCaller, ServerToolCaller, ServerToolCaller_20260120], { mode: "oneOf" }).annotate({
        "title": "Caller"
      })
    ),
    "id": Schema.String.annotate({ "title": "Id" }).check(Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))),
    "input": Schema.Record(Schema.String, Schema.Json).annotate({ "title": "Input" }),
    "name": Schema.String.annotate({ "title": "Name" }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(200)),
    "type": Schema.Literal("tool_use").annotate({ "title": "Type" })
  }).annotate({ "title": "RequestToolUseBlock", "description": "A block indicating a tool use by the model." }),
  Schema.Struct({
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description": "Create a cache control breakpoint at this content block."
      })
    ),
    "content": Schema.optionalKey(
      Schema.Union([
        Schema.String,
        Schema.Array(
          Schema.Union([
            RequestTextBlock,
            RequestImageBlock,
            RequestSearchResultBlock,
            RequestDocumentBlock,
            RequestToolReferenceBlock
          ], { mode: "oneOf" }).annotate({ "title": "Block" })
        )
      ]).annotate({ "title": "Content" })
    ),
    "is_error": Schema.optionalKey(Schema.Boolean.annotate({ "title": "Is Error" })),
    "tool_use_id": Schema.String.annotate({ "title": "Tool Use Id" }).check(
      Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]+$"))
    ),
    "type": Schema.Literal("tool_result").annotate({ "title": "Type" })
  }).annotate({
    "title": "RequestToolResultBlock",
    "description": "A block specifying the results of a tool use by the model."
  }),
  RequestServerToolUseBlock,
  RequestWebSearchToolResultBlock,
  RequestWebFetchToolResultBlock,
  RequestCodeExecutionToolResultBlock,
  RequestBashCodeExecutionToolResultBlock,
  RequestTextEditorCodeExecutionToolResultBlock,
  RequestToolSearchToolResultBlock,
  RequestContainerUploadBlock
], { mode: "oneOf" })
export type BetaInputMessage = {
  readonly "content": string | ReadonlyArray<BetaInputContentBlock>
  readonly "role": "user" | "assistant" | "system"
}
export const BetaInputMessage = Schema.Struct({
  "content": Schema.Union([Schema.String, Schema.Array(BetaInputContentBlock)]).annotate({ "title": "Content" }),
  "role": Schema.Literals(["user", "assistant", "system"]).annotate({ "title": "Role" })
}).annotate({ "title": "InputMessage", "identifier": "BetaInputMessage" })
export type InputMessage = {
  readonly "content": string | ReadonlyArray<InputContentBlock>
  readonly "role": "user" | "assistant" | "system"
}
export const InputMessage = Schema.Struct({
  "content": Schema.Union([Schema.String, Schema.Array(InputContentBlock)]).annotate({ "title": "Content" }),
  "role": Schema.Literals(["user", "assistant", "system"]).annotate({ "title": "Role" })
}).annotate({ "title": "InputMessage", "identifier": "InputMessage" })
export type BetaCountMessageTokensParams = {
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "context_management"?: BetaContextManagementConfig | null
  readonly "mcp_servers"?: ReadonlyArray<BetaRequestMCPServerURLDefinition>
  readonly "messages": ReadonlyArray<BetaInputMessage>
  readonly "model": Model
  readonly "output_config"?: {
    readonly "effort"?: BetaEffortLevel | null
    readonly "format"?: BetaJsonOutputFormat | null
  }
  readonly "output_format"?: BetaJsonOutputFormat | null
  readonly "speed"?: BetaSpeed | null
  readonly "system"?: string | ReadonlyArray<BetaRequestTextBlock>
  readonly "thinking"?: BetaThinkingConfigParam
  readonly "tool_choice"?: BetaToolChoice
  readonly "tools"?: ReadonlyArray<
    | BetaTool
    | BetaBashTool_20241022
    | BetaBashTool_20250124
    | BetaCodeExecutionTool_20250522
    | BetaCodeExecutionTool_20250825
    | BetaCodeExecutionTool_20260120
    | BetaComputerUseTool_20241022
    | BetaMemoryTool_20250818
    | BetaComputerUseTool_20250124
    | BetaTextEditor_20241022
    | BetaComputerUseTool_20251124
    | BetaTextEditor_20250124
    | BetaTextEditor_20250429
    | BetaTextEditor_20250728
    | BetaWebSearchTool_20250305
    | BetaWebFetchTool_20250910
    | BetaWebSearchTool_20260209
    | BetaWebFetchTool_20260209
    | BetaToolSearchToolBM25_20251119
    | BetaToolSearchToolRegex_20251119
    | BetaMCPToolset
  >
}
export const BetaCountMessageTokensParams = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description":
        "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
    })
  ),
  "context_management": Schema.optionalKey(
    Schema.Union([BetaContextManagementConfig, Schema.Null]).annotate({
      "description":
        "Context management configuration.\n\nThis allows you to control how Claude manages context across multiple requests, such as whether to clear function results or not."
    })
  ),
  "mcp_servers": Schema.optionalKey(
    Schema.Array(BetaRequestMCPServerURLDefinition).annotate({
      "title": "Mcp Servers",
      "description": "MCP servers to be utilized in this request"
    }).check(Schema.isMaxLength(20))
  ),
  "messages": Schema.Array(BetaInputMessage).annotate({
    "title": "Messages",
    "description":
      "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
  }),
  "model": Model,
  "output_config": Schema.optionalKey(
    Schema.Struct({
      "effort": Schema.optionalKey(
        Schema.Union([BetaEffortLevel, Schema.Null]).annotate({
          "description":
            "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
        })
      ),
      "format": Schema.optionalKey(
        Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
          "description":
            "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
        })
      )
    }).annotate({
      "title": "OutputConfig",
      "description": "Configuration options for the model's output, such as the output format."
    })
  ),
  "output_format": Schema.optionalKey(
    Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
      "description":
        "Deprecated: Use `output_config.format` instead. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)\n\nA schema to specify Claude's output format in responses. This parameter will be removed in a future release."
    })
  ),
  "speed": Schema.optionalKey(
    Schema.Union([BetaSpeed, Schema.Null]).annotate({
      "description":
        "The inference speed mode for this request. `\"fast\"` enables high output-tokens-per-second inference."
    })
  ),
  "system": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(BetaRequestTextBlock)]).annotate({
      "title": "System",
      "description":
        "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
    })
  ),
  "thinking": Schema.optionalKey(BetaThinkingConfigParam),
  "tool_choice": Schema.optionalKey(BetaToolChoice),
  "tools": Schema.optionalKey(
    Schema.Array(
      Schema.Union([
        BetaTool,
        BetaBashTool_20241022,
        BetaBashTool_20250124,
        BetaCodeExecutionTool_20250522,
        BetaCodeExecutionTool_20250825,
        BetaCodeExecutionTool_20260120,
        BetaComputerUseTool_20241022,
        BetaMemoryTool_20250818,
        BetaComputerUseTool_20250124,
        BetaTextEditor_20241022,
        BetaComputerUseTool_20251124,
        BetaTextEditor_20250124,
        BetaTextEditor_20250429,
        BetaTextEditor_20250728,
        BetaWebSearchTool_20250305,
        BetaWebFetchTool_20250910,
        BetaWebSearchTool_20260209,
        BetaWebFetchTool_20260209,
        BetaToolSearchToolBM25_20251119,
        BetaToolSearchToolRegex_20251119,
        BetaMCPToolset
      ], { mode: "oneOf" })
    ).annotate({
      "title": "Tools",
      "description":
        "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
    })
  )
}).annotate({ "title": "CountMessageTokensParams" })
export type BetaCreateMessageParams = {
  readonly "model": Model
  readonly "messages": ReadonlyArray<BetaInputMessage>
  readonly "cache_control"?: BetaCacheControlEphemeral | null
  readonly "container"?: BetaContainerParams | string | null
  readonly "context_management"?: BetaContextManagementConfig | null
  readonly "inference_geo"?: string | null
  readonly "max_tokens": number
  readonly "mcp_servers"?: ReadonlyArray<BetaRequestMCPServerURLDefinition>
  readonly "metadata"?: { readonly "user_id"?: string | null }
  readonly "output_config"?: {
    readonly "effort"?: BetaEffortLevel | null
    readonly "format"?: BetaJsonOutputFormat | null
  }
  readonly "output_format"?: BetaJsonOutputFormat | null
  readonly "service_tier"?: "auto" | "standard_only"
  readonly "speed"?: BetaSpeed | null
  readonly "stop_sequences"?: ReadonlyArray<string>
  readonly "stream"?: boolean
  readonly "system"?: string | ReadonlyArray<BetaRequestTextBlock>
  readonly "temperature"?: number
  readonly "thinking"?: BetaThinkingConfigParam
  readonly "tool_choice"?: BetaToolChoice
  readonly "tools"?: ReadonlyArray<
    | BetaTool
    | BetaBashTool_20241022
    | BetaBashTool_20250124
    | BetaCodeExecutionTool_20250522
    | BetaCodeExecutionTool_20250825
    | BetaCodeExecutionTool_20260120
    | BetaComputerUseTool_20241022
    | BetaMemoryTool_20250818
    | BetaComputerUseTool_20250124
    | BetaTextEditor_20241022
    | BetaComputerUseTool_20251124
    | BetaTextEditor_20250124
    | BetaTextEditor_20250429
    | BetaTextEditor_20250728
    | BetaWebSearchTool_20250305
    | BetaWebFetchTool_20250910
    | BetaWebSearchTool_20260209
    | BetaWebFetchTool_20260209
    | BetaToolSearchToolBM25_20251119
    | BetaToolSearchToolRegex_20251119
    | BetaMCPToolset
  >
  readonly "top_k"?: number
  readonly "top_p"?: number
}
export const BetaCreateMessageParams = Schema.Struct({
  "model": Model,
  "messages": Schema.Array(BetaInputMessage).annotate({
    "title": "Messages",
    "description":
      "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
  }),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description":
        "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
    })
  ),
  "container": Schema.optionalKey(
    Schema.Union([BetaContainerParams, Schema.String, Schema.Null]).annotate({
      "title": "Container",
      "description": "Container identifier for reuse across requests."
    })
  ),
  "context_management": Schema.optionalKey(
    Schema.Union([BetaContextManagementConfig, Schema.Null]).annotate({
      "description":
        "Context management configuration.\n\nThis allows you to control how Claude manages context across multiple requests, such as whether to clear function results or not."
    })
  ),
  "inference_geo": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Inference Geo",
      "description":
        "Specifies the geographic region for inference processing. If not specified, the workspace's `default_inference_geo` is used."
    })
  ),
  "max_tokens": Schema.Number.annotate({
    "title": "Max Tokens",
    "description":
      "The maximum number of tokens to generate before stopping.\n\nNote that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate.\n\nDifferent models have different maximum values for this parameter.  See [models](https://docs.claude.com/en/docs/models-overview) for details."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "mcp_servers": Schema.optionalKey(
    Schema.Array(BetaRequestMCPServerURLDefinition).annotate({
      "title": "Mcp Servers",
      "description": "MCP servers to be utilized in this request"
    }).check(Schema.isMaxLength(20))
  ),
  "metadata": Schema.optionalKey(
    Schema.Struct({
      "user_id": Schema.optionalKey(
        Schema.Union([Schema.String.check(Schema.isMaxLength(256)), Schema.Null]).annotate({
          "title": "User Id",
          "description":
            "An external identifier for the user who is associated with the request.\n\nThis should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number."
        })
      )
    }).annotate({ "title": "Metadata", "description": "An object describing metadata about the request." })
  ),
  "output_config": Schema.optionalKey(
    Schema.Struct({
      "effort": Schema.optionalKey(
        Schema.Union([BetaEffortLevel, Schema.Null]).annotate({
          "description":
            "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
        })
      ),
      "format": Schema.optionalKey(
        Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
          "description":
            "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
        })
      )
    }).annotate({
      "title": "OutputConfig",
      "description": "Configuration options for the model's output, such as the output format."
    })
  ),
  "output_format": Schema.optionalKey(
    Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
      "description":
        "Deprecated: Use `output_config.format` instead. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)\n\nA schema to specify Claude's output format in responses. This parameter will be removed in a future release."
    })
  ),
  "service_tier": Schema.optionalKey(
    Schema.Literals(["auto", "standard_only"]).annotate({
      "title": "Service Tier",
      "description":
        "Determines whether to use priority capacity (if available) or standard capacity for this request.\n\nAnthropic offers different levels of service for your API requests. See [service-tiers](https://docs.claude.com/en/api/service-tiers) for details."
    })
  ),
  "speed": Schema.optionalKey(
    Schema.Union([BetaSpeed, Schema.Null]).annotate({
      "description":
        "The inference speed mode for this request. `\"fast\"` enables high output-tokens-per-second inference."
    })
  ),
  "stop_sequences": Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      "title": "Stop Sequences",
      "description":
        "Custom text sequences that will cause the model to stop generating.\n\nOur models will normally stop when they have naturally completed their turn, which will result in a response `stop_reason` of `\"end_turn\"`.\n\nIf you want the model to stop generating when it encounters custom strings of text, you can use the `stop_sequences` parameter. If the model encounters one of the custom sequences, the response `stop_reason` value will be `\"stop_sequence\"` and the response `stop_sequence` value will contain the matched stop sequence."
    })
  ),
  "stream": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Stream",
      "description":
        "Whether to incrementally stream the response using server-sent events.\n\nSee [streaming](https://docs.claude.com/en/api/messages-streaming) for details."
    })
  ),
  "system": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(BetaRequestTextBlock)]).annotate({
      "title": "System",
      "description":
        "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
    })
  ),
  "temperature": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Temperature",
      "description":
        "Amount of randomness injected into the response.\n\nDefaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.\n\nNote that even with `temperature` of `0.0`, the results will not be fully deterministic."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  ),
  "thinking": Schema.optionalKey(BetaThinkingConfigParam),
  "tool_choice": Schema.optionalKey(BetaToolChoice),
  "tools": Schema.optionalKey(
    Schema.Array(
      Schema.Union([
        BetaTool,
        BetaBashTool_20241022,
        BetaBashTool_20250124,
        BetaCodeExecutionTool_20250522,
        BetaCodeExecutionTool_20250825,
        BetaCodeExecutionTool_20260120,
        BetaComputerUseTool_20241022,
        BetaMemoryTool_20250818,
        BetaComputerUseTool_20250124,
        BetaTextEditor_20241022,
        BetaComputerUseTool_20251124,
        BetaTextEditor_20250124,
        BetaTextEditor_20250429,
        BetaTextEditor_20250728,
        BetaWebSearchTool_20250305,
        BetaWebFetchTool_20250910,
        BetaWebSearchTool_20260209,
        BetaWebFetchTool_20260209,
        BetaToolSearchToolBM25_20251119,
        BetaToolSearchToolRegex_20251119,
        BetaMCPToolset
      ], { mode: "oneOf" })
    ).annotate({
      "title": "Tools",
      "description":
        "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
    })
  ),
  "top_k": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top K",
      "description":
        "Only sample from the top K options for each subsequent token.\n\nUsed to remove \"long tail\" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
  ),
  "top_p": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top P",
      "description":
        "Use nucleus sampling.\n\nIn nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`. You should either alter `temperature` or `top_p`, but not both.\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  )
}).annotate({ "title": "CreateMessageParams" })
export type BetaMessageBatchIndividualRequestParams = {
  readonly "custom_id": string
  readonly "params": {
    readonly "model": Model
    readonly "messages": ReadonlyArray<BetaInputMessage>
    readonly "cache_control"?: BetaCacheControlEphemeral | null
    readonly "container"?: BetaContainerParams | string | null
    readonly "context_management"?: BetaContextManagementConfig | null
    readonly "inference_geo"?: string | null
    readonly "max_tokens": number
    readonly "mcp_servers"?: ReadonlyArray<BetaRequestMCPServerURLDefinition>
    readonly "metadata"?: { readonly "user_id"?: string | null }
    readonly "output_config"?: {
      readonly "effort"?: BetaEffortLevel | null
      readonly "format"?: BetaJsonOutputFormat | null
    }
    readonly "output_format"?: BetaJsonOutputFormat | null
    readonly "service_tier"?: "auto" | "standard_only"
    readonly "speed"?: BetaSpeed | null
    readonly "stop_sequences"?: ReadonlyArray<string>
    readonly "stream"?: boolean
    readonly "system"?: string | ReadonlyArray<BetaRequestTextBlock>
    readonly "temperature"?: number
    readonly "thinking"?: BetaThinkingConfigParam
    readonly "tool_choice"?: BetaToolChoice
    readonly "tools"?: ReadonlyArray<
      | BetaTool
      | BetaBashTool_20241022
      | BetaBashTool_20250124
      | BetaCodeExecutionTool_20250522
      | BetaCodeExecutionTool_20250825
      | BetaCodeExecutionTool_20260120
      | BetaComputerUseTool_20241022
      | BetaMemoryTool_20250818
      | BetaComputerUseTool_20250124
      | BetaTextEditor_20241022
      | BetaComputerUseTool_20251124
      | BetaTextEditor_20250124
      | BetaTextEditor_20250429
      | BetaTextEditor_20250728
      | BetaWebSearchTool_20250305
      | BetaWebFetchTool_20250910
      | BetaWebSearchTool_20260209
      | BetaWebFetchTool_20260209
      | BetaToolSearchToolBM25_20251119
      | BetaToolSearchToolRegex_20251119
      | BetaMCPToolset
    >
    readonly "top_k"?: number
    readonly "top_p"?: number
  }
}
export const BetaMessageBatchIndividualRequestParams = Schema.Struct({
  "custom_id": Schema.String.annotate({
    "title": "Custom Id",
    "description":
      "Developer-provided ID created for each request in a Message Batch. Useful for matching results to requests, as results may be given out of request order.\n\nMust be unique for each request within the Message Batch."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,64}$"))
  ),
  "params": Schema.Struct({
    "model": Model,
    "messages": Schema.Array(BetaInputMessage).annotate({
      "title": "Messages",
      "description":
        "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
    }),
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([BetaCacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description":
          "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
      })
    ),
    "container": Schema.optionalKey(
      Schema.Union([BetaContainerParams, Schema.String, Schema.Null]).annotate({
        "title": "Container",
        "description": "Container identifier for reuse across requests."
      })
    ),
    "context_management": Schema.optionalKey(
      Schema.Union([BetaContextManagementConfig, Schema.Null]).annotate({
        "description":
          "Context management configuration.\n\nThis allows you to control how Claude manages context across multiple requests, such as whether to clear function results or not."
      })
    ),
    "inference_geo": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Null]).annotate({
        "title": "Inference Geo",
        "description":
          "Specifies the geographic region for inference processing. If not specified, the workspace's `default_inference_geo` is used."
      })
    ),
    "max_tokens": Schema.Number.annotate({
      "title": "Max Tokens",
      "description":
        "The maximum number of tokens to generate before stopping.\n\nNote that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate.\n\nDifferent models have different maximum values for this parameter.  See [models](https://docs.claude.com/en/docs/models-overview) for details."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
    "mcp_servers": Schema.optionalKey(
      Schema.Array(BetaRequestMCPServerURLDefinition).annotate({
        "title": "Mcp Servers",
        "description": "MCP servers to be utilized in this request"
      }).check(Schema.isMaxLength(20))
    ),
    "metadata": Schema.optionalKey(
      Schema.Struct({
        "user_id": Schema.optionalKey(
          Schema.Union([Schema.String.check(Schema.isMaxLength(256)), Schema.Null]).annotate({
            "title": "User Id",
            "description":
              "An external identifier for the user who is associated with the request.\n\nThis should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number."
          })
        )
      }).annotate({ "title": "Metadata", "description": "An object describing metadata about the request." })
    ),
    "output_config": Schema.optionalKey(
      Schema.Struct({
        "effort": Schema.optionalKey(
          Schema.Union([BetaEffortLevel, Schema.Null]).annotate({
            "description":
              "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
          })
        ),
        "format": Schema.optionalKey(
          Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
            "description":
              "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
          })
        )
      }).annotate({
        "title": "OutputConfig",
        "description": "Configuration options for the model's output, such as the output format."
      })
    ),
    "output_format": Schema.optionalKey(
      Schema.Union([BetaJsonOutputFormat, Schema.Null]).annotate({
        "description":
          "Deprecated: Use `output_config.format` instead. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)\n\nA schema to specify Claude's output format in responses. This parameter will be removed in a future release."
      })
    ),
    "service_tier": Schema.optionalKey(
      Schema.Literals(["auto", "standard_only"]).annotate({
        "title": "Service Tier",
        "description":
          "Determines whether to use priority capacity (if available) or standard capacity for this request.\n\nAnthropic offers different levels of service for your API requests. See [service-tiers](https://docs.claude.com/en/api/service-tiers) for details."
      })
    ),
    "speed": Schema.optionalKey(
      Schema.Union([BetaSpeed, Schema.Null]).annotate({
        "description":
          "The inference speed mode for this request. `\"fast\"` enables high output-tokens-per-second inference."
      })
    ),
    "stop_sequences": Schema.optionalKey(
      Schema.Array(Schema.String).annotate({
        "title": "Stop Sequences",
        "description":
          "Custom text sequences that will cause the model to stop generating.\n\nOur models will normally stop when they have naturally completed their turn, which will result in a response `stop_reason` of `\"end_turn\"`.\n\nIf you want the model to stop generating when it encounters custom strings of text, you can use the `stop_sequences` parameter. If the model encounters one of the custom sequences, the response `stop_reason` value will be `\"stop_sequence\"` and the response `stop_sequence` value will contain the matched stop sequence."
      })
    ),
    "stream": Schema.optionalKey(
      Schema.Boolean.annotate({
        "title": "Stream",
        "description":
          "Whether to incrementally stream the response using server-sent events.\n\nSee [streaming](https://docs.claude.com/en/api/messages-streaming) for details."
      })
    ),
    "system": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Array(BetaRequestTextBlock)]).annotate({
        "title": "System",
        "description":
          "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
      })
    ),
    "temperature": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Temperature",
        "description":
          "Amount of randomness injected into the response.\n\nDefaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.\n\nNote that even with `temperature` of `0.0`, the results will not be fully deterministic."
      }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
    ),
    "thinking": Schema.optionalKey(BetaThinkingConfigParam),
    "tool_choice": Schema.optionalKey(BetaToolChoice),
    "tools": Schema.optionalKey(
      Schema.Array(
        Schema.Union([
          BetaTool,
          BetaBashTool_20241022,
          BetaBashTool_20250124,
          BetaCodeExecutionTool_20250522,
          BetaCodeExecutionTool_20250825,
          BetaCodeExecutionTool_20260120,
          BetaComputerUseTool_20241022,
          BetaMemoryTool_20250818,
          BetaComputerUseTool_20250124,
          BetaTextEditor_20241022,
          BetaComputerUseTool_20251124,
          BetaTextEditor_20250124,
          BetaTextEditor_20250429,
          BetaTextEditor_20250728,
          BetaWebSearchTool_20250305,
          BetaWebFetchTool_20250910,
          BetaWebSearchTool_20260209,
          BetaWebFetchTool_20260209,
          BetaToolSearchToolBM25_20251119,
          BetaToolSearchToolRegex_20251119,
          BetaMCPToolset
        ], { mode: "oneOf" })
      ).annotate({
        "title": "Tools",
        "description":
          "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
      })
    ),
    "top_k": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Top K",
        "description":
          "Only sample from the top K options for each subsequent token.\n\nUsed to remove \"long tail\" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
      }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
    ),
    "top_p": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Top P",
        "description":
          "Use nucleus sampling.\n\nIn nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`. You should either alter `temperature` or `top_p`, but not both.\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
      }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
    )
  }).annotate({
    "title": "CreateMessageParams",
    "description":
      "Messages API creation parameters for the individual request.\n\nSee the [Messages API reference](https://docs.claude.com/en/api/messages) for full documentation on available parameters."
  })
}).annotate({ "title": "MessageBatchIndividualRequestParams" })
export type CountMessageTokensParams = {
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "messages": ReadonlyArray<InputMessage>
  readonly "model": Model
  readonly "output_config"?: { readonly "effort"?: EffortLevel | null; readonly "format"?: JsonOutputFormat | null }
  readonly "system"?: string | ReadonlyArray<RequestTextBlock>
  readonly "thinking"?: ThinkingConfigParam
  readonly "tool_choice"?: ToolChoice
  readonly "tools"?: ReadonlyArray<
    | Tool
    | BashTool_20250124
    | CodeExecutionTool_20250522
    | CodeExecutionTool_20250825
    | CodeExecutionTool_20260120
    | MemoryTool_20250818
    | TextEditor_20250124
    | TextEditor_20250429
    | TextEditor_20250728
    | WebSearchTool_20250305
    | WebFetchTool_20250910
    | WebSearchTool_20260209
    | WebFetchTool_20260209
    | ToolSearchToolBM25_20251119
    | ToolSearchToolRegex_20251119
  >
}
export const CountMessageTokensParams = Schema.Struct({
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description":
        "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
    })
  ),
  "messages": Schema.Array(InputMessage).annotate({
    "title": "Messages",
    "description":
      "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
  }),
  "model": Model,
  "output_config": Schema.optionalKey(
    Schema.Struct({
      "effort": Schema.optionalKey(
        Schema.Union([EffortLevel, Schema.Null]).annotate({
          "description":
            "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
        })
      ),
      "format": Schema.optionalKey(
        Schema.Union([JsonOutputFormat, Schema.Null]).annotate({
          "description":
            "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
        })
      )
    }).annotate({
      "title": "OutputConfig",
      "description": "Configuration options for the model's output, such as the output format."
    })
  ),
  "system": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(RequestTextBlock)]).annotate({
      "title": "System",
      "description":
        "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
    })
  ),
  "thinking": Schema.optionalKey(ThinkingConfigParam),
  "tool_choice": Schema.optionalKey(ToolChoice),
  "tools": Schema.optionalKey(
    Schema.Array(
      Schema.Union([
        Tool,
        BashTool_20250124,
        CodeExecutionTool_20250522,
        CodeExecutionTool_20250825,
        CodeExecutionTool_20260120,
        MemoryTool_20250818,
        TextEditor_20250124,
        TextEditor_20250429,
        TextEditor_20250728,
        WebSearchTool_20250305,
        WebFetchTool_20250910,
        WebSearchTool_20260209,
        WebFetchTool_20260209,
        ToolSearchToolBM25_20251119,
        ToolSearchToolRegex_20251119
      ], { mode: "oneOf" })
    ).annotate({
      "title": "Tools",
      "description":
        "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
    })
  )
}).annotate({ "title": "CountMessageTokensParams" })
export type CreateMessageParams = {
  readonly "model": Model
  readonly "messages": ReadonlyArray<InputMessage>
  readonly "cache_control"?: CacheControlEphemeral | null
  readonly "container"?: string | null
  readonly "inference_geo"?: string | null
  readonly "max_tokens": number
  readonly "metadata"?: { readonly "user_id"?: string | null }
  readonly "output_config"?: { readonly "effort"?: EffortLevel | null; readonly "format"?: JsonOutputFormat | null }
  readonly "service_tier"?: "auto" | "standard_only"
  readonly "stop_sequences"?: ReadonlyArray<string>
  readonly "stream"?: boolean
  readonly "system"?: string | ReadonlyArray<RequestTextBlock>
  readonly "temperature"?: number
  readonly "thinking"?: ThinkingConfigParam
  readonly "tool_choice"?: ToolChoice
  readonly "tools"?: ReadonlyArray<
    | Tool
    | BashTool_20250124
    | CodeExecutionTool_20250522
    | CodeExecutionTool_20250825
    | CodeExecutionTool_20260120
    | MemoryTool_20250818
    | TextEditor_20250124
    | TextEditor_20250429
    | TextEditor_20250728
    | WebSearchTool_20250305
    | WebFetchTool_20250910
    | WebSearchTool_20260209
    | WebFetchTool_20260209
    | ToolSearchToolBM25_20251119
    | ToolSearchToolRegex_20251119
  >
  readonly "top_k"?: number
  readonly "top_p"?: number
}
export const CreateMessageParams = Schema.Struct({
  "model": Model,
  "messages": Schema.Array(InputMessage).annotate({
    "title": "Messages",
    "description":
      "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
  }),
  "cache_control": Schema.optionalKey(
    Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
      "title": "Cache Control",
      "description":
        "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
    })
  ),
  "container": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Container",
      "description": "Container identifier for reuse across requests."
    })
  ),
  "inference_geo": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Inference Geo",
      "description":
        "Specifies the geographic region for inference processing. If not specified, the workspace's `default_inference_geo` is used."
    })
  ),
  "max_tokens": Schema.Number.annotate({
    "title": "Max Tokens",
    "description":
      "The maximum number of tokens to generate before stopping.\n\nNote that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate.\n\nDifferent models have different maximum values for this parameter.  See [models](https://docs.claude.com/en/docs/models-overview) for details."
  }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
  "metadata": Schema.optionalKey(
    Schema.Struct({
      "user_id": Schema.optionalKey(
        Schema.Union([Schema.String.check(Schema.isMaxLength(256)), Schema.Null]).annotate({
          "title": "User Id",
          "description":
            "An external identifier for the user who is associated with the request.\n\nThis should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number."
        })
      )
    }).annotate({ "title": "Metadata", "description": "An object describing metadata about the request." })
  ),
  "output_config": Schema.optionalKey(
    Schema.Struct({
      "effort": Schema.optionalKey(
        Schema.Union([EffortLevel, Schema.Null]).annotate({
          "description":
            "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
        })
      ),
      "format": Schema.optionalKey(
        Schema.Union([JsonOutputFormat, Schema.Null]).annotate({
          "description":
            "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
        })
      )
    }).annotate({
      "title": "OutputConfig",
      "description": "Configuration options for the model's output, such as the output format."
    })
  ),
  "service_tier": Schema.optionalKey(
    Schema.Literals(["auto", "standard_only"]).annotate({
      "title": "Service Tier",
      "description":
        "Determines whether to use priority capacity (if available) or standard capacity for this request.\n\nAnthropic offers different levels of service for your API requests. See [service-tiers](https://docs.claude.com/en/api/service-tiers) for details."
    })
  ),
  "stop_sequences": Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      "title": "Stop Sequences",
      "description":
        "Custom text sequences that will cause the model to stop generating.\n\nOur models will normally stop when they have naturally completed their turn, which will result in a response `stop_reason` of `\"end_turn\"`.\n\nIf you want the model to stop generating when it encounters custom strings of text, you can use the `stop_sequences` parameter. If the model encounters one of the custom sequences, the response `stop_reason` value will be `\"stop_sequence\"` and the response `stop_sequence` value will contain the matched stop sequence."
    })
  ),
  "stream": Schema.optionalKey(
    Schema.Boolean.annotate({
      "title": "Stream",
      "description":
        "Whether to incrementally stream the response using server-sent events.\n\nSee [streaming](https://docs.claude.com/en/api/messages-streaming) for details."
    })
  ),
  "system": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Array(RequestTextBlock)]).annotate({
      "title": "System",
      "description":
        "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
    })
  ),
  "temperature": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Temperature",
      "description":
        "Amount of randomness injected into the response.\n\nDefaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.\n\nNote that even with `temperature` of `0.0`, the results will not be fully deterministic."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  ),
  "thinking": Schema.optionalKey(ThinkingConfigParam),
  "tool_choice": Schema.optionalKey(ToolChoice),
  "tools": Schema.optionalKey(
    Schema.Array(
      Schema.Union([
        Tool,
        BashTool_20250124,
        CodeExecutionTool_20250522,
        CodeExecutionTool_20250825,
        CodeExecutionTool_20260120,
        MemoryTool_20250818,
        TextEditor_20250124,
        TextEditor_20250429,
        TextEditor_20250728,
        WebSearchTool_20250305,
        WebFetchTool_20250910,
        WebSearchTool_20260209,
        WebFetchTool_20260209,
        ToolSearchToolBM25_20251119,
        ToolSearchToolRegex_20251119
      ], { mode: "oneOf" })
    ).annotate({
      "title": "Tools",
      "description":
        "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
    })
  ),
  "top_k": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top K",
      "description":
        "Only sample from the top K options for each subsequent token.\n\nUsed to remove \"long tail\" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
  ),
  "top_p": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Top P",
      "description":
        "Use nucleus sampling.\n\nIn nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`. You should either alter `temperature` or `top_p`, but not both.\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
    }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
  )
}).annotate({ "title": "CreateMessageParams" })
export type MessageBatchIndividualRequestParams = {
  readonly "custom_id": string
  readonly "params": {
    readonly "model": Model
    readonly "messages": ReadonlyArray<InputMessage>
    readonly "cache_control"?: CacheControlEphemeral | null
    readonly "container"?: string | null
    readonly "inference_geo"?: string | null
    readonly "max_tokens": number
    readonly "metadata"?: { readonly "user_id"?: string | null }
    readonly "output_config"?: { readonly "effort"?: EffortLevel | null; readonly "format"?: JsonOutputFormat | null }
    readonly "service_tier"?: "auto" | "standard_only"
    readonly "stop_sequences"?: ReadonlyArray<string>
    readonly "stream"?: boolean
    readonly "system"?: string | ReadonlyArray<RequestTextBlock>
    readonly "temperature"?: number
    readonly "thinking"?: ThinkingConfigParam
    readonly "tool_choice"?: ToolChoice
    readonly "tools"?: ReadonlyArray<
      | Tool
      | BashTool_20250124
      | CodeExecutionTool_20250522
      | CodeExecutionTool_20250825
      | CodeExecutionTool_20260120
      | MemoryTool_20250818
      | TextEditor_20250124
      | TextEditor_20250429
      | TextEditor_20250728
      | WebSearchTool_20250305
      | WebFetchTool_20250910
      | WebSearchTool_20260209
      | WebFetchTool_20260209
      | ToolSearchToolBM25_20251119
      | ToolSearchToolRegex_20251119
    >
    readonly "top_k"?: number
    readonly "top_p"?: number
  }
}
export const MessageBatchIndividualRequestParams = Schema.Struct({
  "custom_id": Schema.String.annotate({
    "title": "Custom Id",
    "description":
      "Developer-provided ID created for each request in a Message Batch. Useful for matching results to requests, as results may be given out of request order.\n\nMust be unique for each request within the Message Batch."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)).check(
    Schema.isPattern(new RegExp("^[a-zA-Z0-9_-]{1,64}$"))
  ),
  "params": Schema.Struct({
    "model": Model,
    "messages": Schema.Array(InputMessage).annotate({
      "title": "Messages",
      "description":
        "Input messages.\n\nOur models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.\n\nEach input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.\n\nIf the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.\n\nExample with a single `user` message:\n\n```json\n[{\"role\": \"user\", \"content\": \"Hello, Claude\"}]\n```\n\nExample with multiple conversational turns:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"Hello there.\"},\n  {\"role\": \"assistant\", \"content\": \"Hi, I'm Claude. How can I help you?\"},\n  {\"role\": \"user\", \"content\": \"Can you explain LLMs in plain English?\"},\n]\n```\n\nExample with a partially-filled response from Claude:\n\n```json\n[\n  {\"role\": \"user\", \"content\": \"What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun\"},\n  {\"role\": \"assistant\", \"content\": \"The best answer is (\"},\n]\n```\n\nEach input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `\"text\"`. The following input messages are equivalent:\n\n```json\n{\"role\": \"user\", \"content\": \"Hello, Claude\"}\n```\n\n```json\n{\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"Hello, Claude\"}]}\n```\n\nSee [input examples](https://docs.claude.com/en/api/messages-examples).\n\nNote that if you want to include a [system prompt](https://docs.claude.com/en/docs/system-prompts), you can use the top-level `system` parameter — there is no `\"system\"` role for input messages in the Messages API.\n\nThere is a limit of 100,000 messages in a single request."
    }),
    "cache_control": Schema.optionalKey(
      Schema.Union([Schema.Union([CacheControlEphemeral], { mode: "oneOf" }), Schema.Null]).annotate({
        "title": "Cache Control",
        "description":
          "Top-level cache control automatically applies a cache_control marker to the last cacheable block in the request."
      })
    ),
    "container": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Null]).annotate({
        "title": "Container",
        "description": "Container identifier for reuse across requests."
      })
    ),
    "inference_geo": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Null]).annotate({
        "title": "Inference Geo",
        "description":
          "Specifies the geographic region for inference processing. If not specified, the workspace's `default_inference_geo` is used."
      })
    ),
    "max_tokens": Schema.Number.annotate({
      "title": "Max Tokens",
      "description":
        "The maximum number of tokens to generate before stopping.\n\nNote that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate.\n\nDifferent models have different maximum values for this parameter.  See [models](https://docs.claude.com/en/docs/models-overview) for details."
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)),
    "metadata": Schema.optionalKey(
      Schema.Struct({
        "user_id": Schema.optionalKey(
          Schema.Union([Schema.String.check(Schema.isMaxLength(256)), Schema.Null]).annotate({
            "title": "User Id",
            "description":
              "An external identifier for the user who is associated with the request.\n\nThis should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number."
          })
        )
      }).annotate({ "title": "Metadata", "description": "An object describing metadata about the request." })
    ),
    "output_config": Schema.optionalKey(
      Schema.Struct({
        "effort": Schema.optionalKey(
          Schema.Union([EffortLevel, Schema.Null]).annotate({
            "description":
              "How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.\n\nValid values are `low`, `medium`, `high`, or `max`."
          })
        ),
        "format": Schema.optionalKey(
          Schema.Union([JsonOutputFormat, Schema.Null]).annotate({
            "description":
              "A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)"
          })
        )
      }).annotate({
        "title": "OutputConfig",
        "description": "Configuration options for the model's output, such as the output format."
      })
    ),
    "service_tier": Schema.optionalKey(
      Schema.Literals(["auto", "standard_only"]).annotate({
        "title": "Service Tier",
        "description":
          "Determines whether to use priority capacity (if available) or standard capacity for this request.\n\nAnthropic offers different levels of service for your API requests. See [service-tiers](https://docs.claude.com/en/api/service-tiers) for details."
      })
    ),
    "stop_sequences": Schema.optionalKey(
      Schema.Array(Schema.String).annotate({
        "title": "Stop Sequences",
        "description":
          "Custom text sequences that will cause the model to stop generating.\n\nOur models will normally stop when they have naturally completed their turn, which will result in a response `stop_reason` of `\"end_turn\"`.\n\nIf you want the model to stop generating when it encounters custom strings of text, you can use the `stop_sequences` parameter. If the model encounters one of the custom sequences, the response `stop_reason` value will be `\"stop_sequence\"` and the response `stop_sequence` value will contain the matched stop sequence."
      })
    ),
    "stream": Schema.optionalKey(
      Schema.Boolean.annotate({
        "title": "Stream",
        "description":
          "Whether to incrementally stream the response using server-sent events.\n\nSee [streaming](https://docs.claude.com/en/api/messages-streaming) for details."
      })
    ),
    "system": Schema.optionalKey(
      Schema.Union([Schema.String, Schema.Array(RequestTextBlock)]).annotate({
        "title": "System",
        "description":
          "System prompt.\n\nA system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://docs.claude.com/en/docs/system-prompts)."
      })
    ),
    "temperature": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Temperature",
        "description":
          "Amount of randomness injected into the response.\n\nDefaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.\n\nNote that even with `temperature` of `0.0`, the results will not be fully deterministic."
      }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
    ),
    "thinking": Schema.optionalKey(ThinkingConfigParam),
    "tool_choice": Schema.optionalKey(ToolChoice),
    "tools": Schema.optionalKey(
      Schema.Array(
        Schema.Union([
          Tool,
          BashTool_20250124,
          CodeExecutionTool_20250522,
          CodeExecutionTool_20250825,
          CodeExecutionTool_20260120,
          MemoryTool_20250818,
          TextEditor_20250124,
          TextEditor_20250429,
          TextEditor_20250728,
          WebSearchTool_20250305,
          WebFetchTool_20250910,
          WebSearchTool_20260209,
          WebFetchTool_20260209,
          ToolSearchToolBM25_20251119,
          ToolSearchToolRegex_20251119
        ], { mode: "oneOf" })
      ).annotate({
        "title": "Tools",
        "description":
          "Definitions of tools that the model may use.\n\nIf you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.\n\nThere are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\\#server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).\n\nEach tool definition includes:\n\n* `name`: Name of the tool.\n* `description`: Optional, but strongly-recommended description of the tool.\n* `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.\n\nFor example, if you defined `tools` as:\n\n```json\n[\n  {\n    \"name\": \"get_stock_price\",\n    \"description\": \"Get the current stock price for a given ticker symbol.\",\n    \"input_schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"ticker\": {\n          \"type\": \"string\",\n          \"description\": \"The stock ticker symbol, e.g. AAPL for Apple Inc.\"\n        }\n      },\n      \"required\": [\"ticker\"]\n    }\n  }\n]\n```\n\nAnd then asked the model \"What's the S&P 500 at today?\", the model might produce `tool_use` content blocks in the response like this:\n\n```json\n[\n  {\n    \"type\": \"tool_use\",\n    \"id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"name\": \"get_stock_price\",\n    \"input\": { \"ticker\": \"^GSPC\" }\n  }\n]\n```\n\nYou might then run your `get_stock_price` tool with `{\"ticker\": \"^GSPC\"}` as an input, and return the following back to the model in a subsequent `user` message:\n\n```json\n[\n  {\n    \"type\": \"tool_result\",\n    \"tool_use_id\": \"toolu_01D7FLrfh4GYq7yT1ULFeyMV\",\n    \"content\": \"259.75 USD\"\n  }\n]\n```\n\nTools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.\n\nSee our [guide](https://docs.claude.com/en/docs/tool-use) for more details."
      })
    ),
    "top_k": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Top K",
        "description":
          "Only sample from the top K options for each subsequent token.\n\nUsed to remove \"long tail\" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
      }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
    ),
    "top_p": Schema.optionalKey(
      Schema.Number.annotate({
        "title": "Top P",
        "description":
          "Use nucleus sampling.\n\nIn nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`. You should either alter `temperature` or `top_p`, but not both.\n\nRecommended for advanced use cases only. You usually only need to use `temperature`."
      }).check(Schema.isFinite()).check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
    )
  }).annotate({
    "title": "CreateMessageParams",
    "description":
      "Messages API creation parameters for the individual request.\n\nSee the [Messages API reference](https://docs.claude.com/en/api/messages) for full documentation on available parameters."
  })
}).annotate({ "title": "MessageBatchIndividualRequestParams" })
export type BetaCreateMessageBatchParams = {
  readonly "requests": ReadonlyArray<BetaMessageBatchIndividualRequestParams>
}
export const BetaCreateMessageBatchParams = Schema.Struct({
  "requests": Schema.Array(BetaMessageBatchIndividualRequestParams).annotate({
    "title": "Requests",
    "description": "List of requests for prompt completion. Each is an individual request to create a Message."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(100000))
}).annotate({ "title": "CreateMessageBatchParams" })
export type CreateMessageBatchParams = { readonly "requests": ReadonlyArray<MessageBatchIndividualRequestParams> }
export const CreateMessageBatchParams = Schema.Struct({
  "requests": Schema.Array(MessageBatchIndividualRequestParams).annotate({
    "title": "Requests",
    "description": "List of requests for prompt completion. Each is an individual request to create a Message."
  }).check(Schema.isMinLength(1)).check(Schema.isMaxLength(100000))
}).annotate({ "title": "CreateMessageBatchParams" })
// schemas
export type MessagesPostParams = { readonly "anthropic-version"?: string }
export const MessagesPostParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type MessagesPostRequestJson = CreateMessageParams
export const MessagesPostRequestJson = CreateMessageParams
export type MessagesPost200 = Message
export const MessagesPost200 = Message
export type MessagesPost4XX = ErrorResponse
export const MessagesPost4XX = ErrorResponse
export type CompletePostParams = { readonly "anthropic-version"?: string; readonly "anthropic-beta"?: string }
export const CompletePostParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  )
})
export type CompletePostRequestJson = CompletionRequest
export const CompletePostRequestJson = CompletionRequest
export type CompletePost200 = CompletionResponse
export const CompletePost200 = CompletionResponse
export type CompletePost4XX = ErrorResponse
export const CompletePost4XX = ErrorResponse
export type ModelsListParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
  readonly "anthropic-beta"?: string
}
export const ModelsListParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  })),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  )
})
export type ModelsList200 = ListResponse_ModelInfo_
export const ModelsList200 = ListResponse_ModelInfo_
export type ModelsList4XX = ErrorResponse
export const ModelsList4XX = ErrorResponse
export type ModelsGetParams = {
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
  readonly "anthropic-beta"?: string
}
export const ModelsGetParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  })),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  )
})
export type ModelsGet200 = ModelInfo
export const ModelsGet200 = ModelInfo
export type ModelsGet4XX = ErrorResponse
export const ModelsGet4XX = ErrorResponse
export type MessageBatchesListParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const MessageBatchesListParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type MessageBatchesList200 = ListResponse_MessageBatch_
export const MessageBatchesList200 = ListResponse_MessageBatch_
export type MessageBatchesList4XX = ErrorResponse
export const MessageBatchesList4XX = ErrorResponse
export type MessageBatchesPostParams = { readonly "anthropic-version"?: string }
export const MessageBatchesPostParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type MessageBatchesPostRequestJson = CreateMessageBatchParams
export const MessageBatchesPostRequestJson = CreateMessageBatchParams
export type MessageBatchesPost200 = MessageBatch
export const MessageBatchesPost200 = MessageBatch
export type MessageBatchesPost4XX = ErrorResponse
export const MessageBatchesPost4XX = ErrorResponse
export type MessageBatchesRetrieveParams = { readonly "anthropic-version"?: string; readonly "x-api-key"?: string }
export const MessageBatchesRetrieveParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type MessageBatchesRetrieve200 = MessageBatch
export const MessageBatchesRetrieve200 = MessageBatch
export type MessageBatchesRetrieve4XX = ErrorResponse
export const MessageBatchesRetrieve4XX = ErrorResponse
export type MessageBatchesDeleteParams = { readonly "anthropic-version"?: string; readonly "x-api-key"?: string }
export const MessageBatchesDeleteParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type MessageBatchesDelete200 = DeleteMessageBatchResponse
export const MessageBatchesDelete200 = DeleteMessageBatchResponse
export type MessageBatchesDelete4XX = ErrorResponse
export const MessageBatchesDelete4XX = ErrorResponse
export type MessageBatchesCancelParams = { readonly "anthropic-version"?: string }
export const MessageBatchesCancelParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type MessageBatchesCancel200 = MessageBatch
export const MessageBatchesCancel200 = MessageBatch
export type MessageBatchesCancel4XX = ErrorResponse
export const MessageBatchesCancel4XX = ErrorResponse
export type MessageBatchesResultsParams = { readonly "anthropic-version"?: string; readonly "x-api-key"?: string }
export const MessageBatchesResultsParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type MessageBatchesResults4XX = ErrorResponse
export const MessageBatchesResults4XX = ErrorResponse
export type MessagesCountTokensPostParams = { readonly "anthropic-version"?: string }
export const MessagesCountTokensPostParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type MessagesCountTokensPostRequestJson = CountMessageTokensParams
export const MessagesCountTokensPostRequestJson = CountMessageTokensParams
export type MessagesCountTokensPost200 = CountMessageTokensResponse
export const MessagesCountTokensPost200 = CountMessageTokensResponse
export type MessagesCountTokensPost4XX = ErrorResponse
export const MessagesCountTokensPost4XX = ErrorResponse
export type ListFilesV1FilesGetParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const ListFilesV1FilesGetParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type ListFilesV1FilesGet200 = FileListResponse
export const ListFilesV1FilesGet200 = FileListResponse
export type ListFilesV1FilesGet4XX = ErrorResponse
export const ListFilesV1FilesGet4XX = ErrorResponse
export type UploadFileV1FilesPostParams = { readonly "anthropic-beta"?: string; readonly "anthropic-version"?: string }
export const UploadFileV1FilesPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type UploadFileV1FilesPostRequestFormData = { readonly "file": string }
export const UploadFileV1FilesPostRequestFormData = Schema.Struct({
  "file": Schema.String.annotate({ "description": "The file to upload", "format": "binary" })
})
export type UploadFileV1FilesPost200 = FileMetadataSchema
export const UploadFileV1FilesPost200 = FileMetadataSchema
export type UploadFileV1FilesPost4XX = ErrorResponse
export const UploadFileV1FilesPost4XX = ErrorResponse
export type GetFileMetadataV1FilesFileIdGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const GetFileMetadataV1FilesFileIdGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type GetFileMetadataV1FilesFileIdGet200 = FileMetadataSchema
export const GetFileMetadataV1FilesFileIdGet200 = FileMetadataSchema
export type GetFileMetadataV1FilesFileIdGet4XX = ErrorResponse
export const GetFileMetadataV1FilesFileIdGet4XX = ErrorResponse
export type DeleteFileV1FilesFileIdDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const DeleteFileV1FilesFileIdDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type DeleteFileV1FilesFileIdDelete200 = FileDeleteResponse
export const DeleteFileV1FilesFileIdDelete200 = FileDeleteResponse
export type DeleteFileV1FilesFileIdDelete4XX = ErrorResponse
export const DeleteFileV1FilesFileIdDelete4XX = ErrorResponse
export type DownloadFileV1FilesFileIdContentGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const DownloadFileV1FilesFileIdContentGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type ListSkillsV1SkillsGetParams = {
  readonly "page"?: string | null
  readonly "limit"?: number
  readonly "source"?: string | null
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const ListSkillsV1SkillsGetParams = Schema.Struct({
  "page": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Page",
      "description":
        "Pagination token for fetching a specific page of results.\n\nPass the value from a previous response's `next_page` field to get the next page of results."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of results to return per page.\n\nMaximum value is 100. Defaults to 20.",
      "default": 20
    }).check(Schema.isInt())
  ),
  "source": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Source",
      "description":
        "Filter skills by source.\n\nIf provided, only skills from the specified source will be returned:\n* `\"custom\"`: only return user-created skills\n* `\"anthropic\"`: only return Anthropic-created skills"
    })
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type ListSkillsV1SkillsGet200 = ListSkillsResponse
export const ListSkillsV1SkillsGet200 = ListSkillsResponse
export type ListSkillsV1SkillsGet4XX = ErrorResponse
export const ListSkillsV1SkillsGet4XX = ErrorResponse
export type CreateSkillV1SkillsPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const CreateSkillV1SkillsPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type CreateSkillV1SkillsPostRequestFormData = Body_create_skill_v1_skills_post
export const CreateSkillV1SkillsPostRequestFormData = Body_create_skill_v1_skills_post
export type CreateSkillV1SkillsPost200 = CreateSkillResponse
export const CreateSkillV1SkillsPost200 = CreateSkillResponse
export type CreateSkillV1SkillsPost4XX = ErrorResponse
export const CreateSkillV1SkillsPost4XX = ErrorResponse
export type GetSkillV1SkillsSkillIdGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const GetSkillV1SkillsSkillIdGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type GetSkillV1SkillsSkillIdGet200 = GetSkillResponse
export const GetSkillV1SkillsSkillIdGet200 = GetSkillResponse
export type GetSkillV1SkillsSkillIdGet4XX = ErrorResponse
export const GetSkillV1SkillsSkillIdGet4XX = ErrorResponse
export type DeleteSkillV1SkillsSkillIdDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const DeleteSkillV1SkillsSkillIdDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type DeleteSkillV1SkillsSkillIdDelete200 = DeleteSkillResponse
export const DeleteSkillV1SkillsSkillIdDelete200 = DeleteSkillResponse
export type DeleteSkillV1SkillsSkillIdDelete4XX = ErrorResponse
export const DeleteSkillV1SkillsSkillIdDelete4XX = ErrorResponse
export type ListSkillVersionsV1SkillsSkillIdVersionsGetParams = {
  readonly "page"?: string | null
  readonly "limit"?: number | null
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const ListSkillVersionsV1SkillsSkillIdVersionsGetParams = Schema.Struct({
  "page": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Page",
      "description": "Optionally set to the `next_page` token from the previous response."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`."
    })
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type ListSkillVersionsV1SkillsSkillIdVersionsGet200 = ListSkillVersionsResponse
export const ListSkillVersionsV1SkillsSkillIdVersionsGet200 = ListSkillVersionsResponse
export type ListSkillVersionsV1SkillsSkillIdVersionsGet4XX = ErrorResponse
export const ListSkillVersionsV1SkillsSkillIdVersionsGet4XX = ErrorResponse
export type CreateSkillVersionV1SkillsSkillIdVersionsPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const CreateSkillVersionV1SkillsSkillIdVersionsPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type CreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData =
  Body_create_skill_version_v1_skills__skill_id__versions_post
export const CreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData =
  Body_create_skill_version_v1_skills__skill_id__versions_post
export type CreateSkillVersionV1SkillsSkillIdVersionsPost200 = CreateSkillVersionResponse
export const CreateSkillVersionV1SkillsSkillIdVersionsPost200 = CreateSkillVersionResponse
export type CreateSkillVersionV1SkillsSkillIdVersionsPost4XX = ErrorResponse
export const CreateSkillVersionV1SkillsSkillIdVersionsPost4XX = ErrorResponse
export type GetSkillVersionV1SkillsSkillIdVersionsVersionGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const GetSkillVersionV1SkillsSkillIdVersionsVersionGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type GetSkillVersionV1SkillsSkillIdVersionsVersionGet200 = GetSkillVersionResponse
export const GetSkillVersionV1SkillsSkillIdVersionsVersionGet200 = GetSkillVersionResponse
export type GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX = ErrorResponse
export const GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX = ErrorResponse
export type DeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const DeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200 = DeleteSkillVersionResponse
export const DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200 = DeleteSkillVersionResponse
export type DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX = ErrorResponse
export const DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX = ErrorResponse
export type BetaMessagesPostParams = { readonly "anthropic-beta"?: string; readonly "anthropic-version"?: string }
export const BetaMessagesPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaMessagesPostRequestJson = BetaCreateMessageParams
export const BetaMessagesPostRequestJson = BetaCreateMessageParams
export type BetaMessagesPost200 = BetaMessage
export const BetaMessagesPost200 = BetaMessage
export type BetaMessagesPost4XX = BetaErrorResponse
export const BetaMessagesPost4XX = BetaErrorResponse
export type BetaModelsListParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
  readonly "anthropic-beta"?: string
}
export const BetaModelsListParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  })),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  )
})
export type BetaModelsList200 = BetaListResponse_ModelInfo_
export const BetaModelsList200 = BetaListResponse_ModelInfo_
export type BetaModelsList4XX = BetaErrorResponse
export const BetaModelsList4XX = BetaErrorResponse
export type BetaModelsGetParams = {
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
  readonly "anthropic-beta"?: string
}
export const BetaModelsGetParams = Schema.Struct({
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  })),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  )
})
export type BetaModelsGet200 = BetaModelInfo
export const BetaModelsGet200 = BetaModelInfo
export type BetaModelsGet4XX = BetaErrorResponse
export const BetaModelsGet4XX = BetaErrorResponse
export type BetaMessageBatchesListParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaMessageBatchesListParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaMessageBatchesList200 = BetaListResponse_MessageBatch_
export const BetaMessageBatchesList200 = BetaListResponse_MessageBatch_
export type BetaMessageBatchesList4XX = BetaErrorResponse
export const BetaMessageBatchesList4XX = BetaErrorResponse
export type BetaMessageBatchesPostParams = { readonly "anthropic-beta"?: string; readonly "anthropic-version"?: string }
export const BetaMessageBatchesPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaMessageBatchesPostRequestJson = BetaCreateMessageBatchParams
export const BetaMessageBatchesPostRequestJson = BetaCreateMessageBatchParams
export type BetaMessageBatchesPost200 = BetaMessageBatch
export const BetaMessageBatchesPost200 = BetaMessageBatch
export type BetaMessageBatchesPost4XX = BetaErrorResponse
export const BetaMessageBatchesPost4XX = BetaErrorResponse
export type BetaMessageBatchesRetrieveParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaMessageBatchesRetrieveParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaMessageBatchesRetrieve200 = BetaMessageBatch
export const BetaMessageBatchesRetrieve200 = BetaMessageBatch
export type BetaMessageBatchesRetrieve4XX = BetaErrorResponse
export const BetaMessageBatchesRetrieve4XX = BetaErrorResponse
export type BetaMessageBatchesDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaMessageBatchesDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaMessageBatchesDelete200 = BetaDeleteMessageBatchResponse
export const BetaMessageBatchesDelete200 = BetaDeleteMessageBatchResponse
export type BetaMessageBatchesDelete4XX = BetaErrorResponse
export const BetaMessageBatchesDelete4XX = BetaErrorResponse
export type BetaMessageBatchesCancelParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const BetaMessageBatchesCancelParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaMessageBatchesCancel200 = BetaMessageBatch
export const BetaMessageBatchesCancel200 = BetaMessageBatch
export type BetaMessageBatchesCancel4XX = BetaErrorResponse
export const BetaMessageBatchesCancel4XX = BetaErrorResponse
export type BetaMessageBatchesResultsParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaMessageBatchesResultsParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaMessageBatchesResults4XX = BetaErrorResponse
export const BetaMessageBatchesResults4XX = BetaErrorResponse
export type BetaMessagesCountTokensPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const BetaMessagesCountTokensPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaMessagesCountTokensPostRequestJson = BetaCountMessageTokensParams
export const BetaMessagesCountTokensPostRequestJson = BetaCountMessageTokensParams
export type BetaMessagesCountTokensPost200 = BetaCountMessageTokensResponse
export const BetaMessagesCountTokensPost200 = BetaCountMessageTokensResponse
export type BetaMessagesCountTokensPost4XX = BetaErrorResponse
export const BetaMessagesCountTokensPost4XX = BetaErrorResponse
export type BetaListFilesV1FilesGetParams = {
  readonly "before_id"?: string
  readonly "after_id"?: string
  readonly "limit"?: number
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaListFilesV1FilesGetParams = Schema.Struct({
  "before_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Before Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately before this object."
    })
  ),
  "after_id": Schema.optionalKey(
    Schema.String.annotate({
      "title": "After Id",
      "description":
        "ID of the object to use as a cursor for pagination. When provided, returns the page of results immediately after this object."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`.",
      "default": 20
    }).check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(1000))
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaListFilesV1FilesGet200 = BetaFileListResponse
export const BetaListFilesV1FilesGet200 = BetaFileListResponse
export type BetaListFilesV1FilesGet4XX = BetaErrorResponse
export const BetaListFilesV1FilesGet4XX = BetaErrorResponse
export type BetaUploadFileV1FilesPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const BetaUploadFileV1FilesPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaUploadFileV1FilesPostRequestFormData = { readonly "file": string }
export const BetaUploadFileV1FilesPostRequestFormData = Schema.Struct({
  "file": Schema.String.annotate({ "description": "The file to upload", "format": "binary" })
})
export type BetaUploadFileV1FilesPost200 = BetaFileMetadataSchema
export const BetaUploadFileV1FilesPost200 = BetaFileMetadataSchema
export type BetaUploadFileV1FilesPost4XX = BetaErrorResponse
export const BetaUploadFileV1FilesPost4XX = BetaErrorResponse
export type BetaGetFileMetadataV1FilesFileIdGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaGetFileMetadataV1FilesFileIdGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaGetFileMetadataV1FilesFileIdGet200 = BetaFileMetadataSchema
export const BetaGetFileMetadataV1FilesFileIdGet200 = BetaFileMetadataSchema
export type BetaGetFileMetadataV1FilesFileIdGet4XX = BetaErrorResponse
export const BetaGetFileMetadataV1FilesFileIdGet4XX = BetaErrorResponse
export type BetaDeleteFileV1FilesFileIdDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaDeleteFileV1FilesFileIdDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaDeleteFileV1FilesFileIdDelete200 = BetaFileDeleteResponse
export const BetaDeleteFileV1FilesFileIdDelete200 = BetaFileDeleteResponse
export type BetaDeleteFileV1FilesFileIdDelete4XX = BetaErrorResponse
export const BetaDeleteFileV1FilesFileIdDelete4XX = BetaErrorResponse
export type BetaDownloadFileV1FilesFileIdContentGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaDownloadFileV1FilesFileIdContentGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaListSkillsV1SkillsGetParams = {
  readonly "page"?: string | null
  readonly "limit"?: number
  readonly "source"?: string | null
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaListSkillsV1SkillsGetParams = Schema.Struct({
  "page": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Page",
      "description":
        "Pagination token for fetching a specific page of results.\n\nPass the value from a previous response's `next_page` field to get the next page of results."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Number.annotate({
      "title": "Limit",
      "description": "Number of results to return per page.\n\nMaximum value is 100. Defaults to 20.",
      "default": 20
    }).check(Schema.isInt())
  ),
  "source": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Source",
      "description":
        "Filter skills by source.\n\nIf provided, only skills from the specified source will be returned:\n* `\"custom\"`: only return user-created skills\n* `\"anthropic\"`: only return Anthropic-created skills"
    })
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaListSkillsV1SkillsGet200 = BetaListSkillsResponse
export const BetaListSkillsV1SkillsGet200 = BetaListSkillsResponse
export type BetaListSkillsV1SkillsGet4XX = BetaErrorResponse
export const BetaListSkillsV1SkillsGet4XX = BetaErrorResponse
export type BetaCreateSkillV1SkillsPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const BetaCreateSkillV1SkillsPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaCreateSkillV1SkillsPostRequestFormData = BetaBody_create_skill_v1_skills_post
export const BetaCreateSkillV1SkillsPostRequestFormData = BetaBody_create_skill_v1_skills_post
export type BetaCreateSkillV1SkillsPost200 = BetaCreateSkillResponse
export const BetaCreateSkillV1SkillsPost200 = BetaCreateSkillResponse
export type BetaCreateSkillV1SkillsPost4XX = BetaErrorResponse
export const BetaCreateSkillV1SkillsPost4XX = BetaErrorResponse
export type BetaGetSkillV1SkillsSkillIdGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaGetSkillV1SkillsSkillIdGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaGetSkillV1SkillsSkillIdGet200 = BetaGetSkillResponse
export const BetaGetSkillV1SkillsSkillIdGet200 = BetaGetSkillResponse
export type BetaGetSkillV1SkillsSkillIdGet4XX = BetaErrorResponse
export const BetaGetSkillV1SkillsSkillIdGet4XX = BetaErrorResponse
export type BetaDeleteSkillV1SkillsSkillIdDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaDeleteSkillV1SkillsSkillIdDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaDeleteSkillV1SkillsSkillIdDelete200 = BetaDeleteSkillResponse
export const BetaDeleteSkillV1SkillsSkillIdDelete200 = BetaDeleteSkillResponse
export type BetaDeleteSkillV1SkillsSkillIdDelete4XX = BetaErrorResponse
export const BetaDeleteSkillV1SkillsSkillIdDelete4XX = BetaErrorResponse
export type BetaListSkillVersionsV1SkillsSkillIdVersionsGetParams = {
  readonly "page"?: string | null
  readonly "limit"?: number | null
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaListSkillVersionsV1SkillsSkillIdVersionsGetParams = Schema.Struct({
  "page": Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      "title": "Page",
      "description": "Optionally set to the `next_page` token from the previous response."
    })
  ),
  "limit": Schema.optionalKey(
    Schema.Union([Schema.Number.check(Schema.isInt()), Schema.Null]).annotate({
      "title": "Limit",
      "description": "Number of items to return per page.\n\nDefaults to `20`. Ranges from `1` to `1000`."
    })
  ),
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaListSkillVersionsV1SkillsSkillIdVersionsGet200 = BetaListSkillVersionsResponse
export const BetaListSkillVersionsV1SkillsSkillIdVersionsGet200 = BetaListSkillVersionsResponse
export type BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX = BetaErrorResponse
export const BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX = BetaErrorResponse
export type BetaCreateSkillVersionV1SkillsSkillIdVersionsPostParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
}
export const BetaCreateSkillVersionV1SkillsSkillIdVersionsPostParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  )
})
export type BetaCreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData =
  BetaBody_create_skill_version_v1_skills__skill_id__versions_post
export const BetaCreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData =
  BetaBody_create_skill_version_v1_skills__skill_id__versions_post
export type BetaCreateSkillVersionV1SkillsSkillIdVersionsPost200 = BetaCreateSkillVersionResponse
export const BetaCreateSkillVersionV1SkillsSkillIdVersionsPost200 = BetaCreateSkillVersionResponse
export type BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX = BetaErrorResponse
export const BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX = BetaErrorResponse
export type BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGetParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGetParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet200 = BetaGetSkillVersionResponse
export const BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet200 = BetaGetSkillVersionResponse
export type BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX = BetaErrorResponse
export const BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX = BetaErrorResponse
export type BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams = {
  readonly "anthropic-beta"?: string
  readonly "anthropic-version"?: string
  readonly "x-api-key"?: string
}
export const BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams = Schema.Struct({
  "anthropic-beta": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Beta",
      "description":
        "Optional header to specify the beta version(s) you want to use.\n\nTo use multiple betas, use a comma separated list like `beta1,beta2` or specify the header multiple times for each beta."
    })
  ),
  "anthropic-version": Schema.optionalKey(
    Schema.String.annotate({
      "title": "Anthropic-Version",
      "description":
        "The version of the Claude API you want to use.\n\nRead more about versioning and our version history [here](https://docs.claude.com/en/api/versioning)."
    })
  ),
  "x-api-key": Schema.optionalKey(Schema.String.annotate({
    "title": "X-Api-Key",
    "description":
      "Your unique API key for authentication.\n\nThis key is required in the header of all API requests, to authenticate your account and access Anthropic's services. Get your API key through the [Console](https://console.anthropic.com/settings/keys). Each key is scoped to a Workspace."
  }))
})
export type BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200 = BetaDeleteSkillVersionResponse
export const BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200 = BetaDeleteSkillVersionResponse
export type BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX = BetaErrorResponse
export const BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX = BetaErrorResponse

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to `true`, a tuple of `[A, HttpClientResponse]` will be returned,
   * where `A` is the success type of the operation.
   *
   * If set to `false`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the `includeResponse` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig> = Config extends {
  readonly includeResponse: true
} ? [A, HttpClientResponse.HttpClientResponse] :
  A

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>) | undefined
  } = {}
): AnthropicClient => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description: typeof description === "string" ? description : JSON.stringify(description)
            })
          })
        )
    )
  const withResponse = <Config extends OperationConfig>(config: Config | undefined) =>
  (
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>
  ): (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any> => {
    const withOptionalResponse = (
      config?.includeResponse
        ? (response: HttpClientResponse.HttpClientResponse) => Effect.map(f(response), (a) => [a, response])
        : (response: HttpClientResponse.HttpClientResponse) => f(response)
    ) as any
    return options?.transformClient
      ? (request) =>
        Effect.flatMap(
          Effect.flatMap(options.transformClient!(httpClient), (client) => client.execute(request)),
          withOptionalResponse
        )
      : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse)
  }
  const binaryRequest = (
    request: HttpClientRequest.HttpClientRequest
  ): Stream.Stream<Uint8Array, HttpClientError.HttpClientError> =>
    HttpClient.filterStatusOk(httpClient).execute(request).pipe(
      Effect.map((response) => response.stream),
      Stream.unwrap
    )
  const decodeSuccess =
    <Schema extends Schema.Constraint>(schema: Schema) => (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response)
  const decodeError =
    <const Tag extends string, Schema extends Schema.Constraint>(tag: Tag, schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(schema)(response),
        (cause) => Effect.fail(AnthropicClientError(tag, cause, response))
      )
  return {
    httpClient,
    "messagesPost": (options) =>
      HttpClientRequest.post(`/v1/messages`).pipe(
        HttpClientRequest.setHeaders({ "anthropic-version": options.params?.["anthropic-version"] ?? undefined }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessagesPost200),
          "4xx": decodeError("MessagesPost4XX", MessagesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "completePost": (options) =>
      HttpClientRequest.post(`/v1/complete`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined,
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined
        }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(CompletePost200),
          "4xx": decodeError("CompletePost4XX", CompletePost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "modelsList": (options) =>
      HttpClientRequest.get(`/v1/models`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined,
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(ModelsList200),
          "4xx": decodeError("ModelsList4XX", ModelsList4XX),
          orElse: unexpectedStatus
        }))
      ),
    "modelsGet": (modelId, options) =>
      HttpClientRequest.get(`/v1/models/${modelId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined,
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(ModelsGet200),
          "4xx": decodeError("ModelsGet4XX", ModelsGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesList": (options) =>
      HttpClientRequest.get(`/v1/messages/batches`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessageBatchesList200),
          "4xx": decodeError("MessageBatchesList4XX", MessageBatchesList4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesPost": (options) =>
      HttpClientRequest.post(`/v1/messages/batches`).pipe(
        HttpClientRequest.setHeaders({ "anthropic-version": options.params?.["anthropic-version"] ?? undefined }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessageBatchesPost200),
          "4xx": decodeError("MessageBatchesPost4XX", MessageBatchesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesRetrieve": (messageBatchId, options) =>
      HttpClientRequest.get(`/v1/messages/batches/${messageBatchId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessageBatchesRetrieve200),
          "4xx": decodeError("MessageBatchesRetrieve4XX", MessageBatchesRetrieve4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesDelete": (messageBatchId, options) =>
      HttpClientRequest.delete(`/v1/messages/batches/${messageBatchId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessageBatchesDelete200),
          "4xx": decodeError("MessageBatchesDelete4XX", MessageBatchesDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesCancel": (messageBatchId, options) =>
      HttpClientRequest.post(`/v1/messages/batches/${messageBatchId}/cancel`).pipe(
        HttpClientRequest.setHeaders({ "anthropic-version": options?.params?.["anthropic-version"] ?? undefined }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessageBatchesCancel200),
          "4xx": decodeError("MessageBatchesCancel4XX", MessageBatchesCancel4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messageBatchesResults": (messageBatchId, options) =>
      HttpClientRequest.get(`/v1/messages/batches/${messageBatchId}/results`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "4xx": decodeError("MessageBatchesResults4XX", MessageBatchesResults4XX),
          orElse: unexpectedStatus
        }))
      ),
    "messagesCountTokensPost": (options) =>
      HttpClientRequest.post(`/v1/messages/count_tokens`).pipe(
        HttpClientRequest.setHeaders({ "anthropic-version": options.params?.["anthropic-version"] ?? undefined }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(MessagesCountTokensPost200),
          "4xx": decodeError("MessagesCountTokensPost4XX", MessagesCountTokensPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "listFilesV1FilesGet": (options) =>
      HttpClientRequest.get(`/v1/files`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(ListFilesV1FilesGet200),
          "4xx": decodeError("ListFilesV1FilesGet4XX", ListFilesV1FilesGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "uploadFileV1FilesPost": (options) =>
      HttpClientRequest.post(`/v1/files`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(UploadFileV1FilesPost200),
          "4xx": decodeError("UploadFileV1FilesPost4XX", UploadFileV1FilesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "getFileMetadataV1FilesFileIdGet": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(GetFileMetadataV1FilesFileIdGet200),
          "4xx": decodeError("GetFileMetadataV1FilesFileIdGet4XX", GetFileMetadataV1FilesFileIdGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "deleteFileV1FilesFileIdDelete": (fileId, options) =>
      HttpClientRequest.delete(`/v1/files/${fileId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(DeleteFileV1FilesFileIdDelete200),
          "4xx": decodeError("DeleteFileV1FilesFileIdDelete4XX", DeleteFileV1FilesFileIdDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "downloadFileV1FilesFileIdContentGet": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}/content`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          orElse: unexpectedStatus
        }))
      ),
    "downloadFileV1FilesFileIdContentGetStream": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}/content`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        binaryRequest
      ),
    "listSkillsV1SkillsGet": (options) =>
      HttpClientRequest.get(`/v1/skills`).pipe(
        HttpClientRequest.setUrlParams({
          "page": options?.params?.["page"] as any,
          "limit": options?.params?.["limit"] as any,
          "source": options?.params?.["source"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(ListSkillsV1SkillsGet200),
          "4xx": decodeError("ListSkillsV1SkillsGet4XX", ListSkillsV1SkillsGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "createSkillV1SkillsPost": (options) =>
      HttpClientRequest.post(`/v1/skills`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(CreateSkillV1SkillsPost200),
          "4xx": decodeError("CreateSkillV1SkillsPost4XX", CreateSkillV1SkillsPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "getSkillV1SkillsSkillIdGet": (skillId, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(GetSkillV1SkillsSkillIdGet200),
          "4xx": decodeError("GetSkillV1SkillsSkillIdGet4XX", GetSkillV1SkillsSkillIdGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "deleteSkillV1SkillsSkillIdDelete": (skillId, options) =>
      HttpClientRequest.delete(`/v1/skills/${skillId}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(DeleteSkillV1SkillsSkillIdDelete200),
          "4xx": decodeError("DeleteSkillV1SkillsSkillIdDelete4XX", DeleteSkillV1SkillsSkillIdDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "listSkillVersionsV1SkillsSkillIdVersionsGet": (skillId, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}/versions`).pipe(
        HttpClientRequest.setUrlParams({
          "page": options?.params?.["page"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(ListSkillVersionsV1SkillsSkillIdVersionsGet200),
          "4xx": decodeError(
            "ListSkillVersionsV1SkillsSkillIdVersionsGet4XX",
            ListSkillVersionsV1SkillsSkillIdVersionsGet4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "createSkillVersionV1SkillsSkillIdVersionsPost": (skillId, options) =>
      HttpClientRequest.post(`/v1/skills/${skillId}/versions`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(CreateSkillVersionV1SkillsSkillIdVersionsPost200),
          "4xx": decodeError(
            "CreateSkillVersionV1SkillsSkillIdVersionsPost4XX",
            CreateSkillVersionV1SkillsSkillIdVersionsPost4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "getSkillVersionV1SkillsSkillIdVersionsVersionGet": (skillId, version, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}/versions/${version}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(GetSkillVersionV1SkillsSkillIdVersionsVersionGet200),
          "4xx": decodeError(
            "GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX",
            GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "deleteSkillVersionV1SkillsSkillIdVersionsVersionDelete": (skillId, version, options) =>
      HttpClientRequest.delete(`/v1/skills/${skillId}/versions/${version}`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200),
          "4xx": decodeError(
            "DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX",
            DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessagesPost": (options) =>
      HttpClientRequest.post(`/v1/messages?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessagesPost200),
          "4xx": decodeError("BetaMessagesPost4XX", BetaMessagesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaModelsList": (options) =>
      HttpClientRequest.get(`/v1/models?beta=true`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined,
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaModelsList200),
          "4xx": decodeError("BetaModelsList4XX", BetaModelsList4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaModelsGet": (modelId, options) =>
      HttpClientRequest.get(`/v1/models/${modelId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined,
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaModelsGet200),
          "4xx": decodeError("BetaModelsGet4XX", BetaModelsGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesList": (options) =>
      HttpClientRequest.get(`/v1/messages/batches?beta=true`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessageBatchesList200),
          "4xx": decodeError("BetaMessageBatchesList4XX", BetaMessageBatchesList4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesPost": (options) =>
      HttpClientRequest.post(`/v1/messages/batches?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessageBatchesPost200),
          "4xx": decodeError("BetaMessageBatchesPost4XX", BetaMessageBatchesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesRetrieve": (messageBatchId, options) =>
      HttpClientRequest.get(`/v1/messages/batches/${messageBatchId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessageBatchesRetrieve200),
          "4xx": decodeError("BetaMessageBatchesRetrieve4XX", BetaMessageBatchesRetrieve4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesDelete": (messageBatchId, options) =>
      HttpClientRequest.delete(`/v1/messages/batches/${messageBatchId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessageBatchesDelete200),
          "4xx": decodeError("BetaMessageBatchesDelete4XX", BetaMessageBatchesDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesCancel": (messageBatchId, options) =>
      HttpClientRequest.post(`/v1/messages/batches/${messageBatchId}/cancel?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessageBatchesCancel200),
          "4xx": decodeError("BetaMessageBatchesCancel4XX", BetaMessageBatchesCancel4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessageBatchesResults": (messageBatchId, options) =>
      HttpClientRequest.get(`/v1/messages/batches/${messageBatchId}/results?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "4xx": decodeError("BetaMessageBatchesResults4XX", BetaMessageBatchesResults4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaMessagesCountTokensPost": (options) =>
      HttpClientRequest.post(`/v1/messages/count_tokens?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaMessagesCountTokensPost200),
          "4xx": decodeError("BetaMessagesCountTokensPost4XX", BetaMessagesCountTokensPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaListFilesV1FilesGet": (options) =>
      HttpClientRequest.get(`/v1/files?beta=true`).pipe(
        HttpClientRequest.setUrlParams({
          "before_id": options?.params?.["before_id"] as any,
          "after_id": options?.params?.["after_id"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaListFilesV1FilesGet200),
          "4xx": decodeError("BetaListFilesV1FilesGet4XX", BetaListFilesV1FilesGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaUploadFileV1FilesPost": (options) =>
      HttpClientRequest.post(`/v1/files?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaUploadFileV1FilesPost200),
          "4xx": decodeError("BetaUploadFileV1FilesPost4XX", BetaUploadFileV1FilesPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaGetFileMetadataV1FilesFileIdGet": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaGetFileMetadataV1FilesFileIdGet200),
          "4xx": decodeError("BetaGetFileMetadataV1FilesFileIdGet4XX", BetaGetFileMetadataV1FilesFileIdGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaDeleteFileV1FilesFileIdDelete": (fileId, options) =>
      HttpClientRequest.delete(`/v1/files/${fileId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaDeleteFileV1FilesFileIdDelete200),
          "4xx": decodeError("BetaDeleteFileV1FilesFileIdDelete4XX", BetaDeleteFileV1FilesFileIdDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaDownloadFileV1FilesFileIdContentGet": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}/content?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          orElse: unexpectedStatus
        }))
      ),
    "betaDownloadFileV1FilesFileIdContentGetStream": (fileId, options) =>
      HttpClientRequest.get(`/v1/files/${fileId}/content?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        binaryRequest
      ),
    "betaListSkillsV1SkillsGet": (options) =>
      HttpClientRequest.get(`/v1/skills?beta=true`).pipe(
        HttpClientRequest.setUrlParams({
          "page": options?.params?.["page"] as any,
          "limit": options?.params?.["limit"] as any,
          "source": options?.params?.["source"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaListSkillsV1SkillsGet200),
          "4xx": decodeError("BetaListSkillsV1SkillsGet4XX", BetaListSkillsV1SkillsGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaCreateSkillV1SkillsPost": (options) =>
      HttpClientRequest.post(`/v1/skills?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaCreateSkillV1SkillsPost200),
          "4xx": decodeError("BetaCreateSkillV1SkillsPost4XX", BetaCreateSkillV1SkillsPost4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaGetSkillV1SkillsSkillIdGet": (skillId, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaGetSkillV1SkillsSkillIdGet200),
          "4xx": decodeError("BetaGetSkillV1SkillsSkillIdGet4XX", BetaGetSkillV1SkillsSkillIdGet4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaDeleteSkillV1SkillsSkillIdDelete": (skillId, options) =>
      HttpClientRequest.delete(`/v1/skills/${skillId}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaDeleteSkillV1SkillsSkillIdDelete200),
          "4xx": decodeError("BetaDeleteSkillV1SkillsSkillIdDelete4XX", BetaDeleteSkillV1SkillsSkillIdDelete4XX),
          orElse: unexpectedStatus
        }))
      ),
    "betaListSkillVersionsV1SkillsSkillIdVersionsGet": (skillId, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}/versions?beta=true`).pipe(
        HttpClientRequest.setUrlParams({
          "page": options?.params?.["page"] as any,
          "limit": options?.params?.["limit"] as any
        }),
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaListSkillVersionsV1SkillsSkillIdVersionsGet200),
          "4xx": decodeError(
            "BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX",
            BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "betaCreateSkillVersionV1SkillsSkillIdVersionsPost": (skillId, options) =>
      HttpClientRequest.post(`/v1/skills/${skillId}/versions?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options.params?.["anthropic-version"] ?? undefined
        }),
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaCreateSkillVersionV1SkillsSkillIdVersionsPost200),
          "4xx": decodeError(
            "BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX",
            BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "betaGetSkillVersionV1SkillsSkillIdVersionsVersionGet": (skillId, version, options) =>
      HttpClientRequest.get(`/v1/skills/${skillId}/versions/${version}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet200),
          "4xx": decodeError(
            "BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX",
            BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX
          ),
          orElse: unexpectedStatus
        }))
      ),
    "betaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete": (skillId, version, options) =>
      HttpClientRequest.delete(`/v1/skills/${skillId}/versions/${version}?beta=true`).pipe(
        HttpClientRequest.setHeaders({
          "anthropic-beta": options?.params?.["anthropic-beta"] ?? undefined,
          "anthropic-version": options?.params?.["anthropic-version"] ?? undefined,
          "x-api-key": options?.params?.["x-api-key"] ?? undefined
        }),
        withResponse(options?.config)(HttpClientResponse.matchStatus({
          "2xx": decodeSuccess(BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200),
          "4xx": decodeError(
            "BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX",
            BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX
          ),
          orElse: unexpectedStatus
        }))
      )
  }
}

export interface AnthropicClient {
  readonly httpClient: HttpClient.HttpClient
  /**
   * Send a structured list of input messages with text and/or image content, and the model will generate the next message in the conversation.
   *
   * The Messages API can be used for either single queries or stateless multi-turn conversations.
   *
   * Learn more about the Messages API in our [user guide](https://docs.claude.com/en/docs/initial-setup)
   */
  readonly "messagesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof MessagesPostParams.Encoded | undefined
      readonly payload: typeof MessagesPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessagesPost200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError | AnthropicClientError<"MessagesPost4XX", typeof MessagesPost4XX.Type>
  >
  /**
   * [Legacy] Create a Text Completion.
   *
   * The Text Completions API is a legacy API. We recommend using the [Messages API](https://docs.claude.com/en/api/messages) going forward.
   *
   * Future models and features will not be compatible with Text Completions. See our [migration guide](https://docs.claude.com/en/api/migrating-from-text-completions-to-messages) for guidance in migrating from Text Completions to Messages.
   */
  readonly "completePost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof CompletePostParams.Encoded | undefined
      readonly payload: typeof CompletePostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof CompletePost200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError | AnthropicClientError<"CompletePost4XX", typeof CompletePost4XX.Type>
  >
  /**
   * List available models.
   *
   * The Models API response can be used to determine which models are available for use in the API. More recently released models are listed first.
   */
  readonly "modelsList": <Config extends OperationConfig>(
    options:
      | { readonly params?: typeof ModelsListParams.Encoded | undefined; readonly config?: Config | undefined }
      | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof ModelsList200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError | AnthropicClientError<"ModelsList4XX", typeof ModelsList4XX.Type>
  >
  /**
   * Get a specific model.
   *
   * The Models API response can be used to determine information about a specific model or resolve a model alias to a model ID.
   */
  readonly "modelsGet": <Config extends OperationConfig>(
    modelId: string,
    options:
      | { readonly params?: typeof ModelsGetParams.Encoded | undefined; readonly config?: Config | undefined }
      | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof ModelsGet200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError | AnthropicClientError<"ModelsGet4XX", typeof ModelsGet4XX.Type>
  >
  /**
   * List all Message Batches within a Workspace. Most recently created batches are returned first.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesList": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof MessageBatchesListParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessageBatchesList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesList4XX", typeof MessageBatchesList4XX.Type>
  >
  /**
   * Send a batch of Message creation requests.
   *
   * The Message Batches API can be used to process multiple Messages API requests at once. Once a Message Batch is created, it begins processing immediately. Batches can take up to 24 hours to complete.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof MessageBatchesPostParams.Encoded | undefined
      readonly payload: typeof MessageBatchesPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessageBatchesPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesPost4XX", typeof MessageBatchesPost4XX.Type>
  >
  /**
   * This endpoint is idempotent and can be used to poll for Message Batch completion. To access the results of a Message Batch, make a request to the `results_url` field in the response.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesRetrieve": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof MessageBatchesRetrieveParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessageBatchesRetrieve200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesRetrieve4XX", typeof MessageBatchesRetrieve4XX.Type>
  >
  /**
   * Delete a Message Batch.
   *
   * Message Batches can only be deleted once they've finished processing. If you'd like to delete an in-progress batch, you must first cancel it.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesDelete": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof MessageBatchesDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessageBatchesDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesDelete4XX", typeof MessageBatchesDelete4XX.Type>
  >
  /**
   * Batches may be canceled any time before processing ends. Once cancellation is initiated, the batch enters a `canceling` state, at which time the system may complete any in-progress, non-interruptible requests before finalizing cancellation.
   *
   * The number of canceled requests is specified in `request_counts`. To determine which requests were canceled, check the individual results within the batch. Note that cancellation may not result in any canceled requests if they were non-interruptible.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesCancel": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof MessageBatchesCancelParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessageBatchesCancel200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesCancel4XX", typeof MessageBatchesCancel4XX.Type>
  >
  /**
   * Streams the results of a Message Batch as a `.jsonl` file.
   *
   * Each line in the file is a JSON object containing the result of a single request in the Message Batch. Results are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "messageBatchesResults": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof MessageBatchesResultsParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessageBatchesResults4XX", typeof MessageBatchesResults4XX.Type>
  >
  /**
   * Count the number of tokens in a Message.
   *
   * The Token Count API can be used to count the number of tokens in a Message, including tools, images, and documents, without creating it.
   *
   * Learn more about token counting in our [user guide](https://docs.claude.com/en/docs/build-with-claude/token-counting)
   */
  readonly "messagesCountTokensPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof MessagesCountTokensPostParams.Encoded | undefined
      readonly payload: typeof MessagesCountTokensPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof MessagesCountTokensPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"MessagesCountTokensPost4XX", typeof MessagesCountTokensPost4XX.Type>
  >
  /**
   * List Files
   */
  readonly "listFilesV1FilesGet": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof ListFilesV1FilesGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListFilesV1FilesGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"ListFilesV1FilesGet4XX", typeof ListFilesV1FilesGet4XX.Type>
  >
  /**
   * Upload File
   */
  readonly "uploadFileV1FilesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof UploadFileV1FilesPostParams.Encoded | undefined
      readonly payload: typeof UploadFileV1FilesPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof UploadFileV1FilesPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"UploadFileV1FilesPost4XX", typeof UploadFileV1FilesPost4XX.Type>
  >
  /**
   * Get File Metadata
   */
  readonly "getFileMetadataV1FilesFileIdGet": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof GetFileMetadataV1FilesFileIdGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof GetFileMetadataV1FilesFileIdGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"GetFileMetadataV1FilesFileIdGet4XX", typeof GetFileMetadataV1FilesFileIdGet4XX.Type>
  >
  /**
   * Delete File
   */
  readonly "deleteFileV1FilesFileIdDelete": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof DeleteFileV1FilesFileIdDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof DeleteFileV1FilesFileIdDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"DeleteFileV1FilesFileIdDelete4XX", typeof DeleteFileV1FilesFileIdDelete4XX.Type>
  >
  /**
   * Download File
   */
  readonly "downloadFileV1FilesFileIdContentGet": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof DownloadFileV1FilesFileIdContentGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<WithOptionalResponse<void, Config>, HttpClientError.HttpClientError | SchemaError>
  /**
   * Download File
   */
  readonly "downloadFileV1FilesFileIdContentGetStream": (
    fileId: string,
    options: { readonly params?: typeof DownloadFileV1FilesFileIdContentGetParams.Encoded | undefined } | undefined
  ) => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>
  /**
   * List Skills
   */
  readonly "listSkillsV1SkillsGet": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof ListSkillsV1SkillsGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListSkillsV1SkillsGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"ListSkillsV1SkillsGet4XX", typeof ListSkillsV1SkillsGet4XX.Type>
  >
  /**
   * Create Skill
   */
  readonly "createSkillV1SkillsPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof CreateSkillV1SkillsPostParams.Encoded | undefined
      readonly payload: typeof CreateSkillV1SkillsPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof CreateSkillV1SkillsPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"CreateSkillV1SkillsPost4XX", typeof CreateSkillV1SkillsPost4XX.Type>
  >
  /**
   * Get Skill
   */
  readonly "getSkillV1SkillsSkillIdGet": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof GetSkillV1SkillsSkillIdGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof GetSkillV1SkillsSkillIdGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"GetSkillV1SkillsSkillIdGet4XX", typeof GetSkillV1SkillsSkillIdGet4XX.Type>
  >
  /**
   * Delete Skill
   */
  readonly "deleteSkillV1SkillsSkillIdDelete": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof DeleteSkillV1SkillsSkillIdDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof DeleteSkillV1SkillsSkillIdDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"DeleteSkillV1SkillsSkillIdDelete4XX", typeof DeleteSkillV1SkillsSkillIdDelete4XX.Type>
  >
  /**
   * List Skill Versions
   */
  readonly "listSkillVersionsV1SkillsSkillIdVersionsGet": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof ListSkillVersionsV1SkillsSkillIdVersionsGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListSkillVersionsV1SkillsSkillIdVersionsGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "ListSkillVersionsV1SkillsSkillIdVersionsGet4XX",
      typeof ListSkillVersionsV1SkillsSkillIdVersionsGet4XX.Type
    >
  >
  /**
   * Create Skill Version
   */
  readonly "createSkillVersionV1SkillsSkillIdVersionsPost": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof CreateSkillVersionV1SkillsSkillIdVersionsPostParams.Encoded | undefined
      readonly payload: typeof CreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof CreateSkillVersionV1SkillsSkillIdVersionsPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "CreateSkillVersionV1SkillsSkillIdVersionsPost4XX",
      typeof CreateSkillVersionV1SkillsSkillIdVersionsPost4XX.Type
    >
  >
  /**
   * Get Skill Version
   */
  readonly "getSkillVersionV1SkillsSkillIdVersionsVersionGet": <Config extends OperationConfig>(
    skillId: string,
    version: string,
    options: {
      readonly params?: typeof GetSkillVersionV1SkillsSkillIdVersionsVersionGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof GetSkillVersionV1SkillsSkillIdVersionsVersionGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX",
      typeof GetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX.Type
    >
  >
  /**
   * Delete Skill Version
   */
  readonly "deleteSkillVersionV1SkillsSkillIdVersionsVersionDelete": <Config extends OperationConfig>(
    skillId: string,
    version: string,
    options: {
      readonly params?: typeof DeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX",
      typeof DeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX.Type
    >
  >
  /**
   * Send a structured list of input messages with text and/or image content, and the model will generate the next message in the conversation.
   *
   * The Messages API can be used for either single queries or stateless multi-turn conversations.
   *
   * Learn more about the Messages API in our [user guide](https://docs.claude.com/en/docs/initial-setup)
   */
  readonly "betaMessagesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaMessagesPostParams.Encoded | undefined
      readonly payload: typeof BetaMessagesPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessagesPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessagesPost4XX", typeof BetaMessagesPost4XX.Type>
  >
  /**
   * List available models.
   *
   * The Models API response can be used to determine which models are available for use in the API. More recently released models are listed first.
   */
  readonly "betaModelsList": <Config extends OperationConfig>(
    options:
      | { readonly params?: typeof BetaModelsListParams.Encoded | undefined; readonly config?: Config | undefined }
      | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaModelsList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaModelsList4XX", typeof BetaModelsList4XX.Type>
  >
  /**
   * Get a specific model.
   *
   * The Models API response can be used to determine information about a specific model or resolve a model alias to a model ID.
   */
  readonly "betaModelsGet": <Config extends OperationConfig>(
    modelId: string,
    options:
      | { readonly params?: typeof BetaModelsGetParams.Encoded | undefined; readonly config?: Config | undefined }
      | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaModelsGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaModelsGet4XX", typeof BetaModelsGet4XX.Type>
  >
  /**
   * List all Message Batches within a Workspace. Most recently created batches are returned first.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesList": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaMessageBatchesListParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessageBatchesList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesList4XX", typeof BetaMessageBatchesList4XX.Type>
  >
  /**
   * Send a batch of Message creation requests.
   *
   * The Message Batches API can be used to process multiple Messages API requests at once. Once a Message Batch is created, it begins processing immediately. Batches can take up to 24 hours to complete.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaMessageBatchesPostParams.Encoded | undefined
      readonly payload: typeof BetaMessageBatchesPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessageBatchesPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesPost4XX", typeof BetaMessageBatchesPost4XX.Type>
  >
  /**
   * This endpoint is idempotent and can be used to poll for Message Batch completion. To access the results of a Message Batch, make a request to the `results_url` field in the response.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesRetrieve": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof BetaMessageBatchesRetrieveParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessageBatchesRetrieve200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesRetrieve4XX", typeof BetaMessageBatchesRetrieve4XX.Type>
  >
  /**
   * Delete a Message Batch.
   *
   * Message Batches can only be deleted once they've finished processing. If you'd like to delete an in-progress batch, you must first cancel it.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesDelete": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof BetaMessageBatchesDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessageBatchesDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesDelete4XX", typeof BetaMessageBatchesDelete4XX.Type>
  >
  /**
   * Batches may be canceled any time before processing ends. Once cancellation is initiated, the batch enters a `canceling` state, at which time the system may complete any in-progress, non-interruptible requests before finalizing cancellation.
   *
   * The number of canceled requests is specified in `request_counts`. To determine which requests were canceled, check the individual results within the batch. Note that cancellation may not result in any canceled requests if they were non-interruptible.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesCancel": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof BetaMessageBatchesCancelParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessageBatchesCancel200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesCancel4XX", typeof BetaMessageBatchesCancel4XX.Type>
  >
  /**
   * Streams the results of a Message Batch as a `.jsonl` file.
   *
   * Each line in the file is a JSON object containing the result of a single request in the Message Batch. Results are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests.
   *
   * Learn more about the Message Batches API in our [user guide](https://docs.claude.com/en/docs/build-with-claude/batch-processing)
   */
  readonly "betaMessageBatchesResults": <Config extends OperationConfig>(
    messageBatchId: string,
    options: {
      readonly params?: typeof BetaMessageBatchesResultsParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessageBatchesResults4XX", typeof BetaMessageBatchesResults4XX.Type>
  >
  /**
   * Count the number of tokens in a Message.
   *
   * The Token Count API can be used to count the number of tokens in a Message, including tools, images, and documents, without creating it.
   *
   * Learn more about token counting in our [user guide](https://docs.claude.com/en/docs/build-with-claude/token-counting)
   */
  readonly "betaMessagesCountTokensPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaMessagesCountTokensPostParams.Encoded | undefined
      readonly payload: typeof BetaMessagesCountTokensPostRequestJson.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaMessagesCountTokensPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaMessagesCountTokensPost4XX", typeof BetaMessagesCountTokensPost4XX.Type>
  >
  /**
   * List Files
   */
  readonly "betaListFilesV1FilesGet": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaListFilesV1FilesGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaListFilesV1FilesGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaListFilesV1FilesGet4XX", typeof BetaListFilesV1FilesGet4XX.Type>
  >
  /**
   * Upload File
   */
  readonly "betaUploadFileV1FilesPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaUploadFileV1FilesPostParams.Encoded | undefined
      readonly payload: typeof BetaUploadFileV1FilesPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaUploadFileV1FilesPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaUploadFileV1FilesPost4XX", typeof BetaUploadFileV1FilesPost4XX.Type>
  >
  /**
   * Get File Metadata
   */
  readonly "betaGetFileMetadataV1FilesFileIdGet": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof BetaGetFileMetadataV1FilesFileIdGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaGetFileMetadataV1FilesFileIdGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaGetFileMetadataV1FilesFileIdGet4XX", typeof BetaGetFileMetadataV1FilesFileIdGet4XX.Type>
  >
  /**
   * Delete File
   */
  readonly "betaDeleteFileV1FilesFileIdDelete": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof BetaDeleteFileV1FilesFileIdDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaDeleteFileV1FilesFileIdDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaDeleteFileV1FilesFileIdDelete4XX", typeof BetaDeleteFileV1FilesFileIdDelete4XX.Type>
  >
  /**
   * Download File
   */
  readonly "betaDownloadFileV1FilesFileIdContentGet": <Config extends OperationConfig>(
    fileId: string,
    options: {
      readonly params?: typeof BetaDownloadFileV1FilesFileIdContentGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<WithOptionalResponse<void, Config>, HttpClientError.HttpClientError | SchemaError>
  /**
   * Download File
   */
  readonly "betaDownloadFileV1FilesFileIdContentGetStream": (
    fileId: string,
    options: { readonly params?: typeof BetaDownloadFileV1FilesFileIdContentGetParams.Encoded | undefined } | undefined
  ) => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>
  /**
   * List Skills
   */
  readonly "betaListSkillsV1SkillsGet": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaListSkillsV1SkillsGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaListSkillsV1SkillsGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaListSkillsV1SkillsGet4XX", typeof BetaListSkillsV1SkillsGet4XX.Type>
  >
  /**
   * Create Skill
   */
  readonly "betaCreateSkillV1SkillsPost": <Config extends OperationConfig>(
    options: {
      readonly params?: typeof BetaCreateSkillV1SkillsPostParams.Encoded | undefined
      readonly payload: typeof BetaCreateSkillV1SkillsPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaCreateSkillV1SkillsPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaCreateSkillV1SkillsPost4XX", typeof BetaCreateSkillV1SkillsPost4XX.Type>
  >
  /**
   * Get Skill
   */
  readonly "betaGetSkillV1SkillsSkillIdGet": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof BetaGetSkillV1SkillsSkillIdGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaGetSkillV1SkillsSkillIdGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<"BetaGetSkillV1SkillsSkillIdGet4XX", typeof BetaGetSkillV1SkillsSkillIdGet4XX.Type>
  >
  /**
   * Delete Skill
   */
  readonly "betaDeleteSkillV1SkillsSkillIdDelete": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof BetaDeleteSkillV1SkillsSkillIdDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaDeleteSkillV1SkillsSkillIdDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "BetaDeleteSkillV1SkillsSkillIdDelete4XX",
      typeof BetaDeleteSkillV1SkillsSkillIdDelete4XX.Type
    >
  >
  /**
   * List Skill Versions
   */
  readonly "betaListSkillVersionsV1SkillsSkillIdVersionsGet": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof BetaListSkillVersionsV1SkillsSkillIdVersionsGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaListSkillVersionsV1SkillsSkillIdVersionsGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX",
      typeof BetaListSkillVersionsV1SkillsSkillIdVersionsGet4XX.Type
    >
  >
  /**
   * Create Skill Version
   */
  readonly "betaCreateSkillVersionV1SkillsSkillIdVersionsPost": <Config extends OperationConfig>(
    skillId: string,
    options: {
      readonly params?: typeof BetaCreateSkillVersionV1SkillsSkillIdVersionsPostParams.Encoded | undefined
      readonly payload: typeof BetaCreateSkillVersionV1SkillsSkillIdVersionsPostRequestFormData.Encoded
      readonly config?: Config | undefined
    }
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaCreateSkillVersionV1SkillsSkillIdVersionsPost200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX",
      typeof BetaCreateSkillVersionV1SkillsSkillIdVersionsPost4XX.Type
    >
  >
  /**
   * Get Skill Version
   */
  readonly "betaGetSkillVersionV1SkillsSkillIdVersionsVersionGet": <Config extends OperationConfig>(
    skillId: string,
    version: string,
    options: {
      readonly params?: typeof BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGetParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX",
      typeof BetaGetSkillVersionV1SkillsSkillIdVersionsVersionGet4XX.Type
    >
  >
  /**
   * Delete Skill Version
   */
  readonly "betaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete": <Config extends OperationConfig>(
    skillId: string,
    version: string,
    options: {
      readonly params?: typeof BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDeleteParams.Encoded | undefined
      readonly config?: Config | undefined
    } | undefined
  ) => Effect.Effect<
    WithOptionalResponse<typeof BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | AnthropicClientError<
      "BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX",
      typeof BetaDeleteSkillVersionV1SkillsSkillIdVersionsVersionDelete4XX.Type
    >
  >
}

export interface AnthropicClientError<Tag extends string, E> {
  readonly _tag: Tag
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly cause: E
}

class AnthropicClientErrorImpl extends Data.Error<{
  _tag: string
  cause: any
  request: HttpClientRequest.HttpClientRequest
  response: HttpClientResponse.HttpClientResponse
}> {}

export const AnthropicClientError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse
): AnthropicClientError<Tag, E> =>
  new AnthropicClientErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request
  }) as any
