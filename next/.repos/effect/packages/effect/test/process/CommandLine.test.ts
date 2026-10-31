import { assert, describe, it } from "@effect/vitest"
import { Redacted, Result } from "effect"
import { CommandLine } from "effect/process"

const failure = <A>(result: Result.Result<A, CommandLine.CommandLineError>): CommandLine.CommandLineError => {
  if (Result.isSuccess(result)) assert.fail(`expected a failure, got ${JSON.stringify(result.success)}`)
  return result.failure
}

// A template whose text is one part, written without template escapes.
const template = (text: string) =>
  CommandLine.template(Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray)

describe("CommandLine", () => {
  describe("quote", () => {
    it("quotes for POSIX shells", () => {
      const cases: Array<[CommandLine.Word, string]> = [
        ["plain", "plain"],
        ["path/to.file:1,2@x+y-z_", "path/to.file:1,2@x+y-z_"],
        ["", "''"],
        ["a b", "'a b'"],
        ["it's", "'it'\\''s'"],
        ["a\\b", "'a'\\\\'b'"],
        ["=ls", "'=ls'"],
        ["%self", "'%self'"],
        ["{a,b}", "'{a,b}'"],
        ["~", "'~'"],
        ["#x", "'#x'"],
        ["$HOME", "'$HOME'"],
        ["a\nb", "'a\nb'"],
        [Redacted.make("a b"), "'a b'"]
      ]
      for (const [input, expected] of cases) {
        assert.strictEqual(Result.getOrThrow(CommandLine.quote(input)), expected, String(input))
      }
      assert.strictEqual(failure(CommandLine.quote("a\0b")).reason, "NulCharacter")
    })

    it("quotes for PowerShell", () => {
      const cases: Array<[string, string]> = [
        ["plain", "'plain'"],
        ["", "''"],
        ["it's", "'it''s'"],
        ["x\u2019; y\u2018", "'x\u2019\u2019; y\u2018\u2018'"],
        ["\u201A\u201B", "'\u201A\u201A\u201B\u201B'"],
        ["$env:HOME `n", "'$env:HOME `n'"]
      ]
      for (const [input, expected] of cases) {
        assert.strictEqual(Result.getOrThrow(CommandLine.quote(input, { format: "powershell" })), expected, input)
      }
    })

    it("quotes Windows arguments", () => {
      const cases: Array<[string, string]> = [
        ["plain", "plain"],
        ["a\\b", "a\\b"],
        ["", "\"\""],
        ["a b", "\"a b\""],
        ["a\tb", "\"a\tb\""],
        ["a\"b", "\"a\\\"b\""],
        ["a\\\"b", "\"a\\\\\\\"b\""],
        ["a b\\", "\"a b\\\\\""],
        ["a b\\\\", "\"a b\\\\\\\\\""]
      ]
      for (const [input, expected] of cases) {
        assert.strictEqual(Result.getOrThrow(CommandLine.quote(input, { format: "windows" })), expected, input)
      }
    })
  })

  describe("join", () => {
    it("joins a program and its arguments", () => {
      const args = ["git", "commit", "-m", "fix: don't"]
      assert.strictEqual(Result.getOrThrow(CommandLine.join(args)), "git commit -m 'fix: don'\\''t'")
      assert.strictEqual(
        Result.getOrThrow(CommandLine.join(args, { format: "powershell" })),
        "& 'git' 'commit' '-m' 'fix: don''t'"
      )
      assert.strictEqual(
        Result.getOrThrow(CommandLine.join(args, { format: "windows" })),
        "git commit -m \"fix: don't\""
      )
      assert.strictEqual(Result.getOrThrow(CommandLine.join([])), "")
      for (const program of ["time", "nocorrect", "in"]) {
        assert.strictEqual(Result.getOrThrow(CommandLine.join([program, "x"])), `'${program}' x`)
      }
      const error = failure(CommandLine.join(["echo", "a\0b"]))
      assert.deepStrictEqual([error.reason, error.message], ["NulCharacter", "Argument 1 contains a NUL character"])
    })

    it("quotes Windows program names without backslash escapes", () => {
      const cases: Array<[string, string]> = [
        ["C:\\Program Files\\app.exe", "\"C:\\Program Files\\app.exe\""],
        ["C:\\tools\\", "C:\\tools\\"],
        ["", "\"\""]
      ]
      for (const [program, expected] of cases) {
        assert.strictEqual(Result.getOrThrow(CommandLine.join([program], { format: "windows" })), expected)
      }
      assert.strictEqual(failure(CommandLine.join(["a\"b"], { format: "windows" })).reason, "InvalidArgument")
    })

    it("rejects the argument --% for PowerShell", () => {
      const error = failure(CommandLine.join(["node", "a", "--%"], { format: "powershell" }))
      assert.deepStrictEqual([error.reason, error.message], [
        "InvalidArgument",
        "Argument 2 is \"--%\", which PowerShell drops when it calls a program"
      ])
      assert.strictEqual(Result.getOrThrow(CommandLine.quote("--%", { format: "powershell" })), "'--%'")
    })
  })

  describe("display", () => {
    it("masks Redacted words, escapes control characters and accepts any input", () => {
      const words = ["curl", "-H", Redacted.make("Authorization: hunter2"), "a\nb\u001b[2J\0"]
      assert.strictEqual(CommandLine.display(words), "curl -H <redacted> 'a\\nb\\u001b[2J\\u0000'")
      assert.strictEqual(
        CommandLine.display(words, { format: "powershell" }),
        "& 'curl' '-H' <redacted> 'a\\nb\\u001b[2J\\u0000'"
      )
      assert.strictEqual(CommandLine.display(["a\"b", "c d"], { format: "windows" }), "\"a\\\"b\" \"c d\"")
      assert.strictEqual(CommandLine.display([]), "")
      assert.strictEqual(CommandLine.display(["if", "x"]), "'if' x")
    })
  })

  describe("template", () => {
    it("removes POSIX quotes and escapes", () => {
      const cases: Array<[string, Array<string>]> = [
        ["", []],
        ["  a \t b  ", ["a", "b"]],
        ["a 'b c' d", ["a", "b c", "d"]],
        ["a \"b \\\"c\\\" \\$d \\\\ \\x\"", ["a", "b \"c\" $d \\ \\x"]],
        ["a\\ b", ["a b"]],
        ["'' \"\"", ["", ""]],
        ["a''b", ["ab"]],
        ["a\\\nb", ["ab"]],
        ["'a\nb' \"c\nd\"", ["a\nb", "c\nd"]],
        ["'$HOME' \\$HOME \"cost$\" cost$", ["$HOME", "$HOME", "cost$", "cost$"]],
        ["find . -exec rm {} \\;", ["find", ".", "-exec", "rm", "{}", ";"]],
        ["env FOO=bar --x=1 a#b x~ '!'", ["env", "FOO=bar", "--x=1", "a#b", "x~", "!"]],
        ["'FOO=bar' cmd", ["FOO=bar", "cmd"]],
        ["a\0b c", ["a\0b", "c"]]
      ]
      for (const [line, expected] of cases) {
        assert.deepStrictEqual(Result.getOrThrow(template(line)), expected, line)
      }
    })

    it("rejects syntax that needs a shell", () => {
      const cases: Array<[string, CommandLine.CommandLineError["reason"]]> = [
        ["a | b", "UnsupportedSyntax"],
        ["a && b", "UnsupportedSyntax"],
        ["a; b", "UnsupportedSyntax"],
        ["a >f", "UnsupportedSyntax"],
        ["(a)", "UnsupportedSyntax"],
        ["echo $HOME", "UnsupportedSyntax"],
        ["echo ${x}", "UnsupportedSyntax"],
        ["echo $(id)", "UnsupportedSyntax"],
        ["echo `id`", "UnsupportedSyntax"],
        ["echo \"a $x\"", "UnsupportedSyntax"],
        ["echo $'a'", "UnsupportedSyntax"],
        ["ls *.txt", "UnsupportedSyntax"],
        ["curl x?a=1", "UnsupportedSyntax"],
        ["ls [ab]", "UnsupportedSyntax"],
        ["cd ~", "UnsupportedSyntax"],
        ["echo #x", "UnsupportedSyntax"],
        ["echo {a,b}", "UnsupportedSyntax"],
        ["echo a{1..3}", "UnsupportedSyntax"],
        ["=ls", "UnsupportedSyntax"],
        ["FOO=bar cmd", "UnsupportedSyntax"],
        ["FOO+=bar cmd", "UnsupportedSyntax"],
        ["'open", "UnterminatedQuote"],
        ["a \"b", "UnterminatedQuote"],
        ["a\\", "InvalidEscape"]
      ]
      for (const [line, reason] of cases) {
        assert.strictEqual(failure(template(line)).reason, reason, line)
      }
    })

    it("splits the text and keeps values literal", () => {
      const message = "fix: a b; $HOME"
      assert.deepStrictEqual(
        Result.getOrThrow(CommandLine.template`git commit -m ${message} "two words" 'it''s'`),
        ["git", "commit", "-m", message, "two words", "its"]
      )
      assert.deepStrictEqual(
        Result.getOrThrow(CommandLine.template`docker run
          --rm ${"img"}`),
        ["docker", "run", "--rm", "img"]
      )
      assert.deepStrictEqual(Result.getOrThrow(CommandLine.template`if true`), ["if", "true"])
    })

    it("joins values with the surrounding argument", () => {
      const cases: Array<[Result.Result<Array<CommandLine.Word>, CommandLine.CommandLineError>, Array<string>]> = [
        [CommandLine.template`--x=${1} ${true}`, ["--x=1", "true"]],
        [CommandLine.template`"${"a"} ${"b"}"`, ["a b"]],
        [CommandLine.template`'${"$x"}'-y`, ["$x-y"]],
        [CommandLine.template`cost $${5}`, ["cost", "$5"]],
        [CommandLine.template`a ${""}`, ["a", ""]],
        [CommandLine.template`a ${"b\0"}`, ["a", "b\0"]]
      ]
      for (const [result, expected] of cases) {
        assert.deepStrictEqual(Result.getOrThrow(result), expected)
      }
    })

    it("adds one argument per array element", () => {
      assert.deepStrictEqual(Result.getOrThrow(CommandLine.template`ls ${["-l", "a b"]} x`), ["ls", "-l", "a b", "x"])
      assert.deepStrictEqual(Result.getOrThrow(CommandLine.template`ls ${[]} x`), ["ls", "x"])
      assert.deepStrictEqual(Result.getOrThrow(CommandLine.template`ls ${["a"]}`), ["ls", "a"])
      for (const result of [CommandLine.template`--x=${["a"]}`, CommandLine.template`${["a"]}b`]) {
        assert.strictEqual(failure(result).reason, "UnsupportedSyntax")
      }
    })

    it("makes arguments with Redacted values Redacted", () => {
      const password = Redacted.make("hunter2")
      const words = Result.getOrThrow(CommandLine.template`psql "--password=${password}" ${[password]} -h db`)
      assert.strictEqual(words.length, 5)
      assert.isTrue(Redacted.isRedacted(words[1]))
      assert.strictEqual(Redacted.value(words[1] as Redacted.Redacted<string>), "--password=hunter2")
      assert.strictEqual(words[2], password)
      assert.strictEqual(CommandLine.display(words), "psql <redacted> <redacted> -h db")
      assert.strictEqual(Result.getOrThrow(CommandLine.join(words)), "psql '--password=hunter2' hunter2 -h db")
    })

    it("rejects an unclosed quote around a value and invalid escapes", () => {
      const invalidEscape = Object.assign(["echo \\unicode"], { raw: ["echo \\unicode"] })
      invalidEscape[0] = undefined as unknown as string
      const cases: Array<[Result.Result<Array<CommandLine.Word>, CommandLine.CommandLineError>, string]> = [
        [CommandLine.template`echo "${"a"}`, "UnterminatedQuote"],
        [CommandLine.template(invalidEscape as unknown as TemplateStringsArray), "InvalidEscape"]
      ]
      for (const [result, reason] of cases) {
        assert.strictEqual(failure(result).reason, reason)
      }
    })
  })
})
