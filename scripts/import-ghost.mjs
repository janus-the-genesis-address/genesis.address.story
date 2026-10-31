// One-time import: turns ghost-export/export.json into Markdown posts and copies the images they use.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const root = new URL("..", import.meta.url).pathname;
const exportDir = join(root, "ghost-export");
const raw = JSON.parse(readFileSync(join(exportDir, "export.json"), "utf8"));
const db = raw.db ? raw.db[0].data : raw.data;

const tagsById = Object.fromEntries(db.tags.map((t) => [t.id, t]));
const metaByPost = Object.fromEntries(db.posts_meta.map((m) => [m.post_id, m]));
const tagLinks = [...db.posts_tags].sort((a, b) => a.sort_order - b.sort_order);

const turndown = new TurndownService({ headingStyle: "atx", hr: "---", codeBlockStyle: "fenced", emDelimiter: "*" });
turndown.keep(["figure", "iframe", "style"]);
turndown.addRule("marker", {
  filter: (node) => node.nodeName === "DIV" && node.getAttribute("data-marker"),
  replacement: (_, node) => `\n\n<!-- ${node.getAttribute("data-marker")} -->\n\n`,
});
turndown.addRule("keepHtmlCards", {
  filter: (node) => node.nodeName === "DIV" && /kg-/.test(node.getAttribute("class") || ""),
  replacement: (_, node) => `\n\n${node.outerHTML}\n\n`,
});
turndown.addRule("keepFiguresOnOneBlock", {
  filter: ["figure", "iframe"],
  replacement: (_, node) => `\n\n${node.outerHTML}\n\n`,
});

function clean(html) {
  const $ = cheerio.load(`<body>${html.replaceAll("__GHOST_URL__", "")}</body>`, null, false);
  $(".kg-signup-card").replaceWith('<div data-marker="signup">marker</div>');
  $('figure.kg-bookmark-card:has(a[href*="#/portal/support"])').replaceWith('<div data-marker="tip-card">marker</div>');
  $("[style]").each((_, el) => {
    const style = ($(el).attr("style") || "").replace(/white-space:\s*pre-wrap;?/g, "").trim();
    if (style) $(el).attr("style", style);
    else $(el).removeAttr("style");
  });
  $("[dir]").removeAttr("dir");
  $("em.italic").removeAttr("class");
  $("strong.bold, b.bold").removeAttr("class");
  $("i:has(> em:only-child)").each((_, el) => $(el).replaceWith($(el).html()));
  $("b:has(> strong:only-child)").each((_, el) => $(el).replaceWith($(el).html()));
  $("span").each((_, el) => {
    if (Object.keys(el.attribs).length === 0) $(el).replaceWith($(el).html());
  });
  $("img[onerror]").removeAttr("onerror");
  return $("body").html() ?? $.html();
}

const yaml = (value) => JSON.stringify(value);
const usedImages = new Set();
const noteImage = (path) => {
  if (path) usedImages.add(path.replace(/\/size\/w\d+(?:h\d+)?/, ""));
};

for (const post of db.posts) {
  const meta = metaByPost[post.id] || {};
  const topics = tagLinks
    .filter((l) => l.post_id === post.id)
    .map((l) => tagsById[l.tag_id])
    .filter((t) => t.visibility === "public")
    .map((t) => t.name);
  const featureImage = (post.feature_image || "").replace("__GHOST_URL__", "");
  noteImage(featureImage);

  const html = clean(post.html || "");
  for (const m of html.matchAll(/\/content\/images\/[^"'\s,)]+/g)) noteImage(m[0]);

  const front = [
    "---",
    `title: ${yaml(post.title)}`,
    `date: ${yaml(post.published_at)}`,
    `updated: ${yaml(post.updated_at)}`,
    `excerpt: ${yaml(post.custom_excerpt || "")}`,
    `feature_image: ${yaml(featureImage)}`,
  ];
  if (meta.feature_image_caption) front.push(`feature_image_caption: ${yaml(clean(meta.feature_image_caption))}`);
  if (meta.feature_image_alt) front.push(`feature_image_alt: ${yaml(meta.feature_image_alt)}`);
  front.push(`topics: ${yaml(topics)}`);
  if (post.featured) front.push("featured: true");
  front.push("---", "", "");

  const body = turndown.turndown(html).replace(/<(https?:\/\/)/g, "\\<$1");
  const dir = post.type === "page" ? "pages" : "posts";
  const out = join(root, "src", dir, `${post.slug}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, front.join("\n") + body + "\n");
}

const settings = Object.fromEntries(db.settings.map((s) => [s.key, s.value]));
for (const extra of [settings.icon, settings.twitter_image, db.users[0].profile_image, db.users[0].cover_image, "/content/images/2025/09/janus-5.jpg"]) {
  noteImage((extra || "").replace("__GHOST_URL__", ""));
}

const dimensions = {};
let missing = 0;
for (const path of usedImages) {
  const from = join(exportDir, decodeURI(path));
  const to = join(root, "src", decodeURI(path));
  if (!existsSync(from)) {
    console.log("MISSING", path);
    missing++;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`posts and pages: ${db.posts.length}, images copied: ${usedImages.size - missing}, missing: ${missing}`);
