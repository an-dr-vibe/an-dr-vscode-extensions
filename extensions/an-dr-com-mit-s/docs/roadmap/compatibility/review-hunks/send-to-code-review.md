# REVIEW provenance hunks — Send to Code Review

Audited before increment 14 copies anything, because both files carrying the
feature are classified REVIEW and so mix both origins.

## extensions/an-dr-commits/web/main.ts

- **Baseline:** 12.2%
- Every line of the send-to-review path annotates as `+` (independently
  authored, relicensable). No `B` line falls inside it.

### Independently useful authored runs

- **Line 85:** `selectedCommits` set declaration.
- **Line 115:** `sendToReviewBtnElem` field.
- **Line 295:** `updateSelectionClasses` calling `updateSendToReviewBtn`.
- **Lines 482-484:** `updateSendToReviewBtn` — shows the button only while two
  commits are selected.
- **Lines 487-495:** `sendSelectedCommitsToReview` — orders the pair
  oldest-first by table index and posts `sendToCodeReview`.

## extensions/an-dr-commits/web/styles/main.css

- **Baseline:** 22.3%
- **Lines 1685-1708:** the shared icon-button rules that `#sendToReviewBtn`
  participates in, all `+`. Not portable in practice: they are written against
  `.codicon` elements, and this extension draws authored SVG icons instead. The
  MIT button reuses the existing `.iconBtn` rules, so nothing is copied.

## Conclusion

The behaviour is clear to relicense and copy. The styling is clear but not
useful, so increment 14 ports the logic only.
