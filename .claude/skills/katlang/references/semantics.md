# KatLang Semantic Rules

These rules cover areas where general-purpose-language intuition commonly produces incorrect KatLang.

## Strict Boolean semantics

`true` and `false` are first-class Boolean values. There is no numeric truthiness. `if` conditions, `filter` predicate results, and `while` continuation flags must be Boolean. Arithmetic rejects Booleans; ordering comparisons (`<`, `<=`, `>`, `>=`) require numeric scalar operands; equality/inequality are total across kinds.

`and`, `xor`, and `or` require Booleans and evaluate both operands. They do not short-circuit. `not` binds below comparisons/equality: `not x > 3` is `not (x > 3)`.

All six comparison operators share one precedence tier. Unparenthesized comparisons at the same syntactic level form one chain, evaluated left-to-right with each operand evaluated once. Parentheses break chain formation. A false link does not skip later links; errors still stop evaluation.

## Body output versus call value boundary

A KatLang algorithm body can produce zero, one, or multiple output items. Root output can therefore display several rows.

A property access, user-algorithm call, or builtin call is a value boundary: the caller receives exactly one value. If the callee produced several items, they are captured as one sequence value at that boundary.

```katlang
Pair(x) = x, x + 1

Pair(5)   # one value: (5, 6)
Pair(5)*  # two surrounding supplied items: 5, 6
```

Do not silently convert between:

- multiple surrounding output/argument items;
- one sequence value `(a, b)`;
- one exact list `[a, b]`;
- one collected list bound by `*name`.

Collection-producing builtins return one exact list value. Explicit caller-side spread is what re-opens one value into an item supply.

## No general auto-spread

Do not assume that a value containing several items automatically fills several fixed parameters.

```katlang
Pair = 10, 20
Add(x, y) = x + y

Add(Pair)   # one argument boundary: arity error
Add(Pair*)  # two supplied argument items: 30
```

A visible grouped value such as `(10, 20)` is one sequence value. An exact list such as `[10, 20]` is one list value. Only explicit spread opens their immediate items into the surrounding supply.

## Collect and spread are opposite directions

Use this mental model:

```text
collect: Supply -> ListValue
spread:  Value  -> Supply
```

A collecting binding is prefix `*name` in a parameter/pattern position:

```katlang
Group(*items) = items
```

It binds one exact list. A lone collector accepts a variable number of supplied argument items. Mixed fixed/collecting parameter lists bind fixed positions from the front/back and collect the matched middle segment.

A spread expression is postfix `value*`:

```katlang
Forward(*items) = Target(items*)
```

Spread evaluates its operand once and opens exactly one item boundary. It does not recursively flatten nested sequence/list values.

## Star versus multiplication

`*` is also multiplication. A star with a valid same-line right operand is multiplication regardless of spacing. A directly attached postfix star is spread only when no valid right operand follows on that line.

Use a comma when a spread is followed by another same-line item:

```katlang
history*, next
```

Without the comma, `history* next` is multiplication.

## Inclusive range

`range(start, stop)` is inclusive at both ends and materializes one exact list value. Do not apply half-open range conventions from Python, C#, or JavaScript libraries. `range(1, 100)` contains 100 integers; `range(100, 1)` counts downward.

## Collection builtin boundary

Collection builtins normally receive one collection argument (plus their fixed control/callback arguments). A bound sequence value or exact list is viewed one level deep as the collection's elements.

This means:

```katlang
Values = 1, 2, 3
Values.sum
sum(Values)
```

both operate on the three values, while this usually creates too many call arguments:

```katlang
sum(Values*)
```

Do not spread merely because a builtin consumes a collection. Spread changes argument supply; collection binding already opens the one bound collection at the builtin-defined level.

## Higher-order callback shape

`filter`, `map`, and `reduce` call callbacks over top-level collection elements. The callback element is passed as **one ordinary argument value**; a sequence/list element is not implicitly opened into several callback arguments. Likewise, the `reduce` accumulator is one ordinary argument value.

Their callback result contracts are strict:

- `filter` predicate: exactly one Boolean result; `true` keeps and `false` rejects;
- `map` mapper: exactly one mapped value;
- `reduce` reducer: exactly one next accumulator value.

A callback does not get a special row-opening convention. Use explicit spread if the receiving signature genuinely needs an element opened.

## Exact lists versus sequence values

Sequence values `(a, b)` and exact lists `[a, b]` are distinct value kinds.

Collection-producing builtins such as `range`, `filter`, `map`, `order`, `orderDesc`, `distinct`, `take`, `skip`, and `atoms` materialize exact lists. Zero items produce `[]`, not `()`.

The empty sequence value `()` is a real value and can be counted, compared, and spread. Spreading `()*` contributes zero items. Empty braces `{}` have no defined output and are not a value.

## Selection is zero-based and is a value boundary

`value:index` uses a zero-based index for sequence/list selection. Selection preserves the selected value; it does **not** implicitly open a selected sequence/list into a supply. `.first` and `.last` follow the same value-boundary rule. Use explicit postfix `*` to open the selected value when desired.

A selected `()` remains the empty-sequence value. Consequently, passing it to an ordinary argument supplies one value boundary; explicit spread `()*` supplies zero items.

## Ordinary argument and receiver boundaries

An ordinary non-spread argument supplies exactly one value, regardless of whether that value is numeric, Boolean, string, sequence, list, or `()`. Fixed parameters bind that value unchanged; collecting parameters collect exactly the items allocated to them.

A lexical dot call injects its receiver as one ordinary leading argument value. There is no general implicit opening of a sequence-valued receiver. Collection builtins separately apply their documented one-level collection view after binding their one collection argument.

## Dot calls and resolution

Respect KatLang's own resolution precedence instead of assuming object-oriented dispatch.

Normal name/member resolution is ownership-sensitive. Local/lexical names, structural members, opened names, and builtins are not interchangeable namespaces.

Grace with a dot call can be written as `a~.t` or `a.~t`. Grace changes inferred parameter order; it does not override structural-first member selection or lexical fallback behavior.

## Math aliases and name resolution

Current KatLang exposes one predefined lower-camel-case prelude alias for every canonical `Math` member, for example `pi` -> `Math.Pi`, `sqrt` -> `Math.Sqrt`, `sin` -> `Math.Sin`, and `exp` -> `Math.Exp`. The alias and canonical member have the same parameters, precision, domain behavior, and errors.

These are ordinary synthetic prelude bindings, not hidden `open Math` behavior:

- local/user definitions, ancestor definitions, and explicit parameters can shadow an alias;
- `Math` itself contains only canonical PascalCase members, so `Math.sin` is invalid;
- `open Math` exposes canonical names and is unrelated to the lowercase aliases;
- aliases can participate in ordinary higher-order references and lexical dot-call fallback;
- a bare alias name is already resolved from the prelude and therefore is not inferred as an implicit parameter.

There is no `Math.E` and no predefined `e`. Use `exp(1)` or `Math.Exp(1)` for Euler's number; `e` by itself remains an ordinary identifier.

## Properties and run-local behavior

Zero-parameter property results may be cached per evaluation run. Explicit invocation can have different caching behavior from ordinary property access. Do not rely on repeated evaluation of a property when the language defines it as a property value.

Random operations are not ordinary cacheable deterministic properties.

## Conditional algorithms and patterns

Conditional algorithm branches share one algorithm contract. Preserve compatible input and output shape across branches.

Pattern matching is not a general expression context. Do not introduce unsupported expression syntax into patterns.

## Numeric intent

Current KatLang numeric evaluation uses IEEE 754 Decimal128 semantics in the reference runtime. Preserve decimal intent and up to 34 significant decimal digits; do not translate calculations through binary `double` assumptions unless the user explicitly asks for host-language interop behavior.

Division by a zero-valued divisor is a KatLang diagnostic. Do not substitute IEEE division-to-infinity behavior for KatLang division semantics.
