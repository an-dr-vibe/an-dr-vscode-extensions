# Cutover preflight

Run `node scripts/validate-cutover.js` after a clean checkout or before a
release. It verifies the installed candidate's final `an-dr-commits` identity,
command and setting contract counts, and installer eligibility.

A passing manifest preflight is necessary but not sufficient: run the
provenance, build, test, localization, and clean-profile checks listed in the
transition roadmap before a release.

To roll back, restore the recorded pre-cutover tag, run `pwsh install.ps1`, and
reload VS Code. This restores the previous linked extension without modifying
user repositories.
