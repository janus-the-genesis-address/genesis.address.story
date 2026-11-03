// Builds the site once per theme into _site-themes/<theme>/, with a page linking them all,
// so the themes can be compared side by side. Run with: npm run themes
// The live theme is still the one named in src/_data/site.json.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const site = JSON.parse(readFileSync(join(root, "src/_data/site.json"), "utf8"));
const out = join(root, "_site-themes");
const themes = readdirSync(join(root, "src/_includes/themes"))
  .filter((theme) => existsSync(join(root, "src/_includes/themes", theme, "base.njk")))
  .sort();
const sample = "episode-5-part-ii-the-distillation-begins";

rmSync(out, { recursive: true, force: true });
for (const theme of themes) {
  console.log(`Building ${theme}`);
  execFileSync(join(root, "node_modules/.bin/eleventy"), ["--quiet", `--pathprefix=/${theme}/`, `--output=${join(out, theme)}`], {
    cwd: root,
    env: { ...process.env, THEME: theme },
    stdio: ["ignore", "ignore", "inherit"],
  });
  // Every theme shows the same pictures, so share one copy instead of seven.
  rmSync(join(out, theme, "content"), { recursive: true, force: true });
  symlinkSync(join(root, "src/content"), join(out, theme, "content"));
}

const rows = themes
  .map(
    (theme) => `<li><span class="name">${theme[0].toUpperCase() + theme.slice(1)}${theme === site.theme ? " <em>(live now)</em>" : ""}</span>
      <a href="/${theme}/">Home</a> <a href="/${theme}/${sample}/">An episode</a> <a href="/${theme}/episodes/">Episodes</a> <a href="/${theme}/media/">Media</a></li>`,
  )
  .join("\n    ");
writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theme previews | ${site.title}</title>
<style>
  body { margin: 0; padding: 48px 16px; background: #1c1c1c; color: #0abdc6; font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p { margin: 0 0 32px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; padding: 16px 0; border-top: 1px solid rgba(10, 189, 198, 0.3); }
  .name { flex: 0 0 180px; font-size: 20px; font-weight: 600; }
  em { color: #ffb000; font-style: normal; font-size: 14px; }
  a { color: #0abdc6; }
</style>
</head>
<body>
<main>
  <h1>${site.title} in every theme</h1>
  <p>The same posts in each theme. To switch the live site, set <code>"theme"</code> in <code>src/_data/site.json</code>.</p>
  <ul>
    ${rows}
  </ul>
</main>
</body>
</html>
`,
);
console.log(`Done: ${themes.length} themes in _site-themes/`);
