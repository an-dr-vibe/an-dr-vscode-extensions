# ADR-003: Startup update check is silent-unless-found and throttled

## Problem

`Sync: Check for Updates` already existed as a manual command. Running the
same check unconditionally on every `activate()` — as the existing
`autoWipCommit` / `autoPush` timers already do — would `git fetch` and
potentially pop an "up to date" notification on every single window
open/reload, including across multiple simultaneously open windows, since
each window activates the extension independently.

## Decision

- New setting `sync.checkUpdatesOnStartup` (default `true`) gates the
  feature.
- New setting `sync.checkUpdatesOnStartupThrottleHours` (default `4`) — the
  check is skipped if the last *successful* check (tracked in
  `ExtensionContext.globalState`, per machine) was more recent than this many
  hours ago. `0` disables throttling (check on every launch).
- The check runs ~5s after activation (non-blocking) and stays completely
  silent when the repo is already up to date or ahead — it only surfaces a
  notification (`"N new commit(s) available. Pull and reload?"`, reusing the
  manual command's exact prompt and `pullAndReload` flow) when there's
  something to act on.
- A failed fetch does not update the last-check timestamp, so the next launch
  retries instead of waiting out the throttle window on a failed attempt.
- If no repo root can be resolved, the startup check exits silently instead
  of showing the "repo not found" error the manual commands show — an
  unconfigured/undetected repo shouldn't nag on every launch.

## Rationale

The manual command's behavior (always fetch, always report, including "up to
date") is correct when the user explicitly asks. On an unattended startup
trigger firing in every open window, the same verbosity becomes noise; only
the actionable case (updates are available) justifies interrupting the user.
Throttling avoids redundant `git fetch` calls across frequent reloads/restarts
during a debugging session.

## Rejected alternatives

- **Always check, every launch, no throttle, matching the manual command
  exactly (including the "up to date" message)** — simplest, most literal
  mirror of the manual command, but noisy across multi-window sessions and
  frequent reloads.
