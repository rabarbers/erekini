---
name: katlang
description: Use KatLang, a concise language for calculations, to perform, solve, verify, write, explain, translate, debug, or validate KatLang calculations and code with executable high-precision decimal arithmetic. Invoke when the user explicitly asks for KatLang, needs KatLang semantics or unusually high precision or reproducibility, wants any calculation executed through KatLang, or the task benefits from formulas, multiple steps, sequences, statistics, numerical algorithms, or explicit calculation logic. In this project, also auto-invoke for simple one-off scalar expressions such as basic arithmetic, sqrt, sin/cos/tan (e.g. cos(1.234)), ln/log, exp, one power, or a simple percentage -- route them through the KatLang CLI `eval` fast path in a single call instead of answering from mental arithmetic. Do not use for evaluator/compiler/parser internals, Lean formalization, or repository engineering.
license: MIT
---

# KatLang

Use this skill for working *in* KatLang. Treat KatLang as a calculation-oriented DSL whose semantics can differ materially from general-purpose languages.

Once this skill is invoked, use KatLang for the calculation even when it is a simple scalar expression. Do not hand a calculation back to ordinary non-KatLang answering merely because the expression is simple.

## Skill paths

Every path in this document -- `scripts/`, `references/`, `assets/` -- is relative to **this skill's own root directory**, never to the process working directory. Below, `<skill-root>` denotes that directory's absolute path: the directory containing this SKILL.md, normally stated by the harness when the skill loads. Always resolve against the skill root and invoke wrappers by an **absolute** path -- never a bare relative path, and never `<skill-root>` typed literally.

## Fast path for ordinary calculations

For a straightforward calculation — including a simple scalar expression such as `cos(1.234)` — or small KatLang program, optimize for one CLI execution. Do **not** preload language reference files when the task can be expressed confidently with the core forms below. Read `references/cli.md` only when wrapper execution fails, the environment is unsupported, or CLI options are genuinely uncertain.

Core forms safe to use without additional reference loading:

```katlang
Square = x * x                         # implicit parameter x
Total(*values) = values.sum            # collecting parameter
range(1, 100).sum                      # range is inclusive
range(1, 100).map{x * x}.sum           # inline algorithm callback
range(1, 10).filter{x mod 2 == 0}.sum  # inline predicate callback
round(sqrt(2), 10)                    # lowercase Math aliases
exp(1)                                # Euler's number; no Math.E/e builtin
if(condition, whenTrue, whenFalse)
```

High-frequency rules from the current KatLang tutorial:

- `range(start, stop)` includes **both** endpoints. For “1 through 100”, use `range(1, 100)`, not `range(1, 101)`. It also counts downward when `start > stop`.
- An algorithm without an explicit parameter list infers unresolved names as parameters in first-appearance order: `Square = x * x`.
- `{ ... }` creates an algorithm value and is the idiomatic inline callback form: `values.map{x * x}` or `values.filter{x > 0}`. Prefer inline callbacks for one-off calculations; do not invent lambda syntax such as `x -> ...`.
- Common operators: arithmetic `+`, `-`, `*`, `/`, `div`, `mod`, `^`; comparisons `<`, `>`, `<=`, `>=`, `==`, `!=`; logical `and`, `or`, `xor`, `not`. `true` and `false` are first-class Boolean values; there is no numeric truthiness.
- Unparenthesized comparisons at one syntactic level form a comparison chain. All six comparison operators share one tier; chain operands evaluate left to right exactly once. Parentheses break a chain.
- `not` binds below comparisons/equality: `not x > 3` means `not (x > 3)`. `and`, `xor`, and `or` are Boolean operators and do not short-circuit; both operands are evaluated.
- An ordinary non-spread call argument supplies exactly one value, even when that value is a sequence, list, or `()`. Explicit postfix `*` is what opens one sequence/list boundary into multiple supplied items.
- Collection builtins consume one collection value; dot-call syntax supplies that collection. Do not spread a range/list into `sum`, `count`, `map`, `filter`, etc. merely because it has many items.
- Selection (`value:index`) and `.first` / `.last` are value boundaries: they preserve the selected value. Use explicit postfix `*` if the selected sequence/list must be opened.
- Common collection dot forms may be used directly: `.map{...}`, `.filter{...}`, `.sum`, `.count`, `.avg`, `.min`, `.max`, `.first`, `.last`, `.order`, `.orderDesc`, `.distinct`, `.take(n)`, `.skip(n)`, and `.contains(value)`.
- Prefer the predefined lowercase Math aliases in ordinary formulas: `sqrt(x)`, `abs(x)`, `round(value, digits)`, `sin(radians)`, `cos(radians)`, `exp(x)`, `ln(x)`, `lg(x)`, and `pi`. Every current `Math` member has one lower-camel-case prelude alias; keep `Math.X` as the canonical qualified spelling for disambiguation.
- There is no `Math.E` constant and no predefined `e` alias. Use `exp(1)` (canonical form: `Math.Exp(1)`) for Euler's number.
- A physical newline continues an expression only when the previous line is syntactically incomplete (for example, it ends with a binary operator). If the previous line is already complete, the next line must not retroactively change its meaning.

Fast execution rules:

1. Translate the user's request into the smallest correct KatLang expression or program **before** invoking the CLI. Never pass the user's raw natural-language prompt to the wrapper.
2. Pick the wrapper by the platform of the **execution environment where shell commands actually run**: in a container-backed harness that is the harness's container (typically Linux) regardless of the user's device; in a local harness such as Claude Code it is the user's machine. On Linux (x64 or ARM64) and macOS (Intel or Apple silicon), run KatLang only through `<skill-root>/scripts/run-katlang.sh`. The wrapper owns platform and architecture selection, cold-start extraction, executable permissions, versioned runtime caching, and CLI execution. Do not duplicate or preflight that logic.
3. Invoke the wrapper by its absolute path so the ordinary short-expression shape is one process-tool call:

   ```bash
   bash <skill-root>/scripts/run-katlang.sh eval 'sin(1.234)'
   ```

   For a longer or multiline program, write the generated KatLang source to a temporary `.kat` file and use the same wrapper with `run`. Use `check` only when validation without execution is the intent.
4. On Windows (x64 or ARM64), run KatLang through `<skill-root>/scripts/run-katlang.ps1`; it selects the bundled runtime matching the machine architecture. Invoke it with PowerShell, passing the wrapper's absolute path to `-File` together with `-ExecutionPolicy Bypass` (the wrapper is an unsigned script, so default or mark-of-the-web execution policies would otherwise block it), so the wrapper does not depend on its own executable file mode. The wrapper owns cold-start extraction, versioned runtime caching, and CLI execution, mirroring the Linux wrapper. Example:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File <skill-root>/scripts/run-katlang.ps1 eval 'sin(1.234)'
   ```

   The same command works from a POSIX shell on Windows such as Git Bash; use `pwsh` when `powershell` is unavailable. If a POSIX shell on Windows invokes `run-katlang.sh` instead, that wrapper detects Windows and delegates to the PowerShell wrapper, so either entry point is safe there.
5. On any other platform -- any target without a bundled archive -- **no wrapper applies**. Do not run an archive built for a different platform, and do not download, install, or build a native binary. Answer from the references and state plainly that runtime validation was unavailable. The same reference-only fallback applies in a harness that provides no shell or process execution at all.
6. Use exactly one KatLang CLI command for the intent: `eval` for a short expression/snippet, `run` for a program whose result is needed, or `check` only for validation without execution.
7. Do not run a separate `--version`, version check, permission probe, extraction command, `check`, or other preflight before a normal `eval`/`run`.
8. Do **not** fetch, download, replace, install, or self-update executable code. The platform wrappers extract only the trusted release archives bundled in this Skill.
9. Do not narrate wrapper bootstrap/cache activity during an ordinary calculation. Mention execution setup only if it ultimately fails or the user asks for diagnostics.
10. If execution succeeds, return the result without loading more references.
11. If KatLang returns a **language diagnostic**, load only the language reference relevant to that diagnostic, fix the source, and rerun the same command.

## Copyable calculation output

- Present final numeric results as plain text, never LaTeX or other rendered math (`\(...\)`, `\[...\]`, `$$...$$`, `\boxed{...}`).
- Put a single numeric result in a fenced `text` code block containing the raw value only; for multiple results, use one `label = value` per line in the block.

## Reference loading

Load references lazily, not routinely:

- `references/language.md` — syntax or surface constructs not covered by the fast path.
- `references/semantics.md` — call value boundaries, multiple outputs, sequence/list boundaries, collecting parameters, spread, resolution, or other non-obvious semantics.
- `references/builtins.md` — before using a builtin not listed in the fast path, or when builtin behavior/signature is uncertain.
- `references/examples.md` — when an idiomatic example would materially reduce ambiguity.
- `references/cli.md` — only for wrapper/CLI troubleshooting, unsupported execution environments, or uncertain CLI options.

Do not read several references speculatively. Let the request or a CLI diagnostic identify what is needed.

## Source of truth

Use this precedence when information conflicts:

1. Explicit current behavior demonstrated by successful execution of the bundled KatLang CLI.
2. CLI output or current KatLang behavior explicitly supplied by the user.
3. Current code or syntax supplied by the user.
4. Bundled references in this skill.
5. General model knowledge.

Never prefer remembered syntax from another language or an older KatLang revision over current executable behavior. Conversely, when an executable is known to be older than the current language references, do not use its rejection of a newer documented feature to invalidate that feature.

## Generation and translation

Prefer the smallest idiomatic KatLang formulation. Translate the computation rather than the source language's control-flow shape. Preserve call value boundaries, output cardinality, sequence values, exact lists, collecting parameters, explicit spread, and decimal numeric intent deliberately.

Do not invent syntax, operators, builtins, implicit spreading, library members, indexing conventions, truthiness, mutation, or container behavior from Python/JavaScript/C#/Kotlin intuition.

## Debugging

Classify failures as syntax, name resolution, arity/cardinality, call value boundary, collect/spread shape, pattern matching, builtin use, runtime evaluation, or process/execution failure. Make the smallest semantic fix and validate it with the same relevant command. Do not hide boundary errors by flattening values indiscriminately.

## Scope boundary

Use this skill for using the KatLang language, not for evaluator/compiler/parser implementation, AST design, Lean proofs, mutation testing, release engineering, or repository architecture.
