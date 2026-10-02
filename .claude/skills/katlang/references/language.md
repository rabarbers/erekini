# KatLang Language Reference

This is a compact AI-oriented reference, not an exhaustive language specification. Prefer current CLI behavior over this file when they conflict.

## Calculation-oriented style

KatLang is a domain-specific language for calculations. Prefer expressions, algorithms, sequence/list operations, and mathematical structure over general-purpose-language ceremony.

## Math formulas

Every built-in `Math` member has a predefined lower-camel-case prelude alias. Prefer the aliases in ordinary formulas:

```katlang
sin(pi / 2)
round(sqrt(2), 10)
exp(1)
```

The corresponding canonical qualified forms are `Math.Sin(Math.Pi / 2)`, `Math.Round(Math.Sqrt(2), 10)`, and `Math.Exp(1)`. Use `Math.X` when qualification helps disambiguate a shadowed alias.

There is no `Math.E` constant and no predefined `e` alias. `e` remains an ordinary identifier; use `exp(1)` for Euler's number.

## Algorithm definitions

Use explicit parameter lists when they make the interface clearer:

```katlang
Square(x) = x * x
Average(*values) = values.sum / values.count
```

Algorithms without an explicit parameter list infer unresolved names as parameters in first-appearance order. An explicit parameter list is closed: other names in the body must resolve from scope.

A brace block creates an algorithm value with its own parameter scope and is the idiomatic inline callback form:

```katlang
range(1, 100).map{x * x}.sum
range(1, 10).filter{x mod 2 == 0}
```

Parentheses group/capture values; square brackets construct exact lists; braces create algorithms. Do not import arrow-lambda syntax from another language.

## Booleans, comparisons, and logical operators

`true` and `false` are distinct Boolean values. KatLang has no numeric truthiness: `if`, `filter`, and `while` require Boolean conditions/results, arithmetic rejects Booleans, and ordering comparisons require numeric scalar operands. Equality and inequality are total across value kinds.

All six comparison operators share one precedence tier. Unparenthesized comparisons at one syntactic level form one comparison chain; each operand is evaluated once from left to right. Parentheses break a chain. A false comparison does not short-circuit the remaining comparisons, although evaluation errors still stop evaluation.

`not` binds below comparisons/equality, so `not x > 3` means `not (x > 3)`. The Boolean operators evaluate both operands; there is no short-circuit `and`/`or`.

## Multiple outputs and call boundaries

A KatLang algorithm body can produce multiple output slots. Comma-separated outputs are semantically distinct from one sequence value or one exact list.

```katlang
Pair(x) = x, x + 1
```

However, a property/call boundary returns exactly one value. If the called body produced several items, the caller receives one sequence value containing them:

```katlang
Pair(5)   # one value: (5, 6)
Pair(5)*  # spread back into two surrounding items: 5, 6
```

Root output and explicit caller-side spread can contribute multiple surrounding items. Treat the call value boundary as part of the program's meaning; see `semantics.md` before changing grouping or spreading.

## Collecting parameters

A collecting parameter is written with a prefix star directly attached to the binding name:

```katlang
Group(*items) = items
Average(*values) = values.sum / values.count
```

The collecting parameter consumes the matched argument-item supply and binds one exact immutable list. Zero supplied items collect `[]`, one item collects `[item]`, and many items collect `[a, b, ...]`.

Do not generate older `items...` variadic syntax.

## Explicit spread

Use postfix `*` directly attached to a completed expression to spread its immediate items into the surrounding supply:

```katlang
Target(values*)
Result*
```

Spread opens one boundary. It is not recursive flattening.

The same `*` token is multiplication when it has a valid same-line right operand. To spread one expression and then place another same-line item after it, use a comma:

```katlang
values*, other
```

There is no general auto-spread rule. Do not generate older postfix `...` supply syntax.

## Range

`range(start, stop)` returns one exact list containing every integer from `start` through `stop`, **inclusive**. It counts upward or downward by 1, and equal bounds produce a one-element list.

```katlang
range(1, 5) # [1, 2, 3, 4, 5]
range(5, 1) # [5, 4, 3, 2, 1]
```

For natural-language intervals such as “1 through 100”, use `range(1, 100)`.

## Sequence values and exact lists

Parentheses materialize expression-list items as one sequence value:

```katlang
(1, 2, 3)
```

Square brackets create one exact immutable list value:

```katlang
[1, 2, 3]
```

Collection-producing builtins such as `range`, `filter`, `map`, `order`, `orderDesc`, `distinct`, `take`, `skip`, and `atoms` return exact list values.

The empty sequence value is `()`. The empty exact list is `[]`; they are distinct values. An empty brace body `{}` has no defined output and is not the same as `()`.

## Dot calls and members

KatLang supports calculation-friendly dot syntax. A known form is:

```katlang
range(1, 10).sum
```

Use documented dot-call/member forms rather than inventing method names from another language.

### Grace with dot calls

Grace and dot calls compose with an explicit dot:

```katlang
a~.t
a.~t
```

Grace changes inferred parameter order only; it does not bypass structural-first member selection or lexical fallback rules. Do not generate the reverted omitted-dot form `a~t` as a dot call.

## Indexing / selection

The colon operator uses zero-based selection:

```katlang
values:0
values:1
```

Selection is a **value boundary**, not an implicit spread boundary. It preserves the selected value exactly; nested structure is not opened merely by selecting it. The same rule applies to `.first` and `.last`. Use explicit postfix `*` when the selected sequence/list must be opened. Prefer `.first` and `.last` when the intent is positional rather than index arithmetic.

## Newline continuation

A physical newline continues an expression only when the previous line is syntactically incomplete, for example after a binary operator. If a line is already a complete expression, a following line must not change its meaning by acting as an implicit continuation.

## Conditional algorithms

Conditional algorithms use clause-style pattern definitions:

```katlang
F(0) = 1
F(x) = x + 1
```

Do not introduce obsolete `when` syntax. Collecting bindings may appear in supported parameter patterns, but Grace `~` is not valid inside collecting bindings.

## Current forms to prefer

- collecting binding: `*items`
- spread expression: `items*`
- empty sequence value: `()`
- empty exact list: `[]`
- zero-based selection: `value:index`
- grace + dot: `a~.t` or `a.~t`
- three-argument `if(condition, whenTrue, whenFalse)`
- string literal: `'text'` -- single quotes only; a double-quoted string is a lexer error
