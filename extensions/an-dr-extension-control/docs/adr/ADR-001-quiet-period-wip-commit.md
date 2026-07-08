# ADR-001: WIP commits gated by file quiet-period

## Problem

`autoWipCommit` fired unconditionally on a fixed timer
(`autoWipCommitIntervalMinutes`, default 30): whatever was dirty in the repo at
that tick got committed, even if the user was mid-edit at that exact moment.
This produced WIP commits that split an in-progress change in half.

## Decision

Gate the WIP commit on a quiet period instead of firing blindly on the timer:

- Before committing, read `git status --porcelain`, resolve each changed path
  to its filesystem mtime, and take the newest one.
- Only commit if `now - newestMtime >= autoWipCommitIntervalMinutes` (in ms).
  Otherwise skip this tick — the repo is still being actively edited.
- The setting `autoWipCommitIntervalMinutes` is reinterpreted: it now means
  "minutes of inactivity required before a WIP commit fires", not "commit
  every N minutes".
- The internal poll that checks this condition runs on a fixed 1-minute
  cadence (not user-configurable), decoupled from the quiet-period setting, so
  a commit lands promptly once the repo goes quiet rather than waiting for the
  next N-minute tick.
- Deleted/inaccessible paths (stat fails) are skipped when computing the
  newest mtime — they don't block the quiet check.

## Rationale

Reusing the existing setting keeps the config surface at one knob and matches
the user's ask directly: "commit only if all files are older than a
particular time." A dedicated fixed-cadence poll (1 min) was chosen over
reusing the setting for both roles because the quiet-period value and the
check frequency are different concerns — a 30-minute quiet period checked only
every 30 minutes could delay a commit by up to 30 extra minutes after the
user actually stops.

## Rejected alternatives

- **New dedicated setting (`autoWipCommitQuietMinutes`) replacing the old
  one** — clearer semantics, but changes the config surface for no added
  value here; user chose to reuse the existing key instead.
- **Keep both settings, orthogonal (quiet threshold + separate poll
  cadence, both configurable)** — most flexible, but adds a second knob the
  user didn't ask for.
