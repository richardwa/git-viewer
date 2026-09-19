# Calculator

A tiny **expression calculator** library with zero dependencies.

## Features

- basic arithmetic: `+ - * / %`
- parentheses and unary minus
- variables via a scope object

## Usage

```ts
import { evaluate } from "calculator";

const result = evaluate("1 + 2 * (3 - 1)", { a: 10 });
// 5
```

> Note: division by zero throws a `CalcError`.

## Roadmap

1. function calls (`sin`, `cos`)
2. compile-to-closure mode
