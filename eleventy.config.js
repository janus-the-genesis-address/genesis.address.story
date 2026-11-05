import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";

const site = JSON.parse(readFileSync(new URL("./src/_data/site.json", import.meta.url)));
const imageSizes = JSON.parse(readFileSync(new URL("./src/_data/imageSizes.json", import.meta.url)));

// The site's look: one folder per theme in src/_includes/themes/. `theme` in site.json picks the live one;
// THEME=casper npm start previews another without changing it.
const theme = process.env.THEME || site.theme || "headline";
if (!existsSync(new URL(`./src/_includes/themes/${theme}/base.njk`, import.meta.url))) throw new Error(`No theme called "${theme}" in src/_includes/themes/`);

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: site.timezone });
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// A topic shows under its section's name when it has one, so "World" posts read "TGA Universe" while their address stays /world/.
const topicName = (name) => site.sections.find((section) => section.slug === slugify(name))?.name || name[0].toUpperCase() + name.slice(1);

function signupCard() {
  return `<div class="kg-card genesis-signup">
  <h2>Sign up for ${site.title}</h2>
  <p>${site.description}</p>
  <a class="gh-btn genesis-signup-button" href="${site.subscribeUrl}">Subscribe on Substack</a>
  <p class="genesis-signup-note">No spam. Unsubscribe anytime.</p>
</div>`;
}

function tipCard() {
  if (!site.tipUrl) return "";
  return `<p class="genesis-tip"><a class="gh-btn genesis-signup-button" href="${site.tipUrl}">Support The Genesis Address with a tip</a></p>`;
}

const absolute = (url) => (url.startsWith("/") ? site.url + url : url);
const stripTags = (html) => html.replace(/<\/?[a-z][a-z0-9-]*(\s[^>]*)?\/?>/gi, "");
const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const captionOf = (figure) => {
  const match = figure.match(/<figcaption>([\s\S]*?)<\/figcaption>/);
  return match ? decodeEntities(stripTags(match[1])).trim() : "";
};

// Turns a post's Markdown into plain Markdown for AI readers: no HTML cards, full URLs.
function markdownForLlms(markdown) {
  const text = markdown
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!-- (signup|tip-card) -->/g, "")
    .replace(/<figure class="kg-card kg-bookmark-card[\s\S]*?<\/figure>/g, (figure) => {
      const href = figure.match(/href="([^"]+)"/)?.[1] || "";
      const title = decodeEntities(stripTags(figure.match(/kg-bookmark-title">([\s\S]*?)<\/div>/)?.[1] || ""))
        .trim()
        .replace(/^#\s*/, "");
      const caption = captionOf(figure);
      return `Related: [${title}](${absolute(href)})${caption ? `. ${caption}` : ""}`;
    })
    .replace(/<figure[\s\S]*?<\/figure>/g, (figure) => {
      const video = figure.match(/<iframe[^>]*src="([^"]+)"/)?.[1];
      const caption = captionOf(figure);
      if (video) return `[Video: ${video}]${caption ? ` ${caption}` : ""}`;
      return caption ? `[Image: ${caption}]` : "";
    })
    .replace(/<iframe[^>]*src="([^"]+)"[\s\S]*?<\/iframe>/g, "[Video: $1]")
    .replace(/\]\(\//g, `](${site.url}/`);
  return decodeEntities(stripTags(text))
    .replace(/\\([\\`*_{}\[\]()#+\-.!<>~|])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const srcsetOf = (image) => {
  const info = imageSizes[image];
  if (!info) return "";
  const entries = info.sizes.map((w) => `${image.replace("/content/images/", `/content/images/size/w${w}/`)} ${w}w`);
  return [...entries, `${image} ${info.width}w`].join(", ");
};

// The Media page: every picture the published posts show, once each, with every post it appears in.
const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] || "";
const fileHash = (image) => {
  const file = new URL(`./src${decodeURIComponent(image)}`, import.meta.url);
  return existsSync(file) ? createHash("md5").update(readFileSync(file)).digest("hex") : "";
};
const mediaSections = [
  { slug: "episodes", name: "Episodes", perPost: true },
  { slug: "bloom", name: "Backwards bloom", note: "Every part ends with the same poster, glued somewhere in that part's world. Here is the poster, then every place it has turned up so far." },
  { slug: "characters", name: "Characters" },
  { slug: "world", name: "TGA Universe", perPost: true },
  { slug: "concordance", name: "Concordance", perPost: true },
  { slug: "extras", name: "Extras", perPost: true },
];

function mediaLibrary(posts) {
  const media = site.media || {};
  const excluded = new Set(media.exclude || []);
  const posterHash = media.poster ? fileHash(media.poster) : "";
  const pictures = new Map();
  for (const post of [...posts].sort((a, b) => a.date - b.date)) {
    const section = slugify((post.data.topics || [])[0] || "");
    if (!mediaSections.some((s) => s.slug === section)) continue;
    const title = post.data.title.replace(/^#\s*/, "");
    const source = { title, short: /^Episode /.test(title) ? title.split(":")[0] : title, url: post.url };
    const found = [];
    const feature = post.data.feature_image;
    if (feature) {
      const info = imageSizes[feature] || {};
      found.push({
        src: feature,
        alt: post.data.feature_image_alt || "",
        caption: decodeEntities(stripTags(post.data.feature_image_caption || "")).trim(),
        width: info.width,
        height: info.height,
        srcset: srcsetOf(feature),
      });
    }
    const raw = readFileSync(post.inputPath, "utf8");
    for (const figure of raw.matchAll(/<figure class="kg-card kg-(?:image|gallery)-card[\s\S]*?<\/figure>/g)) {
      const caption = captionOf(figure[0]);
      for (const img of figure[0].matchAll(/<img\b[^>]*>/g)) {
        found.push({
          src: attrOf(img[0], "src"),
          alt: decodeEntities(attrOf(img[0], "alt")),
          caption,
          width: attrOf(img[0], "width"),
          height: attrOf(img[0], "height"),
          srcset: attrOf(img[0], "srcset"),
        });
      }
    }
    for (const item of found) {
      if (!item.src.startsWith("/content/images/") || /\/(thumbnail|icon|size)\//.test(item.src) || excluded.has(item.src)) continue;
      const hash = fileHash(item.src);
      if (!hash) continue;
      let picture = pictures.get(hash);
      if (!picture) {
        const bloom = item.src.includes("/sign-off-") || hash === posterHash;
        picture = { ...item, poster: hash === posterHash, section: bloom ? "bloom" : section, home: source, sources: [] };
        if (picture.poster && media.posterCaption) picture.caption = media.posterCaption;
        pictures.set(hash, picture);
      }
      for (const key of ["caption", "alt", "width", "height", "srcset"]) if (!picture[key] && item[key]) picture[key] = item[key];
      if (!picture.sources.some((s) => s.url === source.url)) picture.sources.push(source);
    }
  }
  return mediaSections
    .map((section) => {
      const items = [...pictures.values()].filter((p) => p.section === section.slug).sort((a, b) => b.poster - a.poster);
      const groups = [];
      for (const item of items) {
        const key = section.perPost ? item.home.url : "all";
        let group = groups.find((g) => g.key === key);
        if (!group) groups.push((group = { key, title: section.perPost ? item.home.title : "", url: section.perPost ? item.home.url : "", items: [] }));
        group.items.push(item);
      }
      return { ...section, count: items.length, groups };
    })
    .filter((section) => section.count);
}

export default function (eleventyConfig) {
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/content": "content" });

  eleventyConfig.addGlobalData("theme", theme);
  // Theme previews are not real visits, so they leave out the analytics script.
  eleventyConfig.addGlobalData("themePreview", Boolean(process.env.THEME));
  for (const layout of ["base", "post", "page", "listing"]) {
    eleventyConfig.addLayoutAlias(`${layout}.njk`, `themes/${theme}/${layout}.njk`);
  }

  const byNewest = (a, b) => b.date - a.date;
  eleventyConfig.addCollection("posts", (api) => api.getFilteredByGlob("src/posts/*.md").sort(byNewest));
  eleventyConfig.addCollection("topics", (api) => {
    const topics = new Map();
    for (const post of api.getFilteredByGlob("src/posts/*.md").sort(byNewest)) {
      for (const name of post.data.topics || []) {
        const slug = slugify(name);
        if (!topics.has(slug)) topics.set(slug, { name: topicName(name), slug, posts: [] });
        topics.get(slug).posts.push(post);
      }
    }
    const order = (topic) => {
      const index = site.sections.findIndex((section) => section.slug === topic.slug);
      return index === -1 ? site.sections.length : index;
    };
    return [...topics.values()].sort((a, b) => order(a) - order(b) || b.posts.length - a.posts.length);
  });

  eleventyConfig.addFilter("inLlmsSection", (posts, topics) =>
    posts.filter((post) => topics.includes(slugify((post.data.topics || [])[0] || ""))).sort((a, b) => a.date - b.date),
  );
  eleventyConfig.addFilter("plainTitle", (title) => title.replace(/^#\s*/, ""));
  eleventyConfig.addFilter("forLlms", markdownForLlms);
  eleventyConfig.addFilter("displayDate", (date) => dateFormat.format(date));
  eleventyConfig.addFilter("isoDay", (date) => date.toISOString().slice(0, 10));
  eleventyConfig.addFilter("iso", (date) => new Date(date).toISOString());
  eleventyConfig.addFilter("rfc822", (date) => new Date(date).toUTCString());
  eleventyConfig.addFilter("topicSlug", slugify);
  eleventyConfig.addFilter("topicName", topicName);
  eleventyConfig.addFilter("trimText", (text) => (text || "").trim());
  eleventyConfig.addFilter("withTopic", (posts, slug) => posts.filter((post) => (post.data.topics || []).some((t) => slugify(t) === slug)));
  // Sections marked readingOrder in site.json, such as Episodes, list their posts oldest first.
  eleventyConfig.addFilter("sectionOrder", (posts, slug) =>
    site.sections.some((section) => section.slug === slug && section.readingOrder) ? [...posts].sort((a, b) => a.date - b.date) : posts,
  );
  // Sections with "style": "channel" in site.json, such as the Concordance, are drawn as a locked chat channel.
  eleventyConfig.addFilter("isChannel", (slug) => site.sections.some((section) => section.slug === slug && section.style === "channel"));
  eleventyConfig.addFilter("readNext", (posts, current) => {
    const mine = new Set((current.topics || []).map(slugify));
    return posts.filter((post) => post.url !== current.page.url && (post.data.topics || []).some((t) => mine.has(slugify(t)))).slice(0, 3);
  });
  // The posts just before and after this one in its own section, oldest first: the previous and next episode.
  eleventyConfig.addFilter("neighbours", (posts, current) => {
    const topic = slugify((current.topics || [])[0] || "");
    const line = posts.filter((post) => slugify((post.data.topics || [])[0] || "") === topic).sort((a, b) => a.date - b.date);
    const index = line.findIndex((post) => post.url === current.page.url);
    return { previous: index > 0 ? line[index - 1] : null, next: index !== -1 ? line[index + 1] || null : null };
  });
  eleventyConfig.addFilter("srcset", srcsetOf);
  // Taller-than-wide pictures, so cards can crop the character portraits from the top.
  eleventyConfig.addFilter("isPortrait", (image) => Boolean(imageSizes[image] && imageSizes[image].height > imageSizes[image].width));
  eleventyConfig.addFilter("mediaLibrary", mediaLibrary);
  eleventyConfig.addFilter("sizedImage", (image, width) => {
    const info = imageSizes[image];
    return info && info.sizes.includes(width) ? image.replace("/content/images/", `/content/images/size/w${width}/`) : image;
  });
  eleventyConfig.addFilter("readingTime", (html) => {
    const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const images = (html.match(/<img/g) || []).length;
    let seconds = (words / 275) * 60;
    for (let i = 0; i < images; i++) seconds += Math.max(12 - i, 3);
    return Math.max(1, Math.round(seconds / 60));
  });
  eleventyConfig.addFilter("forFeed", (html) =>
    html
      .replace(/<!-- (signup|tip-card) -->/g, "")
      .replace(/(src|href)="\/(?!\/)/g, `$1="${site.url}/`)
      .replace(/\s(srcset|sizes)="[^"]*"/g, ""),
  );

  eleventyConfig.addTransform("cards", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    return content.replaceAll("<!-- signup -->", signupCard()).replaceAll("<!-- tip-card -->", tipCard());
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
