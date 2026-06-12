# adversarial-ut — Adversarial Unit Test Suite (Bug Finding)

## When to use

Run at the start of any debug/cleanup iteration, before fixing anything.
Goal: surface bugs as passing regression tests, not as failing assertions.

## Prompt

```
Adversarial Unit Test Suite — Bug Finding

You are writing unit tests for a VS Code extension. Your goal is NOT to
verify that the code works — it is to find bugs. Do not fix any bugs you
find. Document them in the tests and list them at the end.

Work in three passes:

**Pass 1 — Functional coverage**
Write standard unit tests for each module. Test the happy path and obvious
edge cases. Get the suite running green.

**Pass 2 — Adversarial tests**
For each module, ask: "What assumption does this code make that could be
wrong?" Then write tests that attack those assumptions:
- Boundary values (0, -1, empty string, undefined vs null)
- Special characters in inputs used as regex or path delimiters
- Race conditions between async operations (what if A finishes after B?)
- Multi-call interactions (does call #2 see state left by call #1?)
- Dead code paths (constants declared but never used, settings read but
  never consumed)

**Pass 3 — Scenario-based tests**
Model realistic user workflows end-to-end. For each scenario:
1. Write a short user story ("User pins a symbol then switches files")
2. Derive what the code *should* do from the function's intent
3. Test whether it actually does that
4. Look for nonsenses: settings that configure nothing, functions whose
   output is immediately discarded, guards that fire too late

**Output format**
- Tests that confirm a bug must PASS (assert the buggy behaviour) so they
  serve as regression anchors once fixes land. Mark them `BUG:` in the
  test name.
- Tests that confirm correct behaviour are named normally.
- After all tests pass, produce a TECHDEBT.md table with columns:
  ID | Bug description | Source file | Test file

Do not fix any production code. Do not commit.
The key insight that made the results good: framing tests as passing proofs
of bugs rather than failing assertions meant every bug was captured without
blocking the suite, and the test names served as self-documenting bug reports.
```
