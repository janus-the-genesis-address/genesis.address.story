// Rewrites the post list in README.md from src/posts/. Run with: npm run readme
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const site = JSON.parse(readFileSync(join(root, "src/_data/site.json"), "utf8"));
const postsDir = join(root, "src/posts");

const field = (text, name) => {
  const line = text.match(new RegExp(`^${name}: (.+)$`, "m"));
  return line ? JSON.parse(line[1]) : null;
};
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const posts = readdirSync(postsDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const text = readFileSync(join(postsDir, file), "utf8");
    return {
      slug: file.replace(/\.md$/, ""),
      title: field(text, "title").replace(/^#\s*/, ""),
      date: field(text, "date").slice(0, 10),
      topic: slugify((field(text, "topics") || [])[0] || ""),
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date));

const lines = [];
for (const section of site.llmsSections) {
  lines.push(`### ${section.name}`, "");
  for (const post of posts.filter((p) => section.topics.includes(p.topic))) {
    lines.push(`- [${post.title}](${site.url}/${post.slug}/) (${post.date})`);
  }
  lines.push("");
}
const latest = posts.at(-1);
const block = [`Latest post: [${latest.title}](${site.url}/${latest.slug}/), ${latest.date}.`, "", ...lines].join("\n").trimEnd();

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
if (!/<!-- posts:start -->[\s\S]*<!-- posts:end -->/.test(readme)) throw new Error("README.md is missing the posts markers");
const updated = readme.replace(/<!-- posts:start -->[\s\S]*<!-- posts:end -->/, () => `<!-- posts:start -->\n${block}\n<!-- posts:end -->`);
writeFileSync(readmePath, updated);
console.log(`README.md lists ${posts.length} posts. Latest: ${latest.title}`);
