// Resolves a relative import/href against the file it appears in, the same
// way a bundler or browser would — used to look up sibling assets/modules in
// a flat { path: content } map of agent-generated files (there's no real
// filesystem or server to resolve against in the in-browser preview).
export function resolveRelative(fromPath: string, ref: string): string {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) return ref;
  const base = fromPath.split("/").slice(0, -1);
  for (const seg of ref.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") base.pop();
    else base.push(seg);
  }
  return base.join("/");
}
