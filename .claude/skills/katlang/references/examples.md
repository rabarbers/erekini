# KatLang Examples

These examples illustrate current style and high-value semantic distinctions. Validate version-sensitive code with the bundled CLI when it supports the documented feature.

## Simple algorithm

KatLang can infer parameters in first-appearance order:

```katlang
Square = x * x
```

Use an explicit parameter list when the interface should be closed or clearer:

```katlang
Square(x) = x * x
```

## Collecting calculation

```katlang
Average(*values) = values.sum / values.count
```

`*values` is a collecting parameter. It collects the supplied argument items as one exact list.

```katlang
Average(2, 4, 6)
```

The call supplies three argument items; `values` is `[2, 4, 6]` inside the algorithm.

## Multiple outputs and the call value boundary

```katlang
Pair(x) = x, x + 1
```

The body has two output items, but the call returns one value:

```katlang
Pair(5)   # (5, 6)
Pair(5)*  # supplies 5 and 6 separately to the surrounding context
```

Do not treat a call as if it automatically emits all of its body's items into the caller.

## Collecting boundary

```katlang
Group(*items) = items
```

```katlang
Group(1, 2, 3)   # [1, 2, 3]
Group((1, 2, 3)) # [(1, 2, 3)] -- one structured argument item
```

A collecting parameter collects argument items; it does not recursively flatten values.

## Explicit spread

```katlang
Target(a, b) = a + b
Pair = 10, 20

Target(Pair*)
```

Postfix `*` opens one value boundary into an item supply. Without spread, `Target(Pair)` is one argument boundary and does not satisfy two fixed parameters.

When another same-line item follows a spread, use a comma:

```katlang
(history*, next)
```

## Inclusive range and inline callbacks

`range` includes both endpoints. Inline brace blocks are algorithms and work naturally as callbacks:

```katlang
range(1, 100).map{x * x}.sum # 338350
range(1, 10).filter{x mod 2 == 0}.sum # 30
```

Do not write `range(1, 101)` for “1 through 100”, and do not invent `x -> x * x` lambda syntax.

## Collection builtins and exact-list results

```katlang
range(1, 5)           # [1, 2, 3, 4, 5]
range(1, 5).orderDesc # [5, 4, 3, 2, 1]
```

Collection-producing builtins return one exact list. Caller-side spread opens that list:

```katlang
range(1, 3)*
```

which supplies `1`, `2`, and `3` separately to the surrounding context.

## Filter callback

```katlang
IsEven = x mod 2 == 0
range(1, 6).filter(IsEven)
```

The predicate must return exactly one Boolean value. `false` rejects and `true` keeps the original item. The result is one exact list, here `[2, 4, 6]`.

## Realistic analysis example

```katlang
Analyze(*values) = {
    Average = values.avg
    IsAbove = x > Average
    Above = values.filter(IsAbove)

    Average, Above.count, Above.orderDesc
}

Analyze(12, 7, 19, 10, 25, 13)*
```

`Analyze(...)` itself returns one sequence value containing its three body outputs. The final caller-side `*` contributes those three items as surrounding root outputs. The third item remains the exact list returned by `orderDesc`.

## Math aliases

Prefer lowercase Math aliases in ordinary formulas:

```katlang
cos(0.123)
sin(pi / 2)
round(sqrt(2), 10)
exp(1)
```

The canonical qualified forms remain available as `Math.Cos`, `Math.Sin`, `Math.Pi`, `Math.Round`, `Math.Sqrt`, and `Math.Exp`. There is no `Math.E` or predefined `e` alias.

If a local definition shadows an alias, use the canonical qualified form when the builtin is intended:

```katlang
sin(x) = x * 10
Math.Sin(1)
```


## Boolean conditions and comparison chains

KatLang uses real Boolean values rather than numeric truthiness:

```katlang
if(3 > 2, 10, 20) # 10
1 < 2 < 3         # true
not 2 > 3         # true; parsed as not (2 > 3)
```

Do not write `if(1, ...)` or return `0`/`1` from `filter`/`while` conditions. Logical operators are Boolean and evaluate both operands.

## Dot-call style

```katlang
range(1, 10).sum
```

Prefer documented dot-call style over importing method names from another language.

## Grace with dot call

```katlang
a~.t
a.~t
```

Grace adjusts inferred parameter order. The dot remains explicit for these dot-call forms.

## Zero-based selection

```katlang
Values = 10, 20, 30
Values:0 # 10
Values:2 # 30
```

Use `.first` or `.last` when they express positional intent more directly.

Selection preserves the selected value. For example, selecting a sequence-valued element still yields that sequence value; it does not implicitly supply its contents. Use postfix `*` explicitly when opening is intended. `.first` and `.last` follow the same boundary rule.

## Empty values

```katlang
() # empty sequence value
[] # empty exact list
```

They are distinct. A collection-producing builtin with no kept/produced elements returns `[]`, not `()`.

## Translation checklist

For code translated from Python, Kotlin, JavaScript, C#, or another language, verify:

1. root/body output cardinality versus one-value call boundaries;
2. sequence values `(a, b)` versus exact lists `[a, b]`;
3. collecting parameters `*name` versus spread expressions `value*`;
4. absence of implicit auto-spread;
5. collection builtin argument shape and exact-list results;
6. callback result shape for `filter`, `map`, and `reduce`;
7. builtin names;
8. dot-call/member semantics;
9. zero-based selection;
10. strict Boolean conditions and comparison chaining;
11. selection/`.first`/`.last` as value boundaries;
12. Decimal128 numeric intent;
13. CLI validation.
