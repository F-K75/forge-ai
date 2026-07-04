import { resolveRelative } from "./previewPaths";

const JS_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

const ENTRY_CANDIDATES = [
  "src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js",
  "src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js",
  "main.tsx", "main.ts", "main.jsx", "main.js",
  "index.tsx", "index.ts", "index.jsx", "index.js",
];

export function findReactEntry(files: Record<string, string>): string | null {
  return ENTRY_CANDIDATES.find((p) => files[p] !== undefined) ?? null;
}

function isTranspilable(path: string): boolean {
  return JS_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// Agents write real ES module source (import/export, JSX, TS types) — there's
// no bundler in the browser, so relative imports are resolved against the
// flat files map and rewritten to point at the matching key directly, the
// same job a bundler's module resolver would do.
function resolveModule(files: Record<string, string>, fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const base = resolveRelative(fromPath, specifier);
  const candidates = [
    base,
    ...JS_EXTENSIONS.map((ext) => base + ext),
    ...JS_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return candidates.find((c) => files[c] !== undefined) ?? null;
}

function rewriteRequires(files: Record<string, string>, fromPath: string, code: string): string {
  return code.replace(/require\((['"])([^'"]+)\1\)/g, (full, _quote, spec) => {
    if (!spec.startsWith(".") && !spec.startsWith("/")) return full; // bare specifier — handled at runtime
    const resolved = resolveModule(files, fromPath, spec);
    return resolved ? `require(${JSON.stringify(resolved)})` : full;
  });
}

async function transpileAll(files: Record<string, string>): Promise<Record<string, string>> {
  // Sucrase's parser is sizable and only needed once a build actually has
  // JSX/TS source to preview — code-split it out of the Workspace's main
  // bundle instead of paying for it on every workspace visit.
  const { transform } = await import("sucrase");
  const compiled: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    if (!isTranspilable(path)) continue;
    try {
      const { code } = transform(source, { transforms: ["jsx", "typescript", "imports"], filePath: path, production: true });
      compiled[path] = rewriteRequires(files, path, code);
    } catch (err) {
      compiled[path] = `throw new Error(${JSON.stringify(`Failed to compile ${path}: ${(err as Error).message}`)});`;
    }
  }
  return compiled;
}

// Builds a standalone HTML document that transpiles and runs a React project
// entirely client-side inside a sandboxed iframe. This is a best-effort
// preview, not a real bundler: bare npm imports beyond react/react-dom
// (e.g. a UI kit or fetch client an agent pulled in) aren't resolvable and
// surface as a caught runtime error rather than a blank screen.
export async function buildReactPreviewHtml(files: Record<string, string>, entryPath: string): Promise<string> {
  const compiled = await transpileAll(files);
  const cssFiles = Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith(".css")));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
  #__forge_error { white-space: pre-wrap; padding: 16px; color: #b91c1c; background: #fef2f2; font: 12px/1.6 ui-monospace, monospace; }
</style>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var modules = ${JSON.stringify(compiled)};
  var cssFiles = ${JSON.stringify(cssFiles)};
  var entry = ${JSON.stringify(entryPath)};
  var cache = {};
  var injectedCss = {};

  function showError(err) {
    document.body.innerHTML = "";
    var box = document.createElement("div");
    box.id = "__forge_error";
    box.textContent = "Preview error: " + (err && err.message ? err.message : String(err));
    document.body.appendChild(box);
  }

  function requireModule(path) {
    if (path === "react") return window.React;
    if (path.indexOf("react-dom") === 0) return window.ReactDOM;
    if (Object.prototype.hasOwnProperty.call(cssFiles, path)) {
      if (!injectedCss[path]) {
        var style = document.createElement("style");
        style.textContent = cssFiles[path];
        document.head.appendChild(style);
        injectedCss[path] = true;
      }
      return {};
    }
    if (cache[path]) return cache[path].exports;
    var source = modules[path];
    if (source === undefined) throw new Error("Cannot find module '" + path + "'");
    var mod = { exports: {} };
    cache[path] = mod;
    var fn = new Function("require", "module", "exports", source);
    fn(requireModule, mod, mod.exports);
    return mod.exports;
  }

  window.addEventListener("error", function (e) { showError(e.error || e.message); });

  try {
    requireModule(entry);
  } catch (err) {
    showError(err);
  }
})();
</script>
</body>
</html>`;
}
