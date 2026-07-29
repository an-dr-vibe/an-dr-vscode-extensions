/**
 * Provenance checker for the MIT-derived an-dr-commits implementation.
 *
 * Classifies the target code as either imported Git Graph baseline or
 * independently authored work, so baseline expression stays out of the MIT
 * extension.
 *
 * The test is overlap with the imported snapshot, never commit chronology:
 * every commit in this repository is authored by the same person, including
 * the bulk import, and later refactors moved baseline code into new files.
 *
 * Matching uses 3-line shingles over substantive lines. A lone shared line is
 * coincidence; three consecutive shared lines is relocation.
 *
 * Usage:
 *   node scripts/check-provenance.js                 summary table
 *   node scripts/check-provenance.js --annotate <f>  per-line origin for one file
 *   node scripts/check-provenance.js --json          machine-readable report
 *   node scripts/check-provenance.js --baseline <r>  override the baseline rev
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Tree-ish holding the imported Git Graph snapshot, before any local work. */
const DEFAULT_BASELINE = "4d4c579:extensions/an-dr-git";

/** Working tree subdirectory holding the extension under examination. */
const TARGET_DIR = "extensions/an-dr-commits";

/** Consecutive substantive lines that must match before a run counts as copied. */
const SHINGLE = 3;

/** Verdict thresholds, as a fraction of a file's substantive lines. */
const YOURS_BELOW = 0.05;
const BASELINE_ABOVE = 0.4;

const SCAN_EXTENSIONS = new Set([".ts", ".js", ".css", ".html"]);
const SCAN_ROOTS = ["src", "web", "tests", "media"];
const SKIP_SEGMENTS = new Set(["node_modules", "out", ".git"]);

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

/** Resolves the repository root so the script runs from any working directory. */
function findRepoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: __dirname,
    encoding: "utf8"
  }).trim();
}

const repoRoot = findRepoRoot();

/**
 * Normalises a line so formatting-only differences do not hide relocated code.
 * Returns null for lines too trivial to carry evidence of copying.
 *
 * Module declarations are excluded: which symbols a file imports is dictated by
 * the module layout rather than authored, so shared import blocks are evidence
 * of a shared dependency graph, not of copying.
 */
function normalise(line) {
  const text = line.replace(/\s+/g, " ").trim();
  if (text.length < 12) return null;
  if (!/[A-Za-z0-9]/.test(text)) return null;
  if (/^[{}()[\];,.:*/+\-<>|&!?=\s]*$/.test(text)) return null;
  if (/^(import|export)\b.*\bfrom\b/.test(text)) return null;
  if (/^(import|export)\s*[{*]/.test(text)) return null;
  if (/\brequire\s*\(/.test(text) && /^(const|let|var|import)\b/.test(text)) return null;
  return text;
}

/** Extracts substantive lines from a source text, keeping 1-based line numbers. */
function substantiveLines(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const norm = normalise(lines[i]);
    if (norm !== null) out.push({ lineNo: i + 1, norm, raw: lines[i] });
  }
  return out;
}

/**
 * Resolves a path inside the baseline tree to a blob spec `git show` accepts.
 * `ls-tree` reports paths relative to a `<commit>:<subdir>` root, so the file
 * has to be appended to the subdirectory rather than to the whole rev.
 */
function baselineBlob(baselineRev, file) {
  const sep = baselineRev.indexOf(":");
  if (sep === -1) return `${baselineRev}:${file}`;
  const commit = baselineRev.slice(0, sep);
  const prefix = baselineRev.slice(sep + 1).replace(/\/+$/, "");
  return prefix ? `${commit}:${prefix}/${file}` : `${commit}:${file}`;
}

/** Builds the set of baseline shingles, never spanning a file boundary. */
function buildBaselineIndex(baselineRev) {
  const files = runGit(["ls-tree", "-r", "--name-only", baselineRev])
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && SCAN_EXTENSIONS.has(path.extname(f)));

  const shingles = new Set();
  for (const file of files) {
    let text;
    try {
      text = runGit(["show", baselineBlob(baselineRev, file)]);
    } catch {
      continue;
    }
    const lines = substantiveLines(text);
    for (let i = 0; i + SHINGLE <= lines.length; i++) {
      shingles.add(
        lines
          .slice(i, i + SHINGLE)
          .map((l) => l.norm)
          .join("\n")
      );
    }
  }
  return { shingles, fileCount: files.length };
}

/** Lists the target files to classify, relative to the repository root. */
function listTargetFiles() {
  const tracked = runGit(["ls-files", "--", TARGET_DIR]).split("\n");
  return tracked
    .map((f) => f.trim())
    .filter((f) => {
      if (!f || !SCAN_EXTENSIONS.has(path.extname(f))) {
        return false;
      }
      if (!fs.existsSync(path.join(repoRoot, f))) {
        return false;
      }
      const rel = path.relative(TARGET_DIR, f).split(/[\\/]/);
      if (rel.some((seg) => SKIP_SEGMENTS.has(seg))) {
        return false;
      }
      return SCAN_ROOTS.includes(rel[0]);
    });
}

/**
 * Marks which of a file's substantive lines belong to a copied run.
 * Reads the working tree, so a copy can be audited before it is committed.
 */
function classify(file, index) {
  const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
  const lines = substantiveLines(text);
  const copied = new Set();

  for (let i = 0; i + SHINGLE <= lines.length; i++) {
    const window = lines.slice(i, i + SHINGLE);
    const key = window.map((l) => l.norm).join("\n");
    if (index.shingles.has(key)) {
      for (const l of window) {
        copied.add(l.lineNo);
      }
    }
  }

  const total = lines.length;
  const ratio = total === 0 ? 0 : copied.size / total;
  let verdict = "REVIEW";
  if (ratio < YOURS_BELOW) {
    verdict = "YOURS";
  } else if (ratio > BASELINE_ABOVE) {
    verdict = "BASELINE";
  }

  return { file, total, copied, ratio, verdict, lines };
}

/** Prints one file with every substantive line marked by origin. */
function annotate(file, index) {
  const result = classify(file, index);
  console.log(`${file}  ${(result.ratio * 100).toFixed(1)}% baseline  ${result.verdict}\n`);
  console.log("  B = matches the imported snapshot, keep out of the MIT extension");
  console.log("  + = independently authored, relicensable\n");
  for (const line of result.lines) {
    const mark = result.copied.has(line.lineNo) ? "B" : "+";
    console.log(`${mark} ${String(line.lineNo).padStart(5)} | ${line.raw}`);
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf("--baseline");
  const annotateIdx = args.indexOf("--annotate");
  const asJson = args.includes("--json");

  let baselineRev = DEFAULT_BASELINE;
  if (baselineIdx !== -1) {
    baselineRev = args[baselineIdx + 1];
    if (!baselineRev || baselineRev.startsWith("--")) {
      console.error(`--baseline requires a tree-ish, for example ${DEFAULT_BASELINE}`);
      process.exit(2);
    }
  }

  let target = null;
  if (annotateIdx !== -1) {
    target = args[annotateIdx + 1];
    if (!target || target.startsWith("--")) {
      console.error(
        `--annotate requires a path relative to the repository root, for example ${TARGET_DIR}/src/inlineBlame.ts`
      );
      process.exit(2);
    }
    target = target.replace(/\\/g, "/");
    if (!fs.existsSync(path.join(repoRoot, target))) {
      console.error(`No such file: ${target}`);
      console.error(
        `Paths are relative to the repository root, for example ${TARGET_DIR}/src/inlineBlame.ts`
      );
      process.exit(2);
    }
  }

  const index = buildBaselineIndex(baselineRev);

  if (target !== null) {
    annotate(target, index);
    return;
  }

  const results = listTargetFiles()
    .map((f) => classify(f, index))
    .sort((a, b) => b.ratio - a.ratio);

  if (asJson) {
    console.log(
      JSON.stringify(
        results.map((r) => ({
          file: r.file,
          substantiveLines: r.total,
          baselineLines: r.copied.size,
          ratio: Number(r.ratio.toFixed(4)),
          verdict: r.verdict
        })),
        null,
        2
      )
    );
    return;
  }

  const counts = { YOURS: 0, REVIEW: 0, BASELINE: 0 };
  let yoursLines = 0;
  console.log(
    `Baseline: ${baselineRev}  (${index.fileCount} files, ${index.shingles.size} shingles)`
  );
  console.log(`Target:   ${TARGET_DIR}  (${results.length} files)\n`);
  console.log("BASELINE%  LINES  VERDICT   FILE");
  for (const r of results) {
    counts[r.verdict]++;
    if (r.verdict === "YOURS") {
      yoursLines += r.total;
    }
    const pct = (r.ratio * 100).toFixed(1).padStart(8);
    console.log(
      `${pct}%  ${String(r.total).padStart(5)}  ${r.verdict.padEnd(8)}  ${path.relative(TARGET_DIR, r.file).replace(/\\/g, "/")}`
    );
  }
  console.log(
    `\n${counts.YOURS} yours / ${counts.REVIEW} review / ${counts.BASELINE} baseline` +
      `  (${yoursLines} substantive lines cleanly yours)`
  );
  console.log("\nREVIEW files mix both origins - use --annotate <file> before copying any hunk.");
  if (counts.BASELINE > 0) {
    console.error("\nBaseline expression is present in the MIT target.");
    process.exitCode = 1;
  }
}

main();
