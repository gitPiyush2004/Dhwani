// Inlines the preview build (dist-preview) into ONE standalone HTML file that
// runs straight from the filesystem (it uses a hash router). Run after
// `vite build --config vite.preview.config.ts`, or just use `npm run build:preview`.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "dist-preview");
const OUT = path.join(DIR, "dhwani-preview.html");

if (!fs.existsSync(DIR)) {
  console.error("dist-preview/ not found. Run `vite build --config vite.preview.config.ts` first.");
  process.exit(1);
}

const read = (href) => fs.readFileSync(path.join(DIR, href.replace(/^\.\//, "")), "utf8");
let html = fs.readFileSync(path.join(DIR, "preview.html"), "utf8");

// stylesheet -> <style>
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_m, href) => `<style>\n${read(href)}\n</style>`
);

// module script -> inline (escaping any closing script tag in the bundle)
html = html.replace(
  /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_m, src) => `<script type="module">\n${read(src).replace(/<\/script>/gi, "<\\/script>")}\n</script>`
);

// drop leftover preload hints
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "");

// favicon -> data URI so the file is fully standalone
const favicon = path.join(DIR, "favicon.svg");
if (fs.existsSync(favicon)) {
  const uri = "data:image/svg+xml;base64," + fs.readFileSync(favicon).toString("base64");
  html = html.replace(/(<link[^>]*rel="icon"[^>]*href=")[^"]*(")/, `$1${uri}$2`);
}

fs.writeFileSync(OUT, html);
const left = (html.match(/(src|href)="\.\//g) || []).length;
console.log(`wrote ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
if (left) console.warn(`warning: ${left} external reference(s) remain`);
