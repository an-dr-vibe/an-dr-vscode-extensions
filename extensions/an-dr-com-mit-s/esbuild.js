const fs = require("node:fs");
const path = require("node:path");

const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Ships the GIT_ASKPASS wrapper beside the compiled helper. It is copied
 * rather than bundled because Git executes it as a shell script, and it is
 * marked executable so Git can run it on Linux and macOS.
 */
function copyAskpassShellWrapper() {
  const target = path.join(__dirname, "out", "askpass.sh");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "src", "askpass", "askpass.sh"), target);
  fs.chmodSync(target, 0o755);
}

const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log("[watch] build finished");
    });
  }
};

const aliasPlugin = {
  name: "alias",
  setup(build) {
    build.onResolve({ filter: /^@\// }, async (args) => {
      const resolved = path.resolve(__dirname, "src", args.path.slice(2));
      return build.resolve(resolved, { kind: args.kind, resolveDir: path.dirname(resolved) });
    });
  }
};

async function main() {
  const extension = await esbuild.context({
    entryPoints: ["src/extension/main.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "es6",
    outfile: "out/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [aliasPlugin, esbuildProblemMatcherPlugin]
  });

  const webview = await esbuild.context({
    entryPoints: ["src/webview/main.ts"],
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    target: "es6",
    outfile: "out/web.min.js",
    logLevel: "silent",
    plugins: [aliasPlugin, esbuildProblemMatcherPlugin]
  });

  // Git spawns this one as its own process, so it is a separate entry point
  // rather than part of the extension bundle.
  const askpass = await esbuild.context({
    entryPoints: ["src/askpass/askpassMain.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "es6",
    outfile: "out/askpass.js",
    logLevel: "silent",
    plugins: [aliasPlugin, esbuildProblemMatcherPlugin]
  });

  copyAskpassShellWrapper();

  if (watch) {
    await Promise.all([extension.watch(), webview.watch(), askpass.watch()]);
  } else {
    await extension.rebuild();
    await extension.dispose();
    await webview.rebuild();
    await webview.dispose();
    await askpass.rebuild();
    await askpass.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
