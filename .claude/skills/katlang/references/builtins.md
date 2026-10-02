# KatLang Builtins

Use only documented builtins. Do not invent Python-, JavaScript-, LINQ-, or spreadsheet-style names because they seem plausible.

This is a compact list of current builtins known to this skill. If the bundled CLI and these references disagree because the bundled CLI is older, treat the mismatch as version-sensitive rather than inventing behavior.

## Control

- `if(condition, whenTrue, whenFalse)`
- `while(step, init1, init2, ...)` or `Step.while(init1, init2, ...)` — the step's **last** output is a Boolean continuation flag (`true` continues, `false` stops); its other outputs form the next state; the loop returns the state from the last continuing iteration, discarding the stopping iteration's outputs
- `repeat(step, count, init1, init2, ...)` or `Step.repeat(count, init1, init2, ...)` — runs the step `count` times, feeding every output back as the next state, and returns the final state

```katlang
Step = x - 1, x > 1
Step.while(5)             # 1

Fact = n + 1, acc * n
Fact.repeat(5, 1, 1) : 1  # 120
```

Each explicit init argument is one initial state slot. Do not generate an obsolete two-argument `if` form.

## Collection-producing operations

These materialize one exact immutable list value:

- `range(start, stop)` — inclusive at both endpoints; counts up or down by 1; both bounds must be integers
- `filter(collection, predicate)`
- `map(collection, mapper)`
- `order(collection)`
- `orderDesc(collection)`
- `distinct(collection)`
- `take(collection, count)`
- `skip(collection, count)`
- `atoms(value)`

Zero produced items are `[]`; a single produced item remains `[item]`.

Many support dot-call style, for example:

```katlang
range(1, 10).orderDesc
```

`range` is inclusive:

```katlang
range(1, 5) # [1, 2, 3, 4, 5]
range(5, 1) # [5, 4, 3, 2, 1]
range(3, 3) # [3]
```

Do not import Python/C#/JavaScript half-open range intuition.

### Callback rules

`filter` accepts a predicate algorithm whose current-item call must return exactly one Boolean value. `false` rejects; `true` keeps the original top-level element. The collection element is passed as one ordinary argument value; sequence/list elements are not implicitly opened into several callback arguments.

```katlang
IsEven = x mod 2 == 0
range(1, 10).filter(IsEven)
```

`map` accepts a mapper that must return exactly one mapped value. The current collection element is passed as one ordinary argument value. A named algorithm or inline algorithm block may be used:

```katlang
Square = x * x
range(1, 5).map(Square)
range(1, 5).map{x * x}
```

Likewise, an inline predicate is idiomatic for `filter`:

```katlang
range(1, 10).filter{x mod 2 == 0}
```

Braces create an algorithm value. Do not invent arrow-lambda syntax such as `x -> x * x`.

`reduce(collection, reducer, initial)` passes both the accumulator and current element as ordinary argument values and requires the reducer to return exactly one next accumulator value. Neither value is implicitly opened.

## Collection consumers / reductions

- `count(collection)`
- `contains(collection, item)`
- `first(collection)`
- `last(collection)`
- `min(collection)`
- `max(collection)`
- `sum(collection)`
- `avg(collection)`
- `reduce(collection, reducer, initial)`

The collection argument is one call argument. A sequence value or exact list bound as that one collection is viewed one level deep. Do not spread it into several ordinary call arguments unless the receiving signature actually needs those separate arguments.

Common dot forms include:

```katlang
values.count
values.sum
values.avg
values.first
values.last
```

Do not infer undocumented aliases such as `length`, `size`, `sort`, or `average`.

## Structural and value operations

- `atoms(value)` / `value.atoms`: recursively collect numeric atoms through sequence and exact-list boundaries into one exact list
- `value.string`: convert one atomic numeric value to a KatLang string

The empty sequence value is syntax `()`, not an `empty` builtin. The empty exact list is `[]`.

## Math namespace

`Math.X` is the canonical qualified spelling. For ordinary formulas, prefer the predefined lower-camel-case alias listed below. Each alias points to the same underlying Math member; it is not a copied implementation.

Canonical constant:

- `Math.Pi` -> `pi`

There is no `Math.E` constant and no predefined `e` alias. Euler's number is `Math.Exp(1)` or, idiomatically, `exp(1)`.

Single-argument functions:

- `Math.Exp(x)` -> `exp(x)`
- `Math.Abs(x)` -> `abs(x)`
- `Math.Ceil(x)` -> `ceil(x)`
- `Math.Floor(x)` -> `floor(x)`
- `Math.Sign(x)` -> `sign(x)`
- `Math.Sqrt(x)` -> `sqrt(x)`
- `Math.Ln(x)` -> `ln(x)`
- `Math.Lg(x)` -> `lg(x)`
- `Math.Sin(radians)` -> `sin(radians)`
- `Math.Asin(x)` -> `asin(x)`
- `Math.Cos(radians)` -> `cos(radians)`
- `Math.Acos(x)` -> `acos(x)`
- `Math.Tan(radians)` -> `tan(radians)`
- `Math.Atan(x)` -> `atan(x)`

Multi-argument functions:

- `Math.Round(value, digits)` -> `round(value, digits)`
- `Math.Atan2(y, x)` -> `atan2(y, x)`
- `Math.Pow(x, y)` -> `pow(x, y)`
- `Math.Log(value, base)` -> `log(value, base)`
- `Math.Random(start, end)` -> `random(start, end)`
- `Math.RandomInt(start, end)` -> `randomInt(start, end)`

`random`/`Math.Random` and `randomInt`/`Math.RandomInt` use half-open intervals: `start <= result < end`.

Alias rules:

- Prefer lowercase aliases in ordinary formulas; keep `Math.X` for explicit qualification or disambiguation.
- Aliases are ordinary synthetic prelude bindings. User/local definitions and explicit parameters can shadow them.
- Aliases are not members of `Math`: `Math.cos(1)` is invalid; use `Math.Cos(1)`.
- `open Math` exposes canonical PascalCase names such as `Cos` and `Pi`; it neither creates nor is required for lowercase aliases.
- Aliases can be used wherever ordinary callable/value names work, including higher-order references and lexical dot-call fallback.
- Because alias names are prelude vocabulary, a bare alias such as `pi`, `sqrt`, or `exp` is not inferred as an implicit parameter. Use an explicit parameter list if the program intentionally wants to shadow one.

## Loading and visibility

- `load('<url>')` — fetch an external algorithm from a single-quoted HTTPS URL and bind it: `Lib = load('https://katlang.org/algorithm.kat')`, then `Lib.X`
- `open target` — import a target's `public` properties into the current scope; a target is a name (`open Math`, `open Lib`), a dotted path (`open Lib.Sub`), an inline block, or a single-quoted URL (`open '<url>'` is sugar for `open load('<url>')`); one `open` per algorithm, placed before its definitions and output
- `public` — marks a property or clause family as exported through `load`/`open`; visibility is family-level, so every clause of a same-name family is `public` or none is

Only URL loading -- `load(...)` and `open '<url>'` -- is **disabled by default in the CLI** and needs `--allow-loading`; `open Math`, `open` of a local algorithm, and `public` run without the flag. See `cli.md` for the gating diagnostic.

Validate loading code with the CLI where possible; the URL above is illustrative.

## Builtin selection guidance

Prefer the builtin whose name directly expresses the calculation. Before naming a builtin not listed here, verify it using current KatLang documentation or CLI-supported help/introspection if available.
