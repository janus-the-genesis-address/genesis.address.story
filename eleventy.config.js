import { readFileSync } from "node:fs";
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";

const site = JSON.parse(readFileSync(new URL("./src/_data/site.json", import.meta.url)));
const imageSizes = JSON.parse(readFileSync(new URL("./src/_data/imageSizes.json", import.meta.url)));

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: site.timezone });
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

export default function (eleventyConfig) {
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/content": "content" });

  const byNewest = (a, b) => b.date - a.date;
  eleventyConfig.addCollection("posts", (api) => api.getFilteredByGlob("src/posts/*.md").sort(byNewest));
  eleventyConfig.addCollection("topics", (api) => {
    const topics = new Map();
    for (const post of api.getFilteredByGlob("src/posts/*.md").sort(byNewest)) {
      for (const name of post.data.topics || []) {
        const slug = slugify(name);
        if (!topics.has(slug)) topics.set(slug, { name: name[0].toUpperCase() + name.slice(1), slug, posts: [] });
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
  eleventyConfig.addFilter("trimText", (text) => (text || "").trim());
  eleventyConfig.addFilter("withTopic", (posts, slug) => posts.filter((post) => (post.data.topics || []).some((t) => slugify(t) === slug)));
  eleventyConfig.addFilter("readNext", (posts, current) => {
    const mine = new Set((current.topics || []).map(slugify));
    return posts.filter((post) => post.url !== current.page.url && (post.data.topics || []).some((t) => mine.has(slugify(t)))).slice(0, 3);
  });
  eleventyConfig.addFilter("srcset", (image) => {
    const info = imageSizes[image];
    if (!info) return "";
    const entries = info.sizes.map((w) => `${image.replace("/content/images/", `/content/images/size/w${w}/`)} ${w}w`);
    return [...entries, `${image} ${info.width}w`].join(", ");
  });
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
