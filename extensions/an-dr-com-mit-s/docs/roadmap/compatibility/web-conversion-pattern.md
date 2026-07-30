# Converting a `web/` file to an ES module

The procedure for moving a global-scope `web/*` file from the old tree into
`src/webview/` as a real ES module. Established by converting
`web/common/refPills.ts`; follow it for the remaining files.

Read this before starting a conversion. Once you have followed it once, the
remaining conversions of the same shape are mechanical and delegatable.

## Why this needs a procedure at all

22 of the 23 portable `web/` files contain **zero `import` statements**. They
are not dependency-free — the retired build pipeline concatenated every file
into one global scope, so their dependencies were never written down. Staging
bundles real ES modules with esbuild.

So the work is not "move the file". It is **recover the dependencies the old
pipeline let the author omit**, then satisfy each one against what staging
actually has.

The failure mode is silent. A missed global becomes a runtime `undefined`
that typechecks cleanly and passes any test that does not exercise that code
path. That is why step 5 is not optional.

## The procedure

### 1. List every free identifier

Read the file and note every identifier it uses but does not define, ignoring
language and DOM builtins. In `refPills.ts` there were exactly two:
`escapeHtml` and `codicon`.

TypeScript will find these for you once the file is in place: every unresolved
global becomes a compile error. Do not skip the manual read anyway — a global
that happens to share a name with something already imported will not error,
and that is precisely the silent case.

### 2. Classify each one

Each free identifier lands in one of three buckets. They need different work:

| Bucket                       | Meaning                                     | Action                                                    |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| **Present**                  | Staging already has an equivalent           | Import it                                                 |
| **Absent, has a substitute** | Staging solves the same problem differently | Adapt to staging's mechanism                              |
| **Absent, no substitute**    | Nothing in staging does this                | Port or author it first — this file is blocked until then |

For `refPills.ts`:

- `escapeHtml` → **present**, as `src/webview/utils/html.ts`. Straight import.
- `codicon` → **absent with a substitute**. The old tree rendered icons with
  the codicon font; staging has no codicon CSS loaded at all and uses inline
  SVG from `src/webview/utils/icons.ts`. Porting `codicon()` would have
  compiled, passed unit tests, and rendered **invisible icons** in the running
  extension. The correct adaptation was `svgIcons.tag`.

That second row is the whole reason this document exists. "Port the
dependency too" is the wrong reflex; ask what staging already does instead.

### 3. Convert the file

Move it under `src/webview/`, add the imports, and `export` what callers need
— the old files exported nothing because global scope made everything visible.

Keep the observable contract identical. `refPills.ts` kept its `.gitRef.tag`
markup, `data-name`, `data-drag-ref-type` and `data-fullref` attributes exactly,
because other code and styling match on them. Modernising syntax is fine;
changing emitted markup is not.

### 4. Wire it to a real caller in the same commit

A converted file with no caller is dead code that happens to compile. Find the
place staging does this work inline today and replace it.

`renderTagPill` replaced the inline tag branch of the ref loop in
`src/webview/main.ts`. Note the non-tag branch was left exactly as it was —
convert only what the file covers.

**When a conversion introduces a shared constant, replace only the occurrences
that mean the same thing.** Converting `graphConstants.ts` introduced
`UNCOMMITTED = "*"`, and a grep for `"*"` in `main.ts` matched four places.
Three were genuine commit-hash comparisons. The fourth was
`renderUncommitedChanges`, which renders literal asterisks as placeholder text
for the author and commit columns — identical output, unrelated meaning.
Substituting there compiles, passes every test, and silently couples the two:
change the sentinel later and the table cells change with it. Match on
meaning, not on the character.

**Convert only the parts that have a caller.** `refPills.ts` also contained
`renderTagOverflowPill`, the compact "+N" badge. Its only caller is the
sidebar's mini graph, which staging does not have yet. It was written, tested,
and then removed when the step 6 reachability check flagged it — an export
nothing reaches is dead code no matter how good its tests are. It comes back
with the sidebar. Leaving a file half-converted is the correct outcome when
the other half has nowhere to attach.

### 5. Exercise it in the running render path

**This step is what catches the silent failure.** A unit test that calls the
converted function directly proves nothing about whether anything reaches it.

Two levels, both cheap:

- Add a case to `tests/webview/rendering.test.ts`. That suite drives the real
  `main.ts` against a jsdom document, so the assertion goes through the actual
  caller. For `refPills` this meant adding a `tag` ref to the commit fixture
  and asserting `.gitRef.tag[data-name="v1.0.0"]` exists in the rendered DOM.
- Confirm the code reaches the shipped bundle:
  `npm run compile && grep -c "gitRef tag" out/web.min.js`.

For anything with visual output, also open the panel once and look at it. No
automated check in this repository can see the webview's rendered pixels.

### 6. Run the gates

```sh
npm run typecheck && npm run lint && npm run format && npm test
```

Then the reachability check from the roadmap: for each newly exported symbol,
if its only references are its own file and its own test, it is dead.

```sh
grep -rl "renderTagPill" src tests | grep -v node_modules
```

## Worked example, in full

| Step             | `refPills.ts`                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- |
| Free identifiers | `escapeHtml`, `codicon`                                                                |
| Classified       | present → import; absent-with-substitute → `svgIcons.tag`                              |
| Converted to     | `src/webview/utils/refPills.ts`, exporting `renderTagPill` and `renderTagOverflowPill` |
| Wired into       | the tag branch of the ref loop in `src/webview/main.ts`                                |
| Exercised by     | `tests/webview/rendering.test.ts` through the real render path, plus 8 unit tests      |
| Contract kept    | `.gitRef.tag` markup, `data-name`, `data-drag-ref-type`, `data-fullref`                |

## What stays non-delegatable

A conversion is mechanical **only when every free identifier falls in the
"present" bucket**. The moment one is absent, someone has to decide what
staging should do instead — that is a design call and comes back to the
primary agent. Record any new decision as a row in the roadmap's symbol
mapping table so the next conversion inherits it.
