/**
 * The `AnthropicTool` module defines Anthropic provider tools and the schemas
 * for their inputs and results. It covers Anthropic-owned tools such as Bash,
 * Code Execution, Computer Use, Memory, Text Editor, Web Search, Web Fetch, and
 * Tool Search, which can be attached to Anthropic-backed Effect AI language
 * model requests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Tool from "effect/ai/Tool"
import * as Schema from "effect/Schema"
import * as Generated from "./Generated.ts"

/**
 * Union of all Anthropic provider-defined tool definitions exported by this module.
 *
 * **When to use**
 *
 * Use when a helper, collection, or option accepts any Anthropic
 * provider-defined tool value created by this module.
 *
 * **Details**
 *
 * The union is built from the return types of the exported constructors,
 * including Bash, Code Execution, Computer Use, Memory, Text Editor, Tool
 * Search, Web Fetch, and Web Search tool versions.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AnthropicTool =
  | ReturnType<typeof Bash_20241022>
  | ReturnType<typeof Bash_20250124>
  | ReturnType<typeof CodeExecution_20250522>
  | ReturnType<typeof CodeExecution_20250825>
  | ReturnType<typeof ComputerUse_20241022>
  | ReturnType<typeof ComputerUse_20250124>
  | ReturnType<typeof ComputerUse_20251124>
  | ReturnType<typeof Memory_20250818>
  | ReturnType<typeof TextEditor_20241022>
  | ReturnType<typeof TextEditor_20250124>
  | ReturnType<typeof TextEditor_20250429>
  | ReturnType<typeof TextEditor_20250728>
  | ReturnType<typeof ToolSearchRegex_20251119>
  | ReturnType<typeof ToolSearchBM25_20251119>
  | ReturnType<typeof WebFetch_20250910>
  | ReturnType<typeof WebSearch_20250305>

// =============================================================================
// Bash
// =============================================================================

/**
 * Defines the Anthropic Bash tool (2024-10-22 version).
 *
 * **When to use**
 *
 * Use when you want the model to execute bash commands with the 2024-10-22
 * Anthropic computer-use beta.
 *
 * **Details**
 *
 * Allows the model to execute bash commands in a sandboxed environment.
 * Requires the "computer-use-2024-10-22" beta header.
 *
 * @see {@link Bash_20250124} for the newer 2025-01-24 version of the bash tool
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const Bash_20241022 = Tool.providerDefined({
  id: "anthropic.bash_20241022",
  customName: "AnthropicBash",
  providerName: "bash",
  requiresHandler: true,
  success: Schema.String,
  parameters: Schema.Struct({
    command: Schema.String,
    restart: Schema.optionalKey(Schema.Boolean)
  })
})

/**
 * Defines the Anthropic Bash tool (2025-01-24 version).
 *
 * **When to use**
 *
 * Use when you want the model to execute bash commands with the 2025-01-24
 * Anthropic computer-use beta.
 *
 * **Details**
 *
 * Allows the model to execute bash commands in a sandboxed environment.
 * Requires the "computer-use-2025-01-24" beta header.
 *
 * @see {@link Bash_20241022} for the older 2024-10-22 version of the bash tool
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const Bash_20250124 = Tool.providerDefined({
  id: "anthropic.bash_20250124",
  customName: "AnthropicBash",
  providerName: "bash",
  requiresHandler: true,
  success: Schema.String,
  parameters: Schema.Struct({
    command: Schema.String,
    restart: Schema.optionalKey(Schema.Boolean)
  })
})

// =============================================================================
// Code Execution
// =============================================================================

// -----------------------------------------------------------------------------
// Code Execution 20250522 Parameters
// -----------------------------------------------------------------------------

/**
 * Schema for a code execution request that asks Anthropic to run source code as a programmatic tool call.
 *
 * **When to use**
 *
 * Use when constructing or validating a programmatic tool call for the Anthropic
 * Code Execution tool.
 *
 * @see {@link CodeExecution_20250522} for the parent tool definition
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecutionProgrammaticToolCall = Schema.Struct({
  type: Schema.Literal("programmatic-tool-call"),
  /**
   * The code to execute.
   */
  code: Schema.String
})
/**
 * Input payload for a programmatic code execution tool call, including the source code to execute.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecutionProgrammaticToolCall = typeof CodeExecutionProgrammaticToolCall.Type

/**
 * Schema for the `bash_code_execution` input variant of Anthropic Code Execution.
 *
 * **When to use**
 *
 * Use when validating or constructing a bash command request for
 * `CodeExecution_20250522`.
 *
 * **Details**
 *
 * The schema requires `type` to be `"bash_code_execution"` and `command` to
 * contain the bash command sent to Anthropic.
 *
 * @see {@link CodeExecution_20250522} for the provider-defined tool that consumes this input variant
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecutionBashCommand = Schema.Struct({
  type: Schema.Literal("bash_code_execution"),
  /**
   * The bash command to execute.
   */
  command: Schema.String
})
/**
 * Input payload for a bash command routed through the Anthropic code execution tool.
 *
 * **When to use**
 *
 * Use when representing a provider-executed bash command request for the
 * 2025-05-22 code execution tool.
 *
 * **Details**
 *
 * The payload uses `type: "bash_code_execution"` to distinguish bash execution
 * from programmatic code and text editor operations, and `command` contains the
 * bash command to run.
 *
 * @see {@link CodeExecutionProgrammaticToolCall} for programmatic code execution input
 * @see {@link CodeExecutionTextEditorView} for viewing files through text editor code execution
 * @see {@link CodeExecutionTextEditorCreate} for creating files through text editor code execution
 * @see {@link CodeExecutionTextEditorStrReplace} for replacing text through text editor code execution
 * @see {@link CodeExecution_20250522} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecutionBashCommand = typeof CodeExecutionBashCommand.Type

/**
 * Schema for a code execution text editor request that views a file by path.
 *
 * **When to use**
 *
 * Use when you need the schema for provider-bound code-execution view requests
 * before distinguishing them from create or replace text-editor commands.
 *
 * **Details**
 *
 * The encoded payload uses `type: "text_editor_code_execution"`,
 * `command: "view"`, and a `path` string.
 *
 * @see {@link CodeExecutionTextEditorCreate} for the command that creates a file
 * @see {@link CodeExecutionTextEditorStrReplace} for the command that replaces text in a file
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecutionTextEditorView = Schema.Struct({
  type: Schema.Literal("text_editor_code_execution"),
  command: Schema.Literal("view"),
  /**
   * Path to the file to view.
   */
  path: Schema.String
})
/**
 * Input payload for the `view` command of Anthropic's text editor code execution tool.
 *
 * **When to use**
 *
 * Use when working at the Anthropic protocol boundary and the code-execution
 * view request must be distinguished from standalone text-editor view requests.
 *
 * **Details**
 *
 * The payload is discriminated by `type: "text_editor_code_execution"` and
 * `command: "view"`. The `path` field identifies the file to view.
 *
 * **Gotchas**
 *
 * This code execution view payload does not include `view_range`; line ranges
 * are part of the standalone text editor view payload, not this code execution
 * payload.
 *
 * @see {@link CodeExecution_20250522} for the provider-defined code execution tool that includes this payload
 * @see {@link TextEditorViewCommand} for the standalone text editor view payload
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecutionTextEditorView = typeof CodeExecutionTextEditorView.Type

/**
 * Schema for a text editor code execution request that creates a file at a path.
 *
 * **When to use**
 *
 * Use when validating or constructing an Anthropic `text_editor_code_execution`
 * tool call that should create a file.
 *
 * **Details**
 *
 * The request is discriminated by `type: "text_editor_code_execution"` and
 * `command: "create"`. It requires `path` and accepts optional `file_text`; the
 * schema allows `file_text` to be omitted, `null`, or a string.
 *
 * @see {@link CodeExecution_20250522} for the provider-defined tool that consumes this request
 * @see {@link CodeExecutionTextEditorView} for the matching view request
 * @see {@link CodeExecutionTextEditorStrReplace} for the matching replace request
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecutionTextEditorCreate = Schema.Struct({
  type: Schema.Literal("text_editor_code_execution"),
  command: Schema.Literal("create"),
  /**
   * Path where the file should be created.
   */
  path: Schema.String,
  /**
   * The content to write to the new file.
   */
  file_text: Schema.optional(Schema.NullOr(Schema.String))
})
/**
 * Input payload for creating a file through the text editor code execution tool, optionally including initial file text.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecutionTextEditorCreate = typeof CodeExecutionTextEditorCreate.Type

/**
 * Schema for a code execution text editor request that replaces one exact string in a file.
 *
 * **When to use**
 *
 * Use when validating or constructing the `str_replace` text editor operation
 * for the 2025-05-22 Anthropic code execution tool.
 *
 * **Gotchas**
 *
 * The `old_str` must match the file contents exactly, including whitespace and
 * indentation, and must identify a single occurrence.
 *
 * @see {@link CodeExecutionTextEditorView} for reading file contents before choosing the replacement text
 * @see {@link CodeExecution_20250522} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecutionTextEditorStrReplace = Schema.Struct({
  type: Schema.Literal("text_editor_code_execution"),
  command: Schema.Literal("str_replace"),
  /**
   * Path to the file to modify.
   */
  path: Schema.String,
  /**
   * The text to replace.
   */
  old_str: Schema.String,
  /**
   * The replacement text.
   */
  new_str: Schema.String
})
/**
 * Input payload for replacing text in a file through the text editor code execution tool.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecutionTextEditorStrReplace = typeof CodeExecutionTextEditorStrReplace.Type

const CodeExecution_20250522_Parameters = Schema.Union([
  CodeExecutionProgrammaticToolCall,
  CodeExecutionBashCommand,
  CodeExecutionTextEditorView,
  CodeExecutionTextEditorCreate,
  CodeExecutionTextEditorStrReplace
])

// -----------------------------------------------------------------------------
// Code Execution 20250825 Parameters
// -----------------------------------------------------------------------------

/**
 * Schema for the 2025-08-25 code execution tool input, containing the code to execute.
 *
 * **When to use**
 *
 * Use when you need the schema for code-execution input at the Anthropic
 * protocol boundary before sending source code to the 2025-08-25 tool.
 *
 * @see {@link CodeExecution_20250825} for the provider-defined tool that consumes this schema
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CodeExecution_20250825_Parameters = Schema.Struct({
  /**
   * The code to execute.
   */
  code: Schema.String
})
/**
 * Input payload for the 2025-08-25 Anthropic code execution tool.
 *
 * **When to use**
 *
 * Use when exposing the 2025-08-25 code-execution payload separately from the
 * provider tool definition, such as at a transport or persistence boundary.
 *
 * **Details**
 *
 * The payload has a single `code` field containing the source code string to
 * execute.
 *
 * @see {@link CodeExecution_20250825} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CodeExecution_20250825_Parameters = typeof CodeExecution_20250825_Parameters.Type

// -----------------------------------------------------------------------------
// Code Execution Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the Anthropic Code Execution tool (2025-05-22 version).
 *
 * **When to use**
 *
 * Use when you want the model to execute code in a sandboxed environment with
 * the 2025-05-22 Anthropic code-execution beta.
 *
 * **Details**
 *
 * Allows the model to execute code in a sandboxed environment with support
 * for multiple execution types including programmatic tool calls, bash
 * execution, and text editor operations.
 *
 * @see {@link CodeExecutionProgrammaticToolCall} for the programmatic tool call schema
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const CodeExecution_20250522 = Tool.providerDefined({
  id: "anthropic.code_execution_20250522",
  customName: "AnthropicCodeExecution",
  providerName: "code_execution",
  parameters: CodeExecution_20250522_Parameters,
  success: Generated.BetaResponseCodeExecutionResultBlock,
  failure: Generated.BetaResponseCodeExecutionToolResultError
})

/**
 * Defines the Anthropic Code Execution tool (2025-08-25 version).
 *
 * **When to use**
 *
 * Use when you want the model to execute code in a sandboxed environment with
 * the 2025-08-25 Anthropic code-execution beta.
 *
 * **Details**
 *
 * Requires the `code-execution-2025-08-25` beta header and uses
 * `CodeExecution_20250825_Parameters` as its input schema.
 *
 * @see {@link CodeExecution_20250522} for the older 2025-05-22 code execution tool
 * @see {@link CodeExecution_20250825_Parameters} for the input schema consumed by this tool
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const CodeExecution_20250825 = Tool.providerDefined({
  id: "anthropic.code_execution_20250825",
  customName: "AnthropicCodeExecution",
  providerName: "code_execution",
  parameters: CodeExecution_20250825_Parameters,
  success: Schema.Union([
    Generated.BetaResponseCodeExecutionResultBlock,
    Generated.BetaResponseBashCodeExecutionResultBlock,
    Generated.BetaResponseTextEditorCodeExecutionViewResultBlock,
    Generated.BetaResponseTextEditorCodeExecutionCreateResultBlock,
    Generated.BetaResponseTextEditorCodeExecutionStrReplaceResultBlock
  ]),
  failure: Schema.Union([
    Generated.BetaResponseCodeExecutionToolResultError,
    Generated.BetaResponseBashCodeExecutionToolResultError,
    Generated.BetaResponseTextEditorCodeExecutionToolResultError
  ])
})

// =============================================================================
// Computer Use
// =============================================================================

// -----------------------------------------------------------------------------
// Common Types
// -----------------------------------------------------------------------------

/**
 * Schema for an `[x, y]` screen coordinate in pixels.
 *
 * **When to use**
 *
 * Use when validating computer-use action payloads that carry a single screen
 * position and provider-side bounds checks remain acceptable.
 *
 * **Details**
 *
 * This is a two-number tuple used by computer-use actions that accept screen
 * positions.
 *
 * **Gotchas**
 *
 * This schema validates tuple shape only and does not check display bounds.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Coordinate = Schema.Tuple([Schema.Int, Schema.Int])
/**
 * An `[x, y]` screen coordinate in pixels.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Coordinate = typeof Coordinate.Type

/**
 * Schema for an `[x1, y1, x2, y2]` screen region in pixels.
 *
 * **When to use**
 *
 * Use when validating computer-use action payloads that carry a rectangular
 * screen region and provider-side bounds checks remain acceptable.
 *
 * **Details**
 *
 * The tuple represents top-left and bottom-right corners.
 *
 * **Gotchas**
 *
 * This schema validates four numbers only and does not check coordinate ordering
 * or display bounds.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Region = Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int])
/**
 * An `[x1, y1, x2, y2]` screen region in pixels, from top-left to bottom-right.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Region = typeof Region.Type

/**
 * Schema for scroll direction literals: `"up"`, `"down"`, `"left"`, or `"right"`.
 *
 * @see {@link ComputerUseScrollAction} for the action payload that consumes this schema
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ScrollDirection = Schema.Literals(["up", "down", "left", "right"])
/**
 * Direction used by computer-use scroll actions: `"up"`, `"down"`, `"left"`, or `"right"`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ScrollDirection = typeof ScrollDirection.Type

/**
 * Schema for modifier key literals.
 *
 * **Details**
 *
 * Allowed values are `"alt"`, `"ctrl"`, `"meta"`, and `"shift"`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ModifierKey = Schema.Literals(["alt", "ctrl", "meta", "shift"])
/**
 * Modifier key literals.
 *
 * **Details**
 *
 * Allowed values are `"alt"`, `"ctrl"`, `"meta"`, and `"shift"`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ModifierKey = typeof ModifierKey.Type

// -----------------------------------------------------------------------------
// ComputerUse_20241022_Args
// -----------------------------------------------------------------------------

const ComputerUse_20241022_Args = Schema.Struct({
  /**
   * The width of the display being controlled by the model in pixels.
   */
  displayWidthPx: Schema.Int,

  /**
   * The height of the display being controlled by the model in pixels.
   */
  displayHeightPx: Schema.Int,

  /**
   * The display number to control (only relevant for X11 environments). If
   * specified, the tool will be provided a display number in the tool
   * definition.
   */
  displayNumber: Schema.optional(Schema.Int)
})

const ComputerUse_20251124_Args = Schema.Struct({
  ...ComputerUse_20241022_Args.fields,
  enableZoom: Schema.optional(Schema.Boolean)
})

// -----------------------------------------------------------------------------
// Computer Use 20241022 Actions
// -----------------------------------------------------------------------------

/**
 * Schema for a computer-use action that presses a key or key combination, such
 * as `"Return"`, `"ctrl+c"`, or `"ctrl+s"`.
 *
 * **When to use**
 *
 * Use when validating or constructing a computer-use action for keyboard
 * shortcuts or non-text key presses.
 *
 * @see {@link TypeAction} for entering ordinary text strings
 * @see {@link ComputerUseHoldKeyAction} for holding a key for a duration
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseKeyAction = Schema.Struct({
  action: Schema.Literal("key"),
  /**
   * The key to press.
   */
  text: Schema.String
})
/**
 * Computer-use action payload for pressing a key or key combination.
 *
 * **When to use**
 *
 * Use when typing parsed computer-use key action payloads after schema
 * validation, where provider-specific key-name validation is handled outside
 * TypeScript.
 *
 * **Details**
 *
 * The payload uses `action: "key"` and stores the key or key combination to
 * press in `text`, such as `"Return"`, `"ctrl+c"`, or `"ctrl+s"`.
 *
 * **Gotchas**
 *
 * `text` is typed as `string`; the paired schema does not validate
 * provider-specific key names or key combinations.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseKeyAction = typeof ComputerUseKeyAction.Type

/**
 * Schema for a computer-use action that performs a left click.
 *
 * **When to use**
 *
 * Use to validate or construct an Anthropic computer-use payload for clicking
 * once at the current mouse position or at a specific screen coordinate.
 *
 * **Details**
 *
 * The encoded payload uses `action: "left_click"`. The optional `coordinate`
 * field supplies the `[x, y]` pixel position; when omitted, the action uses the
 * current mouse position.
 *
 * **Gotchas**
 *
 * The coordinate schema only checks that the value is a two-number tuple. It
 * does not validate that the point falls within the configured display
 * dimensions.
 *
 * @see {@link ComputerUseDoubleClickAction} for performing a double click
 * @see {@link ComputerUseMouseMoveAction} for moving the mouse without clicking
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseLeftClickAction = Schema.Struct({
  action: Schema.Literal("left_click"),
  /**
   * The `[x, y]` coordinate on the screen to left click (defaults to the current
   * mouse position if omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for performing a left click, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseLeftClickAction = typeof ComputerUseLeftClickAction.Type

/**
 * Schema for a computer-use action that moves the mouse cursor to a required
 * `[x, y]` screen coordinate.
 *
 * **When to use**
 *
 * Use to validate or construct a mouse movement action for an Anthropic
 * computer-use tool call.
 *
 * **Details**
 *
 * The encoded payload has action `"mouse_move"` and a required `coordinate`
 * field containing the target `[x, y]` pixel position.
 *
 * **Gotchas**
 *
 * The coordinate schema only checks that the value is a two-number tuple. It
 * does not validate that the point falls within the configured display
 * dimensions.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseMouseMoveAction = Schema.Struct({
  action: Schema.Literal("mouse_move"),
  /**
   * The `[x, y]` coordinate on the screen to move to.
   */
  coordinate: Coordinate
})
/**
 * Computer-use action payload for moving the mouse cursor to a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseMouseMoveAction = typeof ComputerUseMouseMoveAction.Type

/**
 * Schema for a computer-use action that requests a screenshot of the current display.
 *
 * **When to use**
 *
 * Use to validate or construct a computer-use tool action that asks the handler
 * to capture the full current display.
 *
 * **Details**
 *
 * The payload contains only `action: "screenshot"` and does not include
 * coordinates or other options.
 *
 * @see {@link ComputerUseZoomAction} for requesting a zoomed-in screenshot of a specific screen region with the 2025-11-24 computer-use tool
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseScreenshotAction = Schema.Struct({
  action: Schema.Literal("screenshot")
})
/**
 * Computer-use action payload for capturing the current display.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseScreenshotAction = typeof ComputerUseScreenshotAction.Type

/**
 * Schema for a computer-use action that enters text.
 *
 * **When to use**
 *
 * Use to validate or construct a computer-use action for entering ordinary text
 * strings.
 *
 * **Details**
 *
 * The payload uses `action: "type"` and a `text` string containing the text to
 * enter.
 *
 * @see {@link ComputerUseKeyAction} for key presses and keyboard shortcuts
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TypeAction = Schema.Struct({
  action: Schema.Literal("type"),
  /**
   * The text to type.
   */
  text: Schema.String
})
/**
 * Computer-use action payload for typing a text string.
 *
 * **Details**
 *
 * The payload uses `action: "type"` and a `text` string containing the text to
 * enter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TypeAction = typeof TypeAction.Type

const ComputerUse_20241022_Actions = Schema.Union([
  ComputerUseKeyAction,
  ComputerUseLeftClickAction,
  ComputerUseMouseMoveAction,
  ComputerUseScreenshotAction,
  TypeAction
])

// -----------------------------------------------------------------------------
// Computer Use 20250124 Actions
// -----------------------------------------------------------------------------

/**
 * Schema for a computer-use action that performs a double click.
 *
 * **When to use**
 *
 * Use to validate or construct an Anthropic computer-use payload for double
 * clicking at the current mouse position or at a specific screen coordinate.
 *
 * **Details**
 *
 * The encoded payload uses `action: "double_click"`. The optional
 * `coordinate` field supplies the `[x, y]` pixel position; when omitted, the
 * action uses the current mouse position.
 *
 * **Gotchas**
 *
 * The coordinate schema only checks that the value is a two-number tuple. It
 * does not validate that the point falls within the configured display
 * dimensions.
 *
 * @see {@link ComputerUseLeftClickAction} for performing a single left click
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseDoubleClickAction = Schema.Struct({
  action: Schema.Literal("double_click"),
  /**
   * The coordinate to double click (defaults to the current mouse position if
   * omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for performing a double click, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseDoubleClickAction = typeof ComputerUseDoubleClickAction.Type

/**
 * Keeps a key pressed for a specified duration during computer-use execution.
 *
 * **When to use**
 *
 * Use to keep a keyboard key depressed for a fixed number of seconds in a
 * computer-use action sequence.
 *
 * **Details**
 *
 * The schema describes objects with `action: "hold_key"`, a `text` field
 * containing the key to hold, and a `duration` field containing the number of
 * seconds to hold it.
 *
 * **Gotchas**
 *
 * The schema only checks that `duration` is a number; it does not require a
 * positive value.
 *
 * @see {@link ComputerUseKeyAction} for pressing a key or key combination without holding it
 * @see {@link ComputerUseWaitAction} for pausing between actions without holding a key
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseHoldKeyAction = Schema.Struct({
  action: Schema.Literal("hold_key"),
  /**
   * The key to hold (e.g. `"shift"`, `"ctrl"`).
   */
  text: Schema.String,
  /**
   * The number of seconds to hold the key.
   */
  duration: Schema.Finite
})
/**
 * Computer-use action payload for holding a key for a specified duration.
 *
 * **When to use**
 *
 * Use to represent a key that should remain pressed for a measured interval.
 *
 * **Details**
 *
 * Set `action` to `"hold_key"`, `text` to the key to hold, and `duration` to
 * the number of seconds to hold it.
 *
 * @see {@link ComputerUseKeyAction} for a single key press or key combination without a hold duration
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseHoldKeyAction = typeof ComputerUseHoldKeyAction.Type

/**
 * Schema for a computer-use action that drags with the left mouse button.
 *
 * **When to use**
 *
 * Use to validate or construct an Anthropic computer-use payload for dragging
 * from one screen coordinate to another in a single action.
 *
 * **Details**
 *
 * The encoded payload uses `action: "left_click_drag"` and requires both
 * `start_coordinate` and `coordinate` as `[x, y]` pixel positions.
 *
 * **Gotchas**
 *
 * The coordinate schema only checks that each value is a two-number tuple. It
 * does not validate that either point falls within the configured display
 * dimensions.
 *
 * @see {@link ComputerUseLeftMouseDownAction} for starting a manual drag sequence
 * @see {@link ComputerUseLeftMouseUpAction} for ending a manual drag sequence
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseLeftClickDragAction = Schema.Struct({
  action: Schema.Literal("left_click_drag"),
  /**
   * The `[x, y]` coordinate to start dragging from.
   */
  start_coordinate: Coordinate,
  /**
   * The `[x, y]` coordinate to drag to.
   */
  coordinate: Coordinate
})
/**
 * Computer-use action payload for dragging from a start coordinate to an end coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseLeftClickDragAction = typeof ComputerUseLeftClickDragAction.Type

/**
 * Starts a left mouse button press without releasing it.
 *
 * **When to use**
 *
 * Use when constructing a manual click or drag sequence that should press and
 * hold the left mouse button before a later release.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseLeftMouseDownAction = Schema.Struct({
  action: Schema.Literal("left_mouse_down"),
  /**
   * The coordinate at which the left mouse button should be held down (defaults
   * to the current mouse position if omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for pressing and holding the left mouse button, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseLeftMouseDownAction = typeof ComputerUseLeftMouseDownAction.Type

/**
 * Releases the left mouse button.
 *
 * **When to use**
 *
 * Use when constructing a manual click or drag sequence that should release the
 * left mouse button after it was previously held down.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseLeftMouseUpAction = Schema.Struct({
  action: Schema.Literal("left_mouse_up"),
  /**
   * The coordinate at which the left mouse button should be released (defaults
   * to the current mouse position if omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for releasing the left mouse button, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseLeftMouseUpAction = typeof ComputerUseLeftMouseUpAction.Type

/**
 * Schema for a computer-use action that performs a middle click.
 *
 * **When to use**
 *
 * Use to validate or construct a middle-button click action for Anthropic
 * computer use, optionally targeting a specific screen coordinate.
 *
 * **Details**
 *
 * The payload must use `action: "middle_click"`. When `coordinate` is omitted,
 * the click occurs at the current mouse position.
 *
 * **Gotchas**
 *
 * This action is available in the 2025-01-24 computer-use action set and later;
 * it is not part of `ComputerUse_20241022`.
 *
 * @see {@link ComputerUse_20250124} for the provider-defined tool version that first accepts this action
 * @see {@link ComputerUseLeftClickAction} for primary-button clicks
 * @see {@link ComputerUseRightClickAction} for secondary-button clicks
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseMiddleClickAction = Schema.Struct({
  action: Schema.Literal("middle_click"),
  /**
   * The coordinate to middle click (defaults to the current mouse position if
   * omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for performing a middle click, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseMiddleClickAction = typeof ComputerUseMiddleClickAction.Type

/**
 * Schema for a computer-use action that performs a right click, optionally at a
 * specific screen coordinate.
 *
 * **When to use**
 *
 * Use to validate or construct the `right_click` action for an Anthropic
 * computer-use tool call.
 *
 * **Details**
 *
 * The optional `coordinate` field is an `[x, y]` screen coordinate in pixels.
 * When omitted, the right click is performed at the current mouse position.
 *
 * @see {@link ComputerUse_20250124} for the provider-defined computer-use tool version that introduced this action
 * @see {@link ComputerUseLeftClickAction} for the corresponding left-click action
 * @see {@link ComputerUseMiddleClickAction} for the corresponding middle-click action
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseRightClickAction = Schema.Struct({
  action: Schema.Literal("right_click"),
  /**
   * The coordinate to right click (defaults to the current mouse position if
   * omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for performing a right click, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseRightClickAction = typeof ComputerUseRightClickAction.Type

/**
 * Schema for a computer-use scroll action.
 *
 * **When to use**
 *
 * Use when validating or constructing Anthropic computer-use scroll payloads.
 *
 * **Details**
 *
 * The encoded payload uses `action: "scroll"`, an optional `coordinate`,
 * `scroll_direction`, and `scroll_amount`.
 *
 * **Gotchas**
 *
 * `coordinate` only checks a two-number tuple, and `scroll_amount` is only
 * `Schema.Int`.
 *
 * @see {@link ComputerUse_20250124} for the tool version that accepts this action
 * @see {@link ScrollDirection} for the accepted direction literals
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseScrollAction = Schema.Struct({
  action: Schema.Literal("scroll"),
  /**
   * The coordinate to start scrolling from (defaults to the current mouse
   * position if omitted).
   */
  coordinate: Schema.optionalKey(Coordinate),
  /**
   * The direction to scroll.
   */
  scroll_direction: ScrollDirection,
  /**
   * The amount to scroll (in pixels or scroll units).
   */
  scroll_amount: Schema.Int
})
/**
 * Computer-use action payload for scrolling by a specified amount in a specified direction, optionally from a coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseScrollAction = typeof ComputerUseScrollAction.Type

/**
 * Schema for a computer-use triple-click action.
 *
 * **When to use**
 *
 * Use when validating or constructing Anthropic computer-use triple-click
 * payloads at the current pointer position or an optional coordinate.
 *
 * **Details**
 *
 * The encoded payload uses `action: "triple_click"` and an optional
 * `coordinate`.
 *
 * **Gotchas**
 *
 * `coordinate` only validates as a two-number tuple and does not check display
 * bounds.
 *
 * @see {@link ComputerUse_20250124} for the tool version that accepts this action
 * @see {@link ComputerUseDoubleClickAction} for the two-click variant
 * @see {@link ComputerUseLeftClickAction} for a single left click
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseTripleClickAction = Schema.Struct({
  action: Schema.Literal("triple_click"),
  /**
   * The coordinate to triple click (defaults to the current mouse position if
   * omitted).
   */
  coordinate: Schema.optionalKey(Coordinate)
})
/**
 * Computer-use action payload for performing a triple click, optionally at a specific coordinate.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseTripleClickAction = typeof ComputerUseTripleClickAction.Type

/**
 * Schema for a computer-use wait action.
 *
 * **When to use**
 *
 * Use when validating or constructing Anthropic computer-use payloads that pause
 * between actions.
 *
 * **Details**
 *
 * The encoded payload uses `action: "wait"` and a required `duration` in
 * seconds.
 *
 * **Gotchas**
 *
 * `duration` is only `Schema.Finite`; it is not constrained to positive
 * values.
 *
 * @see {@link ComputerUseHoldKeyAction} for another duration-based computer-use action
 * @see {@link ComputerUse_20250124} for the tool version that accepts this action
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseWaitAction = Schema.Struct({
  action: Schema.Literal("wait"),
  /**
   * The number of seconds to wait.
   */
  duration: Schema.Finite
})
/**
 * Computer-use action payload for pausing for a specified duration.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseWaitAction = typeof ComputerUseWaitAction.Type

const ComputerUse_20250124_Actions = Schema.Union([
  ...ComputerUse_20241022_Actions.members,
  ComputerUseDoubleClickAction,
  ComputerUseHoldKeyAction,
  ComputerUseLeftClickDragAction,
  ComputerUseLeftMouseDownAction,
  ComputerUseLeftMouseUpAction,
  ComputerUseMiddleClickAction,
  ComputerUseRightClickAction,
  ComputerUseScrollAction,
  ComputerUseTripleClickAction,
  ComputerUseWaitAction
])

// -----------------------------------------------------------------------------
// Computer Use 20251124 Actions
// -----------------------------------------------------------------------------

/**
 * Zooms into a specific region of the screen at full resolution.
 *
 * **When to use**
 *
 * Use when building or validating the 2025-11-24 computer-use action for a
 * zoom-enabled tool definition.
 *
 * **Details**
 *
 * The encoded payload uses `action: "zoom"` and a `region` tuple.
 *
 * **Gotchas**
 *
 * Requires `enableZoom: true` in the tool definition. `region` is only a
 * four-number tuple and does not validate corner ordering or display bounds.
 *
 * @see {@link ComputerUse_20251124} for the tool version that accepts this action
 * @see {@link ComputerUseScreenshotAction} for capturing the full screen instead
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ComputerUseZoomAction = Schema.Struct({
  action: Schema.Literal("zoom"),
  /**
   * Region to zoom into, defined as `[x1, y1, x2, y2]` coordinates where
   * `(x1, y1)` is the top-left corner and `(x2, y2)` is the bottom-right corner.
   */
  region: Region
})
/**
 * Computer-use action payload for zooming into a specific screen region.
 *
 * **Gotchas**
 *
 * The enclosing computer-use tool must be configured with `enableZoom: true`.
 * `region` is only a four-number tuple and does not validate corner ordering or
 * display bounds.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ComputerUseZoomAction = typeof ComputerUseZoomAction.Type

const ComputerUse_20251124_Actions = Schema.Union([
  ...ComputerUse_20250124_Actions.members,
  ComputerUseZoomAction
])

// -----------------------------------------------------------------------------
// Computer Use Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the deprecated computer-use tool for Claude 3.5 Sonnet v2.
 *
 * **Details**
 *
 * Requires the "computer-use-2024-10-22" beta header.
 * Basic actions only: screenshot, left_click, type, key, mouse_move.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ComputerUse_20241022 = Tool.providerDefined({
  id: "anthropic.computer_use_20241022",
  customName: "AnthropicComputerUse",
  providerName: "computer_use",
  requiresHandler: true,
  args: ComputerUse_20241022_Args,
  parameters: ComputerUse_20241022_Actions,
  success: Schema.String
})

/**
 * Defines the computer-use tool for Claude 4 models and Claude Sonnet 3.7.
 *
 * **When to use**
 *
 * Use when you need Anthropic computer use for Claude 4 models or Claude
 * Sonnet 3.7 with the 2025-01-24 action set.
 *
 * **Details**
 *
 * Requires the "computer-use-2025-01-24" beta header.
 * Includes basic actions plus enhanced actions: scroll, left_click_drag,
 * right_click, middle_click, double_click, triple_click, left_mouse_down,
 * left_mouse_up, hold_key, wait.
 *
 * @see {@link ComputerUse_20241022} for the older basic action set
 * @see {@link ComputerUse_20251124} for the newer zoom-capable version
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ComputerUse_20250124 = Tool.providerDefined({
  id: "anthropic.computer_20250124",
  customName: "AnthropicComputerUse",
  providerName: "computer",
  requiresHandler: true,
  args: ComputerUse_20241022_Args,
  parameters: ComputerUse_20250124_Actions,
  success: Schema.String
})

/**
 * Defines the computer-use tool for Claude Opus 4.5 only.
 *
 * **When to use**
 *
 * Use when you need Anthropic computer use for Claude Opus 4.5 with the
 * 2025-11-24 action set and zoom-capable screen inspection.
 *
 * **Details**
 *
 * Requires the "computer-use-2025-11-24" beta header.
 * Includes all actions from computer_20250124 plus the zoom action for
 * detailed screen region inspection.
 *
 * **Gotchas**
 *
 * Zoom actions require `enableZoom: true` in args.
 *
 * @see {@link ComputerUse_20250124} for the previous action set without zoom
 * @see {@link ComputerUseZoomAction} for the zoom action payload
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ComputerUse_20251124 = Tool.providerDefined({
  id: "anthropic.computer_20251124",
  customName: "AnthropicComputerUse",
  providerName: "computer",
  requiresHandler: true,
  args: ComputerUse_20251124_Args,
  parameters: ComputerUse_20251124_Actions,
  success: Schema.String
})

// =============================================================================
// Memory
// =============================================================================

// -----------------------------------------------------------------------------
// Common Types
// -----------------------------------------------------------------------------

/**
 * Defines a `[start, end]` line range for viewing file contents.
 *
 * **When to use**
 *
 * Use when constructing or validating `view_range` for memory or text editor
 * view commands.
 *
 * **Details**
 *
 * Lines are 1-indexed. Use `-1` for end to read to the end of the file. For
 * example, `[1, 50]` views lines 1-50 and `[100, -1]` views from line 100 to
 * the end of the file.
 *
 * @see {@link MemoryViewCommand} for memory view payloads that use this range
 * @see {@link TextEditorViewCommand} for text editor view payloads that use this range
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ViewRange = Schema.Tuple([Schema.Int, Schema.Int])
/**
 * A `[start, end]` 1-indexed line range for viewing file contents, using `-1` as the end value to read through the end of the file.
 *
 * **When to use**
 *
 * Use when typing `view_range` for memory or text editor view commands.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ViewRange = typeof ViewRange.Type

// -----------------------------------------------------------------------------
// Memory 20250818 Commands
// -----------------------------------------------------------------------------

/**
 * Schema for the memory tool command that creates a new file at a path.
 *
 * **Details**
 *
 * The payload contains `command: "create"`, a `path` string, and the
 * `file_text` content to write to the file.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryCreateCommand = Schema.Struct({
  command: Schema.Literal("create"),
  /**
   * The path to the file that should be created.
   */
  path: Schema.String,
  /**
   * The content to write to the file.
   */
  file_text: Schema.String
})
/**
 * Memory tool command payload for creating a new file at a path.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryCreateCommand = typeof MemoryCreateCommand.Type

/**
 * Schema for a memory command that deletes a file or directory.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryDeleteCommand = Schema.Struct({
  command: Schema.Literal("delete"),
  /**
   * The path to the file or directory to delete.
   */
  path: Schema.String
})
/**
 * Memory tool command payload for deleting a file or directory at a path.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryDeleteCommand = typeof MemoryDeleteCommand.Type

/**
 * Schema for the memory `insert` command.
 *
 * **When to use**
 *
 * Use when validating or constructing `insert` payloads for `Memory_20250818`.
 *
 * **Details**
 *
 * The payload is discriminated by `command: "insert"` and requires `path`,
 * `insert_line`, and `insert_text`.
 *
 * @see {@link Memory_20250818} for the provider-defined tool that consumes this command
 * @see {@link MemoryStrReplaceCommand} for replacing existing text instead
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryInsertCommand = Schema.Struct({
  command: Schema.Literal("insert"),
  /**
   * The path to the file to insert text into.
   */
  path: Schema.String,
  /**
   * The line at which the text should be inserted.
   */
  insert_line: Schema.Int,
  /**
   * The text to insert.
   */
  insert_text: Schema.String
})
/**
 * Memory tool command payload for inserting text at a specific line in a file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryInsertCommand = typeof MemoryInsertCommand.Type

/**
 * Schema for the memory command that renames or moves a file or directory.
 *
 * **Details**
 *
 * The payload uses `command: "rename"` and requires `old_path` as the current
 * path plus `new_path` as the new destination path.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryRenameCommand = Schema.Struct({
  command: Schema.Literal("rename"),
  /**
   * The old path to the file or directory.
   */
  old_path: Schema.String,
  /**
   * The new path to the file or directory.
   */
  new_path: Schema.String
})
/**
 * Memory tool command payload for renaming or moving a file or directory.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryRenameCommand = typeof MemoryRenameCommand.Type

/**
 * Schema for the memory `str_replace` command.
 *
 * **When to use**
 *
 * Use when validating or constructing `str_replace` payloads for
 * `Memory_20250818`.
 *
 * **Details**
 *
 * The payload is discriminated by `command: "str_replace"` and requires `path`,
 * `old_str`, and `new_str`.
 *
 * @see {@link Memory_20250818} for the provider-defined tool that consumes this command
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryStrReplaceCommand = Schema.Struct({
  command: Schema.Literal("str_replace"),
  /**
   * The path to the file in which the replacement should occur.
   */
  path: Schema.String,
  /**
   * The text to replace.
   */
  old_str: Schema.String,
  /**
   * The replacement text.
   */
  new_str: Schema.String
})
/**
 * Memory tool command payload for replacing text in a file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryStrReplaceCommand = typeof MemoryStrReplaceCommand.Type

/**
 * Shows directory contents or file contents with optional line ranges.
 *
 * **Details**
 *
 * When used on a file, returns file contents optionally limited by `view_range`.
 * When used on a directory, lists contents.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MemoryViewCommand = Schema.Struct({
  command: Schema.Literal("view"),
  /**
   * The path to the file or directory to view.
   */
  path: Schema.String,
  /**
   * The specific lines to view.
   */
  view_range: Schema.optionalKey(ViewRange)
})
/**
 * Memory tool command payload for viewing a file or directory, optionally with a file line range.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MemoryViewCommand = typeof MemoryViewCommand.Type

const Memory_20250818_Commands = Schema.Union([
  MemoryCreateCommand,
  MemoryDeleteCommand,
  MemoryInsertCommand,
  MemoryRenameCommand,
  MemoryStrReplaceCommand,
  MemoryViewCommand
])

// -----------------------------------------------------------------------------
// Memory Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the memory tool for persistent file operations across conversations.
 *
 * **Details**
 *
 * Provides commands for creating, viewing, editing, renaming, and deleting
 * files within the model's memory space.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const Memory_20250818 = Tool.providerDefined({
  id: "anthropic.memory_20250818",
  customName: "AnthropicMemory",
  providerName: "memory",
  requiresHandler: true,
  parameters: Memory_20250818_Commands,
  success: Schema.String
})

// =============================================================================
// Text Editor
// =============================================================================

// -----------------------------------------------------------------------------
// Text Editor Commands
// -----------------------------------------------------------------------------

/**
 * Reads the contents of a file or lists directory contents.
 *
 * **When to use**
 *
 * Use when validating or constructing the standalone Anthropic Text Editor
 * `view` command.
 *
 * **Details**
 *
 * When used on a file, returns the file contents, optionally limited to a line
 * range. When used on a directory, lists all files and subdirectories.
 * `view_range` is a 1-indexed `[start, end]` tuple where `-1` means through
 * the end of the file.
 *
 * @see {@link CodeExecutionTextEditorView} for the code-execution variant without `view_range`
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEditorViewCommand = Schema.Struct({
  command: Schema.Literal("view"),
  /**
   * Absolute or relative path to the file or directory to view.
   */
  path: Schema.String,
  /**
   * Optional line range to view (only applies to files, not directories).
   * Lines are 1-indexed. Use -1 for end to read to end of file.
   */
  view_range: Schema.optionalKey(ViewRange)
})
/**
 * Text editor command payload for viewing file contents or listing directory contents.
 *
 * **Details**
 *
 * `view_range` is a 1-indexed `[start, end]` tuple where `-1` means through
 * the end of the file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextEditorViewCommand = typeof TextEditorViewCommand.Type

/**
 * Create a new file with specified content.
 *
 * **When to use**
 *
 * Use when validating or constructing an Anthropic text editor `create`
 * command.
 *
 * **Details**
 *
 * The payload is discriminated by `command: "create"` and requires both `path`
 * and `file_text`.
 *
 * **Gotchas**
 *
 * Fails if the file already exists. Parent directories must exist.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEditorCreateCommand = Schema.Struct({
  command: Schema.Literal("create"),
  /**
   * Path where the file should be created.
   */
  path: Schema.String,
  /**
   * The content to write to the new file.
   */
  file_text: Schema.String
})
/**
 * Text editor command payload for creating a new file with the specified content.
 *
 * **When to use**
 *
 * Use when typing parsed text-editor create command payloads after schema
 * validation and before dispatching to Anthropic tool handlers.
 *
 * **Gotchas**
 *
 * The command fails if the file already exists or if parent directories are missing.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextEditorCreateCommand = typeof TextEditorCreateCommand.Type

/**
 * Replaces a specific string in a file with a new string.
 *
 * **When to use**
 *
 * Use when validating or constructing standalone Anthropic text editor
 * `str_replace` commands.
 *
 * **Details**
 *
 * The payload uses `command: "str_replace"`, `path`, `old_str`, and `new_str`.
 * `new_str` may be empty to delete text.
 *
 * **Gotchas**
 *
 * The `old_str` must match exactly (including whitespace and indentation)
 * and must be unique in the file.
 *
 * @see {@link TextEditorViewCommand} for reading contents before choosing `old_str`
 * @see {@link CodeExecutionTextEditorStrReplace} for the code-execution variant
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEditorStrReplaceCommand = Schema.Struct({
  command: Schema.Literal("str_replace"),
  /**
   * Path to the file to modify.
   */
  path: Schema.String,
  /**
   * The exact string to find and replace (must be unique in the file).
   */
  old_str: Schema.String,
  /**
   * The string to replace old_str with (can be empty to delete).
   */
  new_str: Schema.String
})
/**
 * Text editor command payload for replacing one exact, unique string in a file.
 *
 * **When to use**
 *
 * Use when typing parsed text-editor replace command payloads that must carry
 * one exact `old_str` match.
 *
 * **Gotchas**
 *
 * The `old_str` must match exactly, including whitespace and indentation, and
 * must be unique in the file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextEditorStrReplaceCommand = typeof TextEditorStrReplaceCommand.Type

/**
 * Inserts text at a specific line number in a file.
 *
 * **Details**
 *
 * Inserts the new text after the specified line number. Use `0` to insert at
 * the beginning of the file; other values are 1-indexed.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEditorInsertCommand = Schema.Struct({
  command: Schema.Literal("insert"),
  /**
   * Path to the file to modify.
   */
  path: Schema.String,
  /**
   * The line number after which to insert (0 = beginning, 1-indexed).
   */
  insert_line: Schema.Int,
  /**
   * The text to insert.
   */
  new_str: Schema.String
})
/**
 * Text editor command payload for inserting text after a specific line number in a file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextEditorInsertCommand = typeof TextEditorInsertCommand.Type

/**
 * Undoes the last edit made to a file.
 *
 * **Details**
 *
 * Reverts the most recent `str_replace`, `insert`, or `create` operation on the
 * file.
 *
 * **Gotchas**
 *
 * This command is available in `text_editor_20241022` and
 * `text_editor_20250124`, but not in `text_editor_20250429` or
 * `text_editor_20250728`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEditorUndoEditCommand = Schema.Struct({
  command: Schema.Literal("undo_edit"),
  /**
   * Path to the file to undo the last edit on.
   */
  path: Schema.String
})
/**
 * Text editor command payload for undoing the most recent edit to a file.
 *
 * **Gotchas**
 *
 * Available for `text_editor_20241022` and `text_editor_20250124`, but not for
 * `text_editor_20250429` or `text_editor_20250728`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextEditorUndoEditCommand = typeof TextEditorUndoEditCommand.Type

const TextEditor_StrReplaceEditor_Commands = Schema.Union([
  TextEditorViewCommand,
  TextEditorCreateCommand,
  TextEditorStrReplaceCommand,
  TextEditorInsertCommand,
  TextEditorUndoEditCommand
])

const TextEditor_StrReplaceBasedEdit_Commands = Schema.Union([
  TextEditorViewCommand,
  TextEditorCreateCommand,
  TextEditorStrReplaceCommand,
  TextEditorInsertCommand
])

// -----------------------------------------------------------------------------
// Text Editor Args
// -----------------------------------------------------------------------------

const TextEditor_StrReplaceBasedEdit_Args = Schema.Struct({
  /**
   * Maximum number of characters to return when viewing large files.
   * When a file exceeds this limit, it will be truncated.
   */
  max_characters: Schema.optional(Schema.Int)
})

// -----------------------------------------------------------------------------
// Text Editor Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the deprecated text editor tool for Claude 3.5 Sonnet.
 *
 * **When to use**
 *
 * Use when you need the 2024-10-22 `str_replace_editor` compatibility path for
 * Claude 3.5 Sonnet.
 *
 * **Details**
 *
 * Requires the "computer-use-2024-10-22" beta header and supports `view`,
 * `create`, `str_replace`, `insert`, and `undo_edit` commands.
 *
 * @see {@link TextEditor_20250124} for the newer `str_replace_editor` version
 * @see {@link TextEditor_20250728} for the Claude 4 `str_replace_based_edit_tool` line
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const TextEditor_20241022 = Tool.providerDefined({
  id: "anthropic.text_editor_20241022",
  customName: "AnthropicTextEditor",
  providerName: "str_replace_editor",
  requiresHandler: true,
  parameters: TextEditor_StrReplaceEditor_Commands,
  success: Schema.String
})

/**
 * Defines the text editor tool for deprecated Claude Sonnet 3.7.
 *
 * **When to use**
 *
 * Use when you need the 2025-01-24 Claude Sonnet 3.7 text editor tool using
 * `str_replace_editor`.
 *
 * **Details**
 *
 * Requires the "computer-use-2025-01-24" beta header, requires a handler, and
 * supports `view`, `create`, `str_replace`, `insert`, and `undo_edit` commands.
 *
 * @see {@link TextEditor_20241022} for the older `str_replace_editor` version
 * @see {@link TextEditor_20250429} for the Claude 4 `str_replace_based_edit_tool` line
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const TextEditor_20250124 = Tool.providerDefined({
  id: "anthropic.text_editor_20250124",
  customName: "AnthropicTextEditor",
  providerName: "str_replace_editor",
  requiresHandler: true,
  parameters: TextEditor_StrReplaceEditor_Commands,
  success: Schema.String
})

/**
 * Defines the text editor tool for Claude 4 models using Anthropic's `str_replace_based_edit_tool`.
 *
 * **When to use**
 *
 * Use when you need the 2025-04-29 Claude 4 `str_replace_based_edit_tool`
 * version.
 *
 * **Details**
 *
 * Requires the "computer-use-2025-01-24" beta header.
 *
 * **Gotchas**
 *
 * This version does not support the `undo_edit` command.
 *
 * @see {@link TextEditor_20250124} for the previous `str_replace_editor` version
 * @see {@link TextEditor_20250728} for the later Claude 4 text editor version
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const TextEditor_20250429 = Tool.providerDefined({
  id: "anthropic.text_editor_20250429",
  customName: "AnthropicTextEditor",
  providerName: "str_replace_based_edit_tool",
  requiresHandler: true,
  args: TextEditor_StrReplaceBasedEdit_Args,
  parameters: TextEditor_StrReplaceBasedEdit_Commands,
  success: Schema.String
})

/**
 * Defines the text editor tool for Claude 4 models.
 *
 * **Details**
 *
 * Uses Anthropic's `str_replace_based_edit_tool`. `max_characters` can limit
 * file-view output for this version.
 *
 * **Gotchas**
 *
 * This version does not support the `undo_edit` command.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const TextEditor_20250728 = Tool.providerDefined({
  id: "anthropic.text_editor_20250728",
  customName: "AnthropicTextEditor",
  providerName: "str_replace_based_edit_tool",
  requiresHandler: true,
  args: TextEditor_StrReplaceBasedEdit_Args,
  parameters: TextEditor_StrReplaceBasedEdit_Commands,
  success: Schema.String
})

// =============================================================================
// Web Search
// =============================================================================

// -----------------------------------------------------------------------------
// Web Search Types
// -----------------------------------------------------------------------------

/**
 * Describes user location for localizing search results.
 *
 * **When to use**
 *
 * Use when you need to localize search results for location-dependent queries
 * like weather, local businesses, or events.
 *
 * **Details**
 *
 * The schema uses `type: "approximate"` plus optional `city`, `region`,
 * `country`, and `timezone`. `country` is an ISO 3166-1 alpha-2 code, and
 * `timezone` is an IANA time zone identifier.
 *
 * @see {@link WebSearch_20250305_Args} for the argument schema that consumes this location
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebSearchUserLocation = Schema.Struct({
  /**
   * Location type - currently only "approximate" is supported.
   */
  type: Schema.Literal("approximate"),
  /**
   * City name.
   */
  city: Schema.optional(Schema.String),
  /**
   * Region/state/province name.
   */
  region: Schema.optional(Schema.String),
  /**
   * ISO 3166-1 alpha-2 country code.
   */
  country: Schema.optional(Schema.String),
  /**
   * IANA timezone identifier.
   */
  timezone: Schema.optional(Schema.String)
})

// -----------------------------------------------------------------------------
// Web Search Args
// -----------------------------------------------------------------------------

/**
 * Defines configuration arguments for the web search tool.
 *
 * **When to use**
 *
 * Use when you need to configure `WebSearch_20250305` with search limits,
 * domain filters, or user location.
 *
 * **Details**
 *
 * The payload can set `maxUses`, `allowedDomains`, `blockedDomains`, and
 * `userLocation`.
 *
 * **Gotchas**
 *
 * `allowedDomains` and `blockedDomains` are mutually exclusive.
 *
 * @see {@link WebSearch_20250305} for the provider-defined tool that consumes these arguments
 * @see {@link WebSearchUserLocation} for localizing search results
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebSearch_20250305_Args = Schema.Struct({
  /**
   * Maximum number of searches allowed per API request.
   */
  maxUses: Schema.optional(Schema.Int),
  /**
   * Restrict search results to only these domains.
   *
   * Cannot be used together with `blockedDomains`.
   */
  allowedDomains: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Exclude results from these domains.
   *
   * Cannot be used together with `allowedDomains`.
   */
  blockedDomains: Schema.optional(Schema.Array(Schema.String)),
  /**
   * User location for localizing search results.
   */
  userLocation: Schema.optional(WebSearchUserLocation)
})
/**
 * Configuration arguments for the Anthropic web search tool, including usage limits, domain filters, and optional user location.
 *
 * **Gotchas**
 *
 * `allowedDomains` and `blockedDomains` are mutually exclusive.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebSearch_20250305_Args = typeof WebSearch_20250305_Args.Type

// -----------------------------------------------------------------------------
// Web Search Parameters
// -----------------------------------------------------------------------------

/**
 * Schema for Claude-supplied web search tool parameters.
 *
 * **Details**
 *
 * The payload contains the generated `query` string and is consumed by
 * `WebSearch_20250305`.
 *
 * @see {@link WebSearch_20250305} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebSearchParameters = Schema.Struct({
  /**
   * The search query generated by Claude.
   */
  query: Schema.String
})
/**
 * Type of the parameters Claude supplies when invoking the Anthropic web search tool.
 *
 * **Details**
 *
 * Contains the generated search query used by `WebSearch_20250305`.
 *
 * @see {@link WebSearch_20250305} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebSearchParameters = typeof WebSearchParameters.Type

// -----------------------------------------------------------------------------
// Web Search Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the web search tool for Claude models.
 *
 * **When to use**
 *
 * Use when you want Claude to search the web for real-time information.
 *
 * **Details**
 *
 * Enables Claude to search the web for real-time information. This is a
 * server-side tool executed by Anthropic's infrastructure.
 * Generally available (no beta header required).
 *
 * @see {@link WebFetch_20250910} for retrieving known URLs after discovery
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const WebSearch_20250305 = Tool.providerDefined({
  id: "anthropic.web_search_20250305",
  customName: "AnthropicWebSearch",
  providerName: "web_search",
  args: WebSearch_20250305_Args,
  parameters: WebSearchParameters,
  success: Schema.Array(Generated.BetaResponseWebSearchResultBlock),
  failure: Generated.BetaResponseWebSearchToolResultError
})

// =============================================================================
// Web Fetch
// =============================================================================

// -----------------------------------------------------------------------------
// Web Fetch Types
// -----------------------------------------------------------------------------

/**
 * Defines citation configuration for web fetch.
 *
 * **When to use**
 *
 * Use when you need to enable or disable citations on web fetch results.
 *
 * **Details**
 *
 * The payload contains the `enabled` flag. `citations` is optional on
 * `WebFetch_20250910_Args`, and citations are disabled by default.
 *
 * @see {@link WebFetch_20250910_Args} for the argument schema that consumes this configuration
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebFetchCitationsConfig = Schema.Struct({
  /**
   * Enable citations for fetched content.
   */
  enabled: Schema.Boolean
})
/**
 * Configuration payload for enabling or disabling citations on web fetch results.
 *
 * **When to use**
 *
 * Use when typing parsed web-fetch citation configuration shared between
 * request arguments and handler code.
 *
 * **Details**
 *
 * The payload contains the `enabled` flag. `citations` is optional on
 * `WebFetch_20250910_Args`, and citations are disabled by default.
 *
 * @see {@link WebFetch_20250910_Args} for the argument schema that consumes this configuration
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebFetchCitationsConfig = typeof WebFetchCitationsConfig.Type

// -----------------------------------------------------------------------------
// Web Fetch Args
// -----------------------------------------------------------------------------

/**
 * Defines configuration arguments for the web fetch tool.
 *
 * **When to use**
 *
 * Use when you need to configure `WebFetch_20250910` with usage limits, domain
 * filters, citations, or content token limits.
 *
 * **Details**
 *
 * The payload can set `maxUses`, domain filters, `citations`, and
 * `maxContentTokens`, which map to Anthropic web fetch request fields.
 *
 * **Gotchas**
 *
 * `allowedDomains` and `blockedDomains` are mutually exclusive.
 * `maxContentTokens` is approximate and does not apply to binary content such
 * as PDFs.
 *
 * @see {@link WebFetch_20250910} for the provider-defined tool that consumes these arguments
 * @see {@link WebFetchCitationsConfig} for configuring citations
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebFetch_20250910_Args = Schema.Struct({
  /**
   * Maximum number of fetches allowed per API request.
   */
  maxUses: Schema.optional(Schema.Int),
  /**
   * Restrict fetches to only these domains.
   *
   * Cannot be used together with `blockedDomains`.
   */
  allowedDomains: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Exclude fetches from these domains.
   *
   * Cannot be used together with `allowedDomains`.
   */
  blockedDomains: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Enable citations for fetched content.
   */
  citations: Schema.optional(WebFetchCitationsConfig),
  /**
   * Maximum content length in tokens.
   */
  maxContentTokens: Schema.optional(Schema.Int)
})
/**
 * Configuration arguments for the Anthropic web fetch tool, including usage limits, domain filters, citation settings, and token limits.
 *
 * **When to use**
 *
 * Use when typing parsed web-fetch tool configuration shared by the
 * provider-defined tool and request-building code.
 *
 * **Gotchas**
 *
 * `allowedDomains` and `blockedDomains` are mutually exclusive.
 * `maxContentTokens` is approximate and does not apply to binary content such
 * as PDFs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebFetch_20250910_Args = typeof WebFetch_20250910_Args.Type

// -----------------------------------------------------------------------------
// Web Fetch Parameters
// -----------------------------------------------------------------------------

/**
 * Schema for Claude-supplied web fetch parameters.
 *
 * **When to use**
 *
 * Use when validating or constructing the `url` payload consumed by
 * `WebFetch_20250910`.
 *
 * **Details**
 *
 * The payload contains the single `url` parameter for Anthropic web fetch.
 *
 * **Gotchas**
 *
 * The URL must be user-provided or from prior search/fetch results. Maximum URL
 * length is 250 characters.
 *
 * @see {@link WebFetch_20250910} for the provider-defined tool that consumes this payload
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const WebFetchParameters = Schema.Struct({
  /**
   * URL to fetch. Must be a URL provided by the user or from prior search/fetch
   * results. Maximum URL length: 250 characters.
   */
  url: Schema.String
})
/**
 * Type of the parameters Claude supplies when invoking the Anthropic web fetch tool.
 *
 * **When to use**
 *
 * Use when typing Claude-supplied web-fetch tool parameters after schema
 * validation, before enforcing URL provenance or length constraints.
 *
 * **Details**
 *
 * The payload contains the single `url` parameter for Anthropic web fetch.
 *
 * **Gotchas**
 *
 * The URL must be user-provided or from prior search/fetch results. Maximum URL
 * length is 250 characters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebFetchParameters = typeof WebFetchParameters.Type

// -----------------------------------------------------------------------------
// Web Fetch Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines the web fetch tool for Claude models.
 *
 * **When to use**
 *
 * Use when you want Claude to retrieve the content of a specific web page or
 * PDF.
 *
 * **Details**
 *
 * Allows Claude to retrieve full content from web pages and PDF documents.
 * This is a server-side tool executed by Anthropic's infrastructure. Selecting
 * this tool adds the "web-fetch-2025-09-10" beta header.
 *
 * @see {@link WebSearch_20250305} for discovering URLs before fetching specific content
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const WebFetch_20250910 = Tool.providerDefined({
  id: "anthropic.web_fetch_20250910",
  customName: "AnthropicWebFetch",
  providerName: "web_fetch",
  args: WebFetch_20250910_Args,
  parameters: WebFetchParameters,
  success: Generated.BetaResponseWebFetchResultBlock,
  failure: Generated.BetaResponseWebFetchToolResultError
})

// =============================================================================
// Tool Search
// =============================================================================

// -----------------------------------------------------------------------------
// Tool Search Parameters
// -----------------------------------------------------------------------------

/**
 * Schema for regex-based tool search input parameters.
 *
 * **Details**
 *
 * Claude constructs regex patterns using Python's `re.search()` syntax.
 * Maximum query length: 200 characters.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolSearchRegexParameters = Schema.Struct({
  /**
   * Python regex pattern to search for tools.
   */
  query: Schema.String
})
/**
 * Type of the parameters Claude supplies when invoking regex-based Anthropic tool search.
 *
 * **Details**
 *
 * Claude constructs regex patterns using Python's `re.search()` syntax.
 * Maximum query length: 200 characters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolSearchRegexParameters = typeof ToolSearchRegexParameters.Type

/**
 * Defines input parameters for BM25/natural language tool search.
 *
 * **When to use**
 *
 * Use when validating or constructing the natural-language query payload for
 * `ToolSearchBM25_20251119`.
 *
 * **Details**
 *
 * The payload contains Claude's natural-language `query`. BM25 searches tool
 * names, descriptions, argument names, and argument descriptions.
 *
 * @see {@link ToolSearchBM25_20251119} for the provider-defined tool that consumes these parameters
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolSearchBM25Parameters = Schema.Struct({
  /**
   * Natural language query to search for tools.
   */
  query: Schema.String
})
/**
 * Type of the parameters Claude supplies when invoking BM25 natural-language Anthropic tool search.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolSearchBM25Parameters = typeof ToolSearchBM25Parameters.Type

// -----------------------------------------------------------------------------
// Tool Search Tool Definitions
// -----------------------------------------------------------------------------

/**
 * Defines regex-based tool search for Claude models.
 *
 * **Details**
 *
 * Claude constructs regex patterns using Python's `re.search()` syntax to
 * find tools. The regex is matched against tool names, descriptions,
 * argument names, and argument descriptions.
 * Requires the "advanced-tool-use-2025-11-20" beta header.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ToolSearchRegex_20251119 = Tool.providerDefined({
  id: "anthropic.tool_search_tool_regex_20251119",
  customName: "AnthropicToolSearchRegex",
  providerName: "tool_search_tool_regex",
  parameters: ToolSearchRegexParameters,
  success: Schema.Array(Generated.BetaRequestToolReferenceBlock),
  failure: Generated.BetaResponseToolSearchToolResultError
})

/**
 * Defines BM25/natural language tool search for Claude models.
 *
 * **When to use**
 *
 * Use when you want Claude to find relevant tools from a natural-language query
 * instead of a regex pattern.
 *
 * **Details**
 *
 * Claude uses natural language queries to search for tools using the
 * BM25 algorithm. The search is performed against tool names, descriptions,
 * argument names, and argument descriptions.
 * Requires the "advanced-tool-use-2025-11-20" beta header.
 *
 * @see {@link ToolSearchRegex_20251119} for the regex-pattern alternative
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ToolSearchBM25_20251119 = Tool.providerDefined({
  id: "anthropic.tool_search_tool_bm25_20251119",
  customName: "AnthropicToolSearchBM25",
  providerName: "tool_search_tool_bm25",
  parameters: ToolSearchBM25Parameters,
  success: Schema.Array(Generated.BetaRequestToolReferenceBlock),
  failure: Generated.BetaResponseToolSearchToolResultError
})
