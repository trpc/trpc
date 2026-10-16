#!/usr/bin/env node
// readme-codemod.mjs: the mechanical part of a ReadMe → Blume migration, for a
// repository in ReadMe's bi-directional Git sync layout (`docs/`, `reference/`,
// `recipes/`, `custom_pages/`, `custom_blocks/`, `_order.yaml` files, and the
// changelog from the `main` branch). Two passes:
//
//   1. Convert (default). Moves the content into the layout the ReadMe
//      reference describes, rewrites every page, and writes what the later
//      steps need:
//      - `custom_pages/` → `page/`, `changelogs/` → `changelog/`, category
//        folders → `(Category)` group folders, `.md` → `.mdx`;
//      - frontmatter mapped to Blume's schema, with a `slug` pin wherever
//        Blume's route would differ from ReadMe's flat URL;
//      - callouts (emoji blockquotes, `<Callout>`, `[block:callout]`), links
//        (`doc:`, `ref:`, `page:`, `changelog:`, `blog:`, and absolute links
//        to `--site`), `<Image>`, `<Embed>`, `<Table>`, `<Cards>`,
//        `<Columns>`, `<Accordion>`, `<HTMLBlock>`, `<Anchor>`, `<Recipe>`,
//        `<Glossary>` (with `--glossary`), variables, reusable content, the
//        other magic blocks, Font Awesome icons, emoji shortcodes, code-fence
//        titles and languages, adjacent fences → `<CodeGroup>`, and body
//        headings;
//      - `_order.yaml` → `meta.ts`;
//      - endpoint pages, frontmatter-only tag pages, and empty parent pages
//        deleted, and recorded in `readme-migration.json`;
//      - `reference/overlays/<spec>.overlay.json`, carrying endpoint-page prose
//        and the ReadMe callouts in the specs' own descriptions (JSON specs);
//      - `readme-redirects.json`, with the redirects it can already compute.
//   2. Routes (`--routes <file>`), after `blume build` and
//      `operation-routes.mjs`: redirects every old endpoint and tag-page URL
//      to its generated operation page, rewrites links to them, and writes the
//      tag-level `meta.ts` files that restore ReadMe's endpoint order.
//
// It reports what it changed and what it left for a person: custom
// components, inline components, `<style>`/`<script>`, event handlers,
// unknown components, links to pages that don't exist, and so on.
//
// Zero dependencies, deterministic (sorted traversal, no clock or randomness),
// idempotent (a second run changes nothing), and a dry run by default.
//
// Usage:
//   node readme-codemod.mjs [options] <project-root>
//     --write                 apply the changes (default: report only)
//     --json                  print the report as JSON
//     --site <origin>         the hub's origin; absolute links to it become
//                             root-relative (repeatable)
//     --glossary <file>       glossary terms: JSON ({ "Term": "Definition" }
//                             or [{ "term", "definition" }]), or a saved page
//                             of the hub, whose settings carry glossaryTerms
//   node readme-codemod.mjs --routes <routes.json> [--spec <route>=<file>]... [--write] <project-root>
//     <routes.json> is operation-routes.mjs output; pass it the same --spec
//     pairs so operationIds resolve.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// --- Data ---------------------------------------------------------------------

// Font Awesome names (style prefixes and `fa-` stripped) → Lucide. `null`
// means no Lucide counterpart: the icon is dropped and reported.
const FONT_AWESOME = {
  "arrow-left": "arrow-left",
  "arrow-right": "arrow-right",
  "arrow-right-from-bracket": "log-out",
  "arrow-up-right-from-square": "external-link",
  "arrows-rotate": "refresh-cw",
  "bag-shopping": "shopping-bag",
  ban: "ban",
  bell: "bell",
  bolt: "zap",
  book: "book",
  "book-open": "book-open",
  bookmark: "bookmark",
  box: "box",
  boxes: "boxes",
  brain: "brain",
  briefcase: "briefcase",
  brush: "brush",
  bug: "bug",
  building: "building",
  "building-columns": "landmark",
  bullhorn: "megaphone",
  calculator: "calculator",
  calendar: "calendar",
  "cart-shopping": "shopping-cart",
  "chart-bar": "chart-column",
  "chart-column": "chart-column",
  "chart-line": "chart-line",
  "chart-pie": "chart-pie",
  "chart-simple": "chart-column",
  check: "check",
  "check-circle": "circle-check",
  "circle-check": "circle-check",
  "circle-exclamation": "circle-alert",
  "circle-info": "info",
  "circle-play": "circle-play",
  "circle-question": "circle-help",
  "circle-xmark": "circle-x",
  clipboard: "clipboard",
  clock: "clock",
  cloud: "cloud",
  code: "code",
  "code-branch": "git-branch",
  "code-simple": "code",
  cog: "settings",
  comment: "message-square",
  "comment-question": "message-circle-question",
  comments: "messages-square",
  compass: "compass",
  computer: "computer",
  copy: "copy",
  "credit-card": "credit-card",
  cube: "box",
  cubes: "boxes",
  database: "database",
  desktop: "monitor",
  "diagram-project": "workflow",
  display: "monitor",
  "dollar-sign": "dollar-sign",
  download: "download",
  envelope: "mail",
  "exchange-alt": "arrow-left-right",
  "exclamation-circle": "circle-alert",
  "exclamation-triangle": "triangle-alert",
  "external-link": "external-link",
  eye: "eye",
  "eye-slash": "eye-off",
  file: "file",
  "file-chart-column": "file-chart-column",
  "file-lines": "file-text",
  "file-signature": "signature",
  filter: "filter",
  filters: "funnel",
  fingerprint: "fingerprint",
  flag: "flag",
  flask: "flask-conical",
  folder: "folder",
  "folder-open": "folder-open",
  gauge: "gauge",
  "gauge-high": "gauge",
  gavel: "gavel",
  gear: "settings",
  gears: "settings",
  gift: "gift",
  github: "github",
  globe: "globe",
  "graduation-cap": "graduation-cap",
  "hand-wave": "hand",
  handshake: "handshake",
  heart: "heart",
  "help-circle": "circle-help",
  home: "house",
  hourglass: "hourglass",
  "hourglass-half": "hourglass",
  house: "house",
  "id-card": "id-card",
  image: "image",
  inbox: "inbox",
  info: "info",
  "info-circle": "info",
  key: "key",
  laptop: "laptop",
  "laptop-code": "laptop",
  "layer-group": "layers",
  layers: "layers",
  "life-ring": "life-buoy",
  lightbulb: "lightbulb",
  link: "link",
  list: "list",
  "location-dot": "map-pin",
  lock: "lock",
  magic: "sparkles",
  "magnifying-glass": "search",
  "magnifying-glass-chart": "search",
  map: "map",
  "map-marker": "map-pin",
  microchip: "cpu",
  minus: "minus",
  mobile: "smartphone",
  "money-bill": "banknote",
  "money-bill-wave": "banknote",
  newspaper: "newspaper",
  "paint-brush": "paintbrush",
  palette: "palette",
  "paper-plane": "send",
  pause: "pause",
  pen: "pencil",
  "pen-to-square": "square-pen",
  pencil: "pencil",
  percent: "percent",
  "person-snowboarding": null,
  phone: "phone",
  play: "play",
  plug: "plug",
  plus: "plus",
  "plus-circle": "circle-plus",
  "puzzle-piece": "puzzle",
  question: "circle-help",
  "question-circle": "circle-help",
  receipt: "receipt",
  "right-to-bracket": "log-in",
  robot: "bot",
  rocket: "rocket",
  "rocket-launch": "rocket",
  rotate: "refresh-cw",
  rss: "rss",
  "rss-square": "rss",
  "satellite-dish": "satellite-dish",
  "scale-balanced": "scale",
  "screwdriver-wrench": "wrench",
  search: "search",
  server: "server",
  shield: "shield",
  "shield-alt": "shield",
  "shield-halved": "shield",
  signal: "signal",
  sitemap: "network",
  slack: "slack",
  smile: "smile",
  sparkles: "sparkles",
  "square-rss": "rss",
  star: "star",
  store: "store",
  sync: "refresh-cw",
  table: "table",
  tag: "tag",
  tags: "tags",
  terminal: "terminal",
  "thumbs-down": "thumbs-down",
  "thumbs-up": "thumbs-up",
  times: "x",
  "times-circle": "circle-x",
  toolbox: "wrench",
  trash: "trash",
  "trash-alt": "trash-2",
  "trash-can": "trash-2",
  "triangle-exclamation": "triangle-alert",
  truck: "truck",
  unlock: "lock-open",
  upload: "upload",
  user: "user",
  "user-check": "user-check",
  users: "users",
  video: "video",
  wallet: "wallet",
  "wand-magic-sparkles": "sparkles",
  webhook: "webhook",
  wifi: "wifi",
  wrench: "wrench",
  "x-twitter": null,
  xmark: "x",
};

// Style prefixes in a Font Awesome class string (`fad fa-hand-wave`,
// `fa-duotone fa-solid fa-rocket-launch`).
const FA_STYLE =
  /^(?:fa|fas|far|fad|fal|fat|fab|fast|fasl|fasr|fass|fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands|fa-sharp|fa-sharp-duotone|fa-fw|fa-lg|fa-xl|fa-2x)$/u;

// GitHub-style emoji shortcodes (the gemoji names ReadMe renders), a common
// subset as "name emoji" pairs; anything else is reported.
const SHORTCODE_PAIRS = `100 💯 1234 🔢 +1 👍 -1 👎 1st_place_medal 🥇 abc 🔤 airplane ✈️
alarm_clock ⏰ anchor ⚓ arrow_down ⬇️ arrow_forward ▶️ arrow_left ⬅️
arrow_lower_right ↘️ arrow_right ➡️ arrow_up ⬆️ arrow_upper_right ↗️
arrows_counterclockwise 🔄 art 🎨 balloon 🎈 ballot_box_with_check ☑️
bangbang ‼️ bank 🏦 bar_chart 📊 battery 🔋 bee 🐝 beer 🍺 bell 🔔 bike 🚲
birthday 🎂 black_circle ⚫ blue_heart 💙 blush 😊 bomb 💣 book 📖
bookmark 🔖 bookmark_tabs 📑 books 📚 boom 💥 brain 🧠 briefcase 💼
broken_heart 💔 bug 🐛 building_construction 🏗️ bulb 💡 cake 🍰
calendar 📆 calling 📲 camera 📷 car 🚗 card_index 📇 cat 🐱 chains ⛓️
chart 💹 chart_with_downwards_trend 📉 chart_with_upwards_trend 📈
checkered_flag 🏁 christmas_tree 🎄 clap 👏 clipboard 📋 clock1 🕐
closed_book 📕 closed_lock_with_key 🔐 cloud ☁️ coffee ☕ compass 🧭
computer 💻 confetti_ball 🎊 construction 🚧 convenience_store 🏪 cool 🆒
credit_card 💳 crown 👑 cry 😢 dart 🎯 date 📅 department_store 🏬
desktop_computer 🖥️ dna 🧬 dog 🐶 dollar 💵 e-mail 📧 earth_africa 🌍
earth_americas 🌎 earth_asia 🌏 electric_plug 🔌 email 📧 envelope ✉️
envelope_with_arrow 📩 exclamation ❗ eyes 👀 factory 🏭 fallen_leaf 🍂
file_folder 📁 fire 🔥 fireworks 🎆 flushed 😳 free 🆓 gear ⚙️ gem 💎
ghost 👻 gift 🎁 gift_heart 💝 globe_with_meridians 🌐 green_circle 🟢
green_heart 💚 grey_exclamation ❕ grey_question ❔ grin 😁 grinning 😀
hammer 🔨 hammer_and_pick ⚒️ hammer_and_wrench 🛠️ hand ✋ handshake 🤝
hatching_chick 🐣 headphones 🎧 heart ❤️ heart_decoration 💟
heart_eyes 😍 heavy_check_mark ✔️ heavy_division_sign ➗
heavy_dollar_sign 💲 heavy_exclamation_mark ❗ heavy_minus_sign ➖
heavy_multiplication_x ✖️ heavy_plus_sign ➕ hospital 🏥 hourglass ⌛
hourglass_flowing_sand ⏳ house 🏠 hugs 🤗 inbox_tray 📥
incoming_envelope 📨 information_desk_person 💁 information_source ℹ️
interrobang ⁉️ iphone 📱 jack_o_lantern 🎃 joy 😂 key 🔑 keyboard ⌨️
label 🏷️ large_blue_circle 🔵 laughing 😆 leaves 🍃 ledger 📒
left_speech_bubble 🗨️ link 🔗 lock 🔒 lock_with_ink_pen 🔏 loud_sound 🔊
loudspeaker 📢 mag 🔍 mag_right 🔎 magnet 🧲 mailbox 📫
mailbox_with_mail 📬 maple_leaf 🍁 mask 😷 medal_military 🎖️
medal_sports 🏅 mega 📣 memo 📝 microscope 🔬 money_with_wings 💸
moneybag 💰 mortar_board 🎓 movie_camera 🎥 muscle 💪 musical_note 🎵
mute 🔇 negative_squared_cross_mark ❎ nerd_face 🤓 new 🆕 no_bell 🔕
no_entry ⛔ no_entry_sign 🚫 notebook 📓 nut_and_bolt 🔩 office 🏢
ok 🆗 ok_hand 👌 old_key 🗝️ open_file_folder 📂 orange_circle 🟠
orange_heart 🧡 outbox_tray 📤 owl 🦉 package 📦 page_facing_up 📄
page_with_curl 📃 paperclip 📎 partly_sunny ⛅ partying_face 🥳
pencil 📝 pencil2 ✏️ penguin 🐧 performing_arts 🎭 phone ☎️ pick ⛏️
pizza 🍕 point_down 👇 point_left 👈 point_right 👉 point_up ☝️
point_up_2 👆 pray 🙏 purple_circle 🟣 purple_heart 💜 pushpin 📌
question ❓ rabbit 🐰 radio_button 🔘 rage 😡 rainbow 🌈 raised_hand ✋
raised_hands 🙌 receipt 🧾 recycle ♻️ red_circle 🔴 relaxed ☺️
relieved 😌 repeat 🔁 ribbon 🎀 robot 🤖 rocket 🚀 rofl 🤣
rotating_light 🚨 round_pushpin 📍 satellite 📡 school 🏫 scissors ✂️
scream 😱 scroll 📜 see_no_evil 🙈 seedling 🌱 shield 🛡️ ship 🚢
shushing_face 🤫 skull 💀 slightly_smiling_face 🙂 smile 😄 smiley 😃
smirk 😏 snowflake ❄️ sob 😭 sos 🆘 sound 🔉 sparkler 🎇 sparkles ✨
sparkling_heart 💖 speaker 🔈 speech_balloon 💬 spiral_calendar 🗓️
star ⭐ star2 🌟 star_struck 🤩 stop_sign 🛑 stopwatch ⏱️
straight_ruler 📏 sunglasses 😎 sunny ☀️ sunrise 🌅 sweat 😓
sweat_smile 😅 tada 🎉 telephone_receiver 📞 telescope 🔭 test_tube 🧪
thinking 🤔 thought_balloon 💭 thumbsdown 👎 thumbsup 👍 ticket 🎫
timer_clock ⏲️ toolbox 🧰 train 🚋 triangular_flag_on_post 🚩
triangular_ruler 📐 trophy 🏆 turtle 🐢 umbrella ☔ unicorn 🦄 unlock 🔓
up 🆙 upside_down_face 🙃 video_game 🎮 warning ⚠️ watch ⌚ wave 👋
white_check_mark ✅ white_circle ⚪ wink 😉 world_map 🗺️ wrench 🔧
writing_hand ✍️ x ❌ yellow_circle 🟡 yellow_heart 💛 zap ⚡
zipper_mouth_face 🤐`;

const readPairs = (text) => {
  const tokens = text.split(/\s+/u);
  const pairs = new Map();
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    pairs.set(tokens[index], tokens[index + 1]);
  }
  return pairs;
};
const SHORTCODES = readPairs(SHORTCODE_PAIRS);

// Emoji → callout type, as ReadMe's renderer themes them (components/Callout).
const CALLOUT_EMOJI = [
  // A bare ℹ (no variation selector) isn't in ReadMe's list: default theme.
  [/^(?:📘|ℹ️)/u, "info"],
  [/^(?:👍|✅)/u, "success"],
  [/^(?:🚧|⚠️|⚠)/u, "warning"],
  [/^(?:❗️|❗|🛑|‼️|⁉️)/u, "danger"],
];
const CALLOUT_THEME = {
  default: "note",
  error: "danger",
  info: "info",
  okay: "success",
  warn: "warning",
};
const MAGIC_CALLOUT = {
  danger: "danger",
  error: "danger",
  info: "info",
  success: "success",
  warning: "warning",
};
// A leading emoji, with its variation selectors and ZWJ sequence, a flag, or a
// keycap: what ReadMe's emoji-regex matches.
const LEADING_EMOJI =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*\uFE0F?|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)/u;

// Fence languages Shiki doesn't know, and ReadMe's tab labels for untitled
// fences (its renderer shows the language).
const FENCE_LANGUAGE = {
  cplusplus: "cpp",
  curl: "bash",
  node: "js",
  objectivec: "objc",
};
const LANGUAGE_LABEL = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  curl: "cURL",
  go: "Go",
  html: "HTML",
  http: "HTTP",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  node: "Node",
  php: "PHP",
  python: "Python",
  ruby: "Ruby",
  sh: "Shell",
  shell: "Shell",
  swift: "Swift",
  text: "Text",
  ts: "TypeScript",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

// Components Blume renders in MDX; anything else capitalized is reported.
const BLUME_COMPONENTS = new Set([
  "Accordion",
  "AccordionItem",
  "AutoTypeTable",
  "Badge",
  "Callout",
  "Card",
  "CardGroup",
  "CodeBlock",
  "CodeGroup",
  "Color",
  "Column",
  "Columns",
  "Component",
  "Diff",
  "Expandable",
  "FileTree",
  "Frame",
  "GithubInfo",
  "Icon",
  "Math",
  "Panel",
  "ParamField",
  "Prompt",
  "RequestExample",
  "ResponseExample",
  "ResponseField",
  "Step",
  "Steps",
  "Tab",
  "Tabs",
  "Tile",
  "Tooltip",
  "Tree",
  "TypeTable",
  "View",
  "Visibility",
  "YouTube",
]);

// JSX attributes: quoted strings, or `{…}` with one level of nested braces.
const ATTRS = String.raw`(?:[^>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*?`;
const VOID_TAGS = new RegExp(
  String.raw`<(?<tag>br|hr|img|input|source|wbr|col|area|embed|track|param)\b(?<rest>${ATTRS})\s*(?<!\/)>`,
  "gu"
);

const SECTIONS = {
  changelog: "changelog",
  changelogs: "changelog",
  custom_pages: "page",
  docs: "docs",
  page: "page",
  recipes: "recipes",
  reference: "reference",
};
const URL_PREFIX = {
  changelog: "/changelog/",
  docs: "/docs/",
  page: "/page/",
  recipes: "/recipes/",
  reference: "/reference/",
};
const SCHEME_PREFIX = {
  blog: "/changelog/",
  changelog: "/changelog/",
  doc: "/docs/",
  page: "/page/",
  ref: "/reference/",
};
const NEXT_PREFIX = {
  basic: "/docs/",
  changelog: "/changelog/",
  custom_page: "/page/",
  endpoint: "/reference/",
};
const MAGIC_TYPES = new Set([
  "api-header",
  "callout",
  "code",
  "embed",
  "html",
  "image",
  "parameters",
  "recipe",
  "table",
  "tutorial-tile",
]);
const CHANGELOG_TYPES = new Set([
  "added",
  "deprecated",
  "fixed",
  "improved",
  "none",
  "removed",
]);
const NAV_KEYS = [
  "category",
  "categorySlug",
  "order",
  "parent",
  "parentDoc",
  "parentDocSlug",
  "position",
];
// Keys a Blume page accepts, so a second run passes them through quietly.
const BLUME_KEYS = new Set([
  "ai",
  "api",
  "authMethod",
  "authors",
  "changelog",
  "date",
  "deprecated",
  "description",
  "draft",
  "hidden",
  "icon",
  "lastModified",
  "mode",
  "narration",
  "noindex",
  "pagination",
  "playground",
  "related",
  "search",
  "seo",
  "sidebar",
  "slug",
  "title",
  "type",
]);
const KEY_ORDER = [
  "title",
  "description",
  "type",
  "date",
  "authors",
  "changelog",
  "slug",
  "icon",
  "mode",
  "hidden",
  "draft",
  "deprecated",
  "noindex",
  "sidebar",
  "seo",
  "search",
  "related",
];

const INVENTORY = "readme-migration.json";
const REDIRECTS = "readme-redirects.json";
// Private-use placeholders for code and inline code while prose is rewritten.
const CODE_MARK = "\uE000";
const SPAN_MARK = "\uE001";
const CODE_PLACEHOLDER = /\uE000(?<index>\d+)\uE000/gu;
const SPAN_PLACEHOLDER = /\uE001(?<index>\d+)\uE001/gu;

// --- Report -------------------------------------------------------------------

const report = { counts: new Map(), files: new Map(), todo: [] };
const count = (kind, amount = 1) => {
  report.counts.set(kind, (report.counts.get(kind) ?? 0) + amount);
};
const note = (file, message) => {
  const list = report.files.get(file) ?? [];
  list.push(message);
  report.files.set(file, list);
};
const todo = (message) => {
  report.todo.push(message);
};

// --- Values -------------------------------------------------------------------

// Frontmatter comes from the YAML reader below and specs from JSON.parse:
// strings, numbers, booleans, null, arrays, and plain objects. These read the
// values back as the types the conversion needs.
const isRecord = (value) =>
  value !== null &&
  value !== undefined &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const textOf = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === true ||
    value === false ||
    Array.isArray(value) ||
    isRecord(value)
  ) {
    return;
  }
  const text = String(value).trim();
  return text === "" ? undefined : text;
};
const recordOf = (value) => (isRecord(value) ? value : {});
const listOf = (value) => (Array.isArray(value) ? value : []);

// A replace() callback that reads named groups.
const byGroups =
  (read) =>
  (...args) =>
    read(args.at(-1), args[0]);

const sortedEntries = (map) =>
  [...map.entries()].toSorted(([a], [b]) => a.localeCompare(b));

// --- Minimal YAML (the frontmatter subset ReadMe writes) ----------------------

class YamlError extends Error {
  constructor(message) {
    super(message);
    this.name = "YamlError";
  }
}

const indentOf = (line) => line.match(/^ */u)[0].length;
const isSkippable = (line) => /^\s*(?:#.*)?$/u.test(line);

const ESCAPES = {
  " ": " ",
  '"': '"',
  "/": "/",
  0: "\0",
  L: "\u2028",
  N: "\u0085",
  P: "\u2029",
  "\\": "\\",
  _: "\u00A0",
  a: "\u0007",
  b: "\b",
  e: "\u001B",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

const unescapeDouble = (body) =>
  body.replaceAll(
    /\\(?:x(?<x>[0-9a-fA-F]{2})|u(?<u>[0-9a-fA-F]{4})|U(?<big>[0-9a-fA-F]{8})|(?<char>.))/gu,
    byGroups(({ big, char, u, x }) => {
      const hex = x ?? u ?? big;
      if (hex) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      if (!Object.hasOwn(ESCAPES, char)) {
        throw new YamlError(`unknown escape \\${char}`);
      }
      return ESCAPES[char];
    })
  );

const splitFlow = (inner) => {
  const items = [];
  let current = "";
  let quote = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === "[" || char === "{") {
      throw new YamlError("nested flow collections");
    } else if (char === ",") {
      items.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") {
    items.push(current.trim());
  }
  return items;
};

const parseQuoted = (text) => {
  if (text.startsWith('"')) {
    const match = /^"(?<inner>(?:[^"\\]|\\.)*)"\s*(?:#.*)?$/u.exec(text);
    if (!match) {
      throw new YamlError("unterminated double-quoted string");
    }
    return unescapeDouble(match.groups.inner);
  }
  const match = /^'(?<inner>(?:[^']|'')*)'\s*(?:#.*)?$/u.exec(text);
  if (!match) {
    throw new YamlError("unterminated single-quoted string");
  }
  return match.groups.inner.replaceAll("''", "'");
};

const parsePlain = (text) => {
  const plain = text.replace(/\s+#.*$/u, "");
  if (/^(?:true|True|TRUE)$/u.test(plain)) {
    return true;
  }
  if (/^(?:false|False|FALSE)$/u.test(plain)) {
    return false;
  }
  if (
    /^[-+]?(?:0|[1-9]\d*)$/u.test(plain) ||
    /^[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?$/u.test(plain)
  ) {
    return Number(plain);
  }
  return plain;
};

const parseScalar = (raw) => {
  const text = raw.trim();
  if (text === "" || text === "~" || /^null$/iu.test(text)) {
    return null;
  }
  if (/^[&*!|>]/u.test(text)) {
    throw new YamlError(`unsupported value ${text}`);
  }
  if (text.startsWith('"') || text.startsWith("'")) {
    return parseQuoted(text);
  }
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) {
      throw new YamlError("unterminated flow sequence");
    }
    return splitFlow(text.slice(1, -1)).map(parseScalar);
  }
  if (text.startsWith("{")) {
    if (/^\{\s*\}$/u.test(text)) {
      return {};
    }
    throw new YamlError("flow mappings");
  }
  return parsePlain(text);
};

const foldLines = (content) => {
  let value = "";
  let previous = null;
  for (const line of content) {
    if (line === "") {
      value += "\n";
    } else if (previous === null || previous === "") {
      value += line;
    } else if (line.startsWith(" ") || previous.startsWith(" ")) {
      value += `\n${line}`;
    } else {
      value += ` ${line}`;
    }
    previous = line;
  }
  return value;
};

const chomp = (value, indicator) => {
  const body = value.replace(/\n+$/u, "");
  if (indicator === "-") {
    return body;
  }
  if (indicator === "+") {
    return `${body}${value.slice(body.length)}\n`;
  }
  return body === "" ? "" : `${body}\n`;
};

const parseBlockScalar = (lines, start, header, parentIndent) => {
  const match = /^(?<style>[|>])(?<indicator>[-+]?)$/u.exec(header);
  if (!match) {
    throw new YamlError(`unsupported block scalar header ${header}`);
  }
  let end = start;
  while (
    end < lines.length &&
    (lines[end].trim() === "" || indentOf(lines[end]) > parentIndent)
  ) {
    end += 1;
  }
  const block = lines.slice(start, end);
  const first = block.find((line) => line.trim() !== "");
  const indent = first === undefined ? 0 : indentOf(first);
  const content = block.map((line) =>
    line.trim() === "" ? "" : line.slice(indent)
  );
  const value =
    match.groups.style === "|" ? content.join("\n") : foldLines(content);
  return [chomp(value, match.groups.indicator), end];
};

const KEY_LINE =
  /^(?:"(?<dq>(?:[^"\\]|\\.)*)"|'(?<sq>(?:[^']|'')*)'|(?<plain>[^\s"'#\-?:,[\]{}][^#]*?|-[^\s#][^#]*?))\s*:(?:\s+(?<rest>.*))?$/u;

const nextContent = (lines, index) => {
  let cursor = index;
  while (cursor < lines.length && isSkippable(lines[cursor])) {
    cursor += 1;
  }
  return cursor;
};

const isSequenceLine = (line, indent) =>
  indentOf(line) === indent && /^-(?:\s|$)/u.test(line.slice(indent));

const keyOf = ({ dq, plain, sq }) => {
  if (dq !== undefined) {
    return unescapeDouble(dq);
  }
  if (sq !== undefined) {
    return sq.replaceAll("''", "'");
  }
  return plain;
};

// One `key: value` line; `parseBlock` reads a nested block.
const parseEntry = (lines, index, indent, parseBlock) => {
  const content = lines[index].slice(indent);
  const match = KEY_LINE.exec(content);
  if (!match) {
    throw new YamlError(`can't read line ${index + 1}: ${content}`);
  }
  const key = keyOf(match.groups);
  const value = (match.groups.rest ?? "").trim();
  if (value === "" || value.startsWith("#")) {
    const next = nextContent(lines, index + 1);
    const nested =
      next < lines.length &&
      (indentOf(lines[next]) > indent || isSequenceLine(lines[next], indent));
    return nested ? [key, ...parseBlock(next, indent)] : [key, null, index + 1];
  }
  if (/^[|>][-+]?(?:\s+#.*)?$/u.test(value)) {
    const header = value.replace(/\s+#.*$/u, "");
    return [key, ...parseBlockScalar(lines, index + 1, header, indent)];
  }
  const next = nextContent(lines, index + 1);
  if (next < lines.length && indentOf(lines[next]) > indent) {
    throw new YamlError(`multi-line value on line ${index + 1}`);
  }
  return [key, parseScalar(value), index + 1];
};

const parseMapping = (lines, start, indent, parseBlock) => {
  const object = {};
  let index = start;
  for (;;) {
    index = nextContent(lines, index);
    if (index >= lines.length || indentOf(lines[index]) < indent) {
      return [object, index];
    }
    if (indentOf(lines[index]) > indent) {
      throw new YamlError(`unexpected indentation on line ${index + 1}`);
    }
    if (/^-(?:\s|$)/u.test(lines[index].slice(indent))) {
      return [object, index];
    }
    const [key, value, next] = parseEntry(lines, index, indent, parseBlock);
    object[key] = value;
    index = next;
  }
};

const parseSequence = (lines, start, indent, parseBlock) => {
  const array = [];
  let index = start;
  for (;;) {
    index = nextContent(lines, index);
    if (index >= lines.length || !isSequenceLine(lines[index], indent)) {
      return [array, index];
    }
    const after = lines[index].slice(indent + 1);
    const rest = after.trimStart();
    let value;
    if (rest === "" || rest.startsWith("#")) {
      [value, index] = parseBlock(index + 1, indent + 1);
    } else if (KEY_LINE.test(rest) && !/^["'[{]/u.test(rest)) {
      // `- key: value` starts a mapping at the key's column.
      const itemIndent = indent + 1 + (after.length - rest.length);
      lines[index] = `${" ".repeat(itemIndent)}${rest}`;
      [value, index] = parseMapping(lines, index, itemIndent, parseBlock);
    } else {
      value = parseScalar(rest);
      index += 1;
    }
    array.push(value);
  }
};

const parseYaml = (text) => {
  if (/^\t|\n\t/u.test(text)) {
    throw new YamlError("tab indentation");
  }
  const lines = text.split("\n");
  const parseBlock = (start, minIndent) => {
    const index = nextContent(lines, start);
    if (index >= lines.length || indentOf(lines[index]) < minIndent) {
      return [null, index];
    }
    const indent = indentOf(lines[index]);
    return isSequenceLine(lines[index], indent)
      ? parseSequence(lines, index, indent, parseBlock)
      : parseMapping(lines, index, indent, parseBlock);
  };
  const [value, end] = parseBlock(0, 0);
  if (nextContent(lines, end) < lines.length) {
    throw new YamlError(`can't read line ${end + 1}`);
  }
  return value ?? {};
};

const plainSafe = (text) =>
  text !== "" &&
  !/^\s|\s$/u.test(text) &&
  !/^[-?:,[\]{}#&*!|>'"%@`]/u.test(text) &&
  !/:(?:\s|$)|\s#|[\n\r\t\\]/u.test(text) &&
  !/^(?:true|false|null|~|yes|no|on|off|y|n)$/iu.test(text) &&
  !/^[-+]?(?:\d|\.\d)/u.test(text);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const yamlKey = (key) =>
  /^[A-Za-z_][\w-]*$/u.test(key) ? key : JSON.stringify(key);

const yamlScalar = (value, key) => {
  if (value === null) {
    return "null";
  }
  if (value === true || value === false || Number.isFinite(value)) {
    return String(value);
  }
  const text = String(value);
  if ((key === "date" || key === "lastModified") && DATE_ONLY.test(text)) {
    return text;
  }
  return plainSafe(text) ? text : JSON.stringify(text);
};

const emitYaml = (value, indent = 0) => {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }
    if (Array.isArray(entry) && entry.length === 0) {
      lines.push(`${pad}${yamlKey(key)}: []`);
    } else if (Array.isArray(entry)) {
      lines.push(`${pad}${yamlKey(key)}:`);
      for (const item of entry) {
        if (isRecord(item)) {
          const [first, ...more] = emitYaml(item, indent + 4).split("\n");
          lines.push(`${pad}  - ${first.trimStart()}`, ...more);
        } else {
          lines.push(`${pad}  - ${yamlScalar(item)}`);
        }
      }
    } else if (isRecord(entry) && Object.keys(entry).length === 0) {
      lines.push(`${pad}${yamlKey(key)}: {}`);
    } else if (isRecord(entry)) {
      lines.push(`${pad}${yamlKey(key)}:`, emitYaml(entry, indent + 2));
    } else {
      lines.push(`${pad}${yamlKey(key)}: ${yamlScalar(entry, key)}`);
    }
  }
  return lines.join("\n");
};

// --- Files --------------------------------------------------------------------

const walk = (dir) => {
  const out = [];
  if (!existsSync(dir)) {
    return out;
  }
  for (const name of readdirSync(dir).toSorted()) {
    if (name === "node_modules" || name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
};

const splitFrontmatter = (text) => {
  const match = /^---\n(?<raw>[\s\S]*?)\n---[ \t]*(?:\n|$)/u.exec(text);
  return match
    ? { body: text.slice(match[0].length), raw: match.groups.raw }
    : { body: text, raw: null };
};

const readOrder = (file) => {
  if (!existsSync(file)) {
    return null;
  }
  const value = parseYaml(
    readFileSync(file, "utf-8")
      .replace(/^\uFEFF/u, "")
      .replaceAll("\r\n", "\n")
  );
  return [
    ...new Set(
      listOf(value)
        .map((entry) => textOf(entry))
        .filter(Boolean)
    ),
  ];
};

const isGroup = (segment) => /^\(.+\)$/u.test(segment);

const readJson = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : fallback;

// meta.ts fields in the order people write them.
const META_ORDER = ["title", "display", "order", "pages"];

const metaModule = (fields) => {
  const lines = META_ORDER.filter((key) => fields[key] !== undefined).map(
    (key) => `  ${key}: ${JSON.stringify(fields[key])},`
  );
  return `import { defineMeta } from "blume";\n\nexport default defineMeta({\n${lines.join("\n")}\n});\n`;
};

const stripSpacers = (text) =>
  text
    .replaceAll(/^[ \t]*<br\s*\/?>[ \t]*$/gmu, "")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();

// --- Links --------------------------------------------------------------------

const escapeRegExp = (text) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const fromScheme = (url) => {
  const match =
    /^(?<kind>doc|ref|page|changelog|blog):(?<slug>[^#?\s]*)(?<rest>.*)$/u.exec(
      url
    );
  if (!match) {
    return url;
  }
  const { kind, rest, slug } = match.groups;
  count(`link ${kind}: rewritten`);
  return `${SCHEME_PREFIX[kind]}${slug.toLowerCase()}${rest}`;
};

const fromSite = (url, sites) => {
  for (const site of sites) {
    if (url === site || url.startsWith(`${site}/`)) {
      count("link to the hub's own origin made root-relative");
      return url.slice(site.length) || "/";
    }
  }
  return url;
};

const checkTarget = (target, url, file, knownUrls) => {
  if (/^\/v\d[^/]*\//u.test(target)) {
    note(file, `link through a version prefix, check it: ${url}`);
    return;
  }
  const [, section] = target.split("/");
  const listed =
    !knownUrls ||
    knownUrls.has(target) ||
    /^\/(?:docs|reference|recipes|changelog|page)?$/u.test(target);
  if (!listed && ["docs", "page", "recipes", "changelog"].includes(section)) {
    note(
      file,
      `link to ${target}, which no file in this repo serves (dead on the hub too, or in another version): point it at the closest page, or unlink it`
    );
  }
};

const createLinkRewriter = (context) => (url, file) => {
  let next = fromSite(fromScheme(url), context.sites);
  if (next.startsWith("/") && !next.startsWith("//")) {
    // ReadMe's hash-router leftovers and trailing slashes.
    next = next.replace(/#\/?$/u, "").replace(/(?<=.)\/(?=[#?]|$)/u, "");
    checkTarget(next.split(/[#?]/u)[0], url, file, context.knownUrls);
  } else if (/^https?:\/\/(?!files\.|cdn\.)[^/]+\.readme\.io\b/u.test(next)) {
    note(file, `link to a readme.io hub, pass its origin with --site: ${url}`);
  }
  return next;
};

// Rewrite link targets in Markdown links, reference definitions, and href=.
const rewriteLinks = (text, file, rewrite) =>
  text
    .replaceAll(
      /\]\((?<url><[^>]*>|[^)\s]+)(?<title>(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/gu,
      byGroups(({ title, url }, all) => {
        const bare = url.startsWith("<") ? url.slice(1, -1) : url;
        const next = rewrite(bare, file);
        return next === bare ? all : `](${next}${title})`;
      })
    )
    .replaceAll(
      /^(?<lead>\s*\[[^\]]+\]:\s+)(?<url><[^>]*>|\S+)/gmu,
      byGroups(({ lead, url }, all) => {
        const angled = url.startsWith("<");
        const bare = angled ? url.slice(1, -1) : url;
        const next = rewrite(bare, file);
        if (next === bare) {
          return all;
        }
        return angled ? `${lead}<${next}>` : `${lead}${next}`;
      })
    )
    .replaceAll(
      /\bhref=(?<quote>["'])(?<url>[^"']+)\k<quote>/gu,
      byGroups(({ quote, url }, all) => {
        const next = rewrite(url, file);
        return next === url ? all : `href=${quote}${next}${quote}`;
      })
    );

// --- Icons --------------------------------------------------------------------

const lucideFor = (raw, file) => {
  const value = textOf(raw);
  if (value === undefined) {
    return;
  }
  const parts = value.split(/\s+/u).filter((part) => !FA_STYLE.test(part));
  const [first] = parts;
  if (
    parts.length === 1 &&
    !first.startsWith("fa-") &&
    /^[a-z0-9-]+$/u.test(first)
  ) {
    // Already a bare name (a second run, or a Lucide name).
    return first;
  }
  const name = parts.find((part) => part.startsWith("fa-"))?.slice(3);
  let reason;
  if (name === undefined) {
    reason = `emoji or not Font Awesome: ${value}`;
  } else if (!Object.hasOwn(FONT_AWESOME, name)) {
    reason = `no mapping for fa-${name}; pick a Lucide name`;
  } else if (FONT_AWESOME[name] === null) {
    reason = `no Lucide equivalent: fa-${name}`;
  }
  if (reason) {
    note(file, `icon dropped (${reason})`);
    count("icon dropped");
    return;
  }
  count("icon Font Awesome → Lucide");
  return FONT_AWESOME[name];
};

// --- Code and prose -----------------------------------------------------------

const FENCE = /^(?<indent>[ \t]*)(?<ticks>`{3,}|~{3,})(?<info>.*)$/u;

// A fence line's parts, or undefined. A backtick fence's info string can't
// hold a backtick (CommonMark), so a line opening with ```inline``` code is a
// paragraph, not a fence.
const fenceOf = (line) => {
  const groups = FENCE.exec(line)?.groups;
  return groups && !(groups.ticks[0] === "`" && groups.info.includes("`"))
    ? groups
    : undefined;
};

const segmentBody = (body) => {
  const segments = [];
  let current = { code: false, lines: [] };
  let fence = null;
  for (const line of body.split("\n")) {
    const match = fenceOf(line);
    if (fence === null && match) {
      if (current.lines.length > 0) {
        segments.push(current);
      }
      current = { code: true, lines: [line] };
      fence = match.ticks;
    } else if (fence === null) {
      current.lines.push(line);
    } else {
      current.lines.push(line);
      const closes =
        match &&
        match.ticks[0] === fence[0] &&
        match.ticks.length >= fence.length &&
        match.info.trim() === "";
      if (closes) {
        segments.push(current);
        current = { code: false, lines: [] };
        fence = null;
      }
    }
  }
  if (current.lines.length > 0) {
    segments.push(current);
  }
  return segments;
};

const stashSpans = (text, spans) =>
  text.replaceAll(
    /(?<!`)(?<ticks>`+)(?!`)[\s\S]*?[^`]\k<ticks>(?!`)/gu,
    (span) =>
      span.includes("\n\n")
        ? span
        : `${SPAN_MARK}${spans.push(span) - 1}${SPAN_MARK}`
  );

const restore = (text, pattern, stash) =>
  text.replaceAll(
    pattern,
    byGroups(({ index }) => stash[Number(index)])
  );

// `convert` applied to the prose between fenced code blocks only.
const mapProse = (text, convert) =>
  segmentBody(text)
    .map((segment) =>
      segment.code
        ? segment.lines.join("\n")
        : convert(segment.lines.join("\n"))
    )
    .join("\n");

// --- Attributes ---------------------------------------------------------------

const attributeValue = (groups) => {
  const quoted =
    groups.dq ?? groups.sq ?? groups.edq ?? groups.esq ?? groups.tpl;
  if (quoted !== undefined) {
    return quoted;
  }
  if (groups.expression === undefined) {
    return true;
  }
  const trimmed = groups.expression.trim();
  if (trimmed === "true" || trimmed === "false") {
    return trimmed === "true";
  }
  return trimmed;
};

const readAttributes = (source) => {
  const attributes = {};
  const pattern =
    /(?<name>[\w:-]+)(?:\s*=\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|\{\s*(?:"(?<edq>[^"]*)"|'(?<esq>[^']*)'|`(?<tpl>[^`]*)`)\s*\}|\{(?<expression>[^}]*)\}))?/gu;
  for (const match of source.matchAll(pattern)) {
    attributes[match.groups.name] = attributeValue(match.groups);
  }
  return attributes;
};

const attribute = (value) =>
  `"${String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;

// Text moved from a prop or JSON into MDX children: braces would start an
// expression, and `<` a tag.
const escapeMdxText = (text) =>
  text
    .replaceAll("{", String.raw`\{`)
    .replaceAll("}", String.raw`\}`)
    .replaceAll("<", "&lt;");

// Markdown moved from JSON into MDX children: escaped like prop text, except
// inline code and fenced code, which show their text as written.
const escapeMdxMarkdown = (text) =>
  mapProse(text, (prose) => {
    const spans = [];
    return restore(
      escapeMdxText(stashSpans(prose, spans)),
      SPAN_PLACEHOLDER,
      spans
    );
  });

const altFromFile = (src) => {
  const name = String(src).split(/[?#]/u)[0].split("/").pop() ?? "";
  const base = decodeURIComponent(name)
    .replace(/\.[a-z0-9]+$/iu, "")
    .replace(/^(?:[0-9a-f]{7,}-)+/iu, "")
    .replaceAll(/[-_]+/gu, " ")
    .replace(/\s*\(\d+\)$/u, "")
    .trim();
  const generic =
    /^(?:screen ?shot|image|img|group|untitled)\b/iu.test(base) ||
    /^[\d\s]*$/u.test(base) ||
    base.length < 3;
  return generic ? "Screenshot" : base;
};

const usableAlt = (value) => {
  const text = textOf(value);
  return (
    text !== undefined &&
    !/^\{?\s*\d+\s*\}?$/u.test(text) &&
    !/\.(?:png|jpe?g|gif|svg|webp)$/iu.test(text)
  );
};

// --- Callouts -----------------------------------------------------------------

const calloutType = (emoji) =>
  CALLOUT_EMOJI.find(([pattern]) => pattern.test(emoji))?.[1] ?? "note";

const directive = (type, title, body, indent = "") => {
  const label = title ? `[${title}]` : "";
  const lines = body === "" ? [] : body.split("\n");
  return [
    `${indent}:::${type}${label}`,
    ...lines.map((line) => (line === "" ? "" : `${indent}${line}`)),
    `${indent}:::`,
  ].join("\n");
};

const QUOTE_LINE = /^(?<indent>[ \t]*)>[ \t]?(?<content>.*)$/u;
// Lines that start a block of their own, so they can't continue a quoted
// paragraph lazily (without their `>`).
const BLOCK_START =
  /^[ \t]*(?:>|[-*+][ \t]|\d+[.)][ \t]|#{1,6}(?:[ \t]|$)|`{3}|~{3}|<|:::|\||(?:[-*_][ \t]*){3,}$)/u;
const NOT_PARAGRAPH = /^(?:#{1,6}(?:[ \t]|$)|(?:[-*_][ \t]*){3,}$)/u;

// The emoji opening a callout: ReadMe wants whitespace (or nothing) after it.
const calloutEmoji = (content) => {
  const text = content.trimStart();
  const emoji = LEADING_EMOJI.exec(text)?.[0];
  return emoji && /^(?:\s|$)/u.test(text.slice(emoji.length))
    ? emoji
    : undefined;
};

// One emoji blockquote from `start`: its title line, the quoted lines after
// it (fenced code inside them included), and lazy continuation lines, which
// belong to the quote's paragraph as in CommonMark. Returns the body and the
// index past the quote.
const readQuote = (lines, start, indent) => {
  const body = [];
  let fence = null;
  let paragraph = true;
  let index = start;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith(`${indent}>`)) {
      const content = line.slice(indent.length + 1).replace(/^[ \t]/u, "");
      const fenceLine = fenceOf(content);
      if (fenceLine && fence === null) {
        fence = fenceLine.ticks;
      } else if (
        fenceLine &&
        fenceLine.ticks[0] === fence[0] &&
        fenceLine.ticks.length >= fence.length &&
        fenceLine.info.trim() === ""
      ) {
        fence = null;
      }
      paragraph =
        fence === null &&
        !fenceLine &&
        content.trim() !== "" &&
        !NOT_PARAGRAPH.test(content.trim());
      body.push(content);
    } else if (
      paragraph &&
      line.trim() !== "" &&
      line.startsWith(indent) &&
      !BLOCK_START.test(line)
    ) {
      body.push(line.slice(indent.length).trimStart());
    } else {
      break;
    }
  }
  return [body.join("\n").replaceAll(/^\n+|\n+$/gu, ""), index];
};

const convertBlockquoteCallouts = (text, file) => {
  const lines = text.split("\n");
  const out = [];
  for (let index = 0; index < lines.length;) {
    const match = QUOTE_LINE.exec(lines[index]);
    const emoji = match ? calloutEmoji(match.groups.content) : undefined;
    if (!emoji) {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    const { content, indent } = match.groups;
    const type = calloutType(emoji);
    const title = content
      .trimStart()
      .slice(emoji.length)
      .trim()
      .replace(/^#{1,6}\s*/u, "");
    const [body, next] = readQuote(lines, index + 1, indent);
    if (/[[\]]/u.test(title)) {
      note(file, `callout title holds brackets, check it renders: ${title}`);
    }
    count(`emoji blockquote → :::${type}`);
    out.push(directive(type, title, body, indent));
    index = next;
  }
  return out.join("\n");
};

// Dedent `text` (a JSX child block) to its least-indented line. A stashed
// code block's own lines move with its placeholder line, less `keep` (the
// indentation the caller puts back on every line it writes).
const dedent = (text, code = [], keep = 0) => {
  const lines = text.replaceAll(/^\n+|\s+$/gu, "").split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(/^[ \t]*/u)[0].length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  const strip = new RegExp(`^[ \\t]{0,${Math.max(cut - keep, 0)}}`, "u");
  return lines
    .map((line) => {
      for (const { groups } of line.matchAll(CODE_PLACEHOLDER)) {
        const index = Number(groups.index);
        code[index] = code[index]
          .split("\n")
          .map((codeLine, position) =>
            position === 0 ? codeLine : codeLine.replace(strip, "")
          )
          .join("\n");
      }
      return line.slice(cut);
    })
    .join("\n");
};

const convertCalloutComponents = (text, code) =>
  text.replaceAll(
    /^(?<indent>[ \t]*)<Callout\b(?<source>[^>]*)>(?<inner>[\s\S]*?)<\/Callout>/gmu,
    byGroups(({ indent, inner, source }, all) => {
      const attributes = readAttributes(source);
      // Blume's own <Callout type> stays.
      if (attributes.type !== undefined && attributes.theme === undefined) {
        return all;
      }
      const type =
        CALLOUT_THEME[attributes.theme] ??
        calloutType(textOf(attributes.icon) ?? "");
      const lines = dedent(inner, code, indent.length).split("\n");
      let title = "";
      if (/^#{1,6}\s/u.test(lines[0] ?? "")) {
        title = lines
          .shift()
          .replace(/^#{1,6}\s*/u, "")
          .trim();
      }
      count(`<Callout> → :::${type}`);
      const body = lines.join("\n").replace(/^\n+/u, "");
      return directive(type, title, body, indent);
    })
  );

// --- Components ---------------------------------------------------------------

const tableCells = (inner) =>
  [...inner.matchAll(/<tr\b[^>]*>(?<row>[\s\S]*?)<\/tr>/gu)].map((row) =>
    [
      ...row.groups.row.matchAll(
        /<t(?<kind>[hd])\b[^>]*>(?<cell>[\s\S]*?)<\/t\k<kind>>/gu
      ),
    ].map((cell) =>
      cell.groups.cell
        .split(/\n[ \t]*\n/u)
        .map((paragraph) =>
          paragraph
            .split("\n")
            .map((line) => line.trim())
            .join(" ")
            .trim()
        )
        .filter(Boolean)
    )
  );

const hasBlocks = (rows) =>
  rows.some((row) =>
    row.some((cell) =>
      cell.some((paragraph) =>
        /^(?:[-*+] |\d+\. |:::|<(?:ul|ol|table|div|pre|Tabs|Accordion)\b)|\uE000/u.test(
          paragraph
        )
      )
    )
  );

// A cell spanning columns or rows has no Markdown form.
const SPANNING_CELL =
  /<t[hd]\b[^>]*\b(?:colspan|rowspan)\s*=\s*\{?\s*["']?\s*(?!1\b)\d/iu;

const tableToMarkdown = (inner, file, spans = []) => {
  const rows = tableCells(inner);
  if (rows.length === 0) {
    return null;
  }
  if (hasBlocks(rows)) {
    note(file, "table with lists or blocks in its cells kept as <table>");
    return null;
  }
  if (SPANNING_CELL.test(inner)) {
    note(file, "table with cells spanning columns or rows kept as <table>");
    return null;
  }
  const width = Math.max(...rows.map((row) => row.length));
  // A pipe splits a Markdown table cell even inside inline code, unless
  // escaped (GFM drops the backslash there).
  const escapePipes = (cell) =>
    cell.replaceAll("|", String.raw`\|`).replaceAll(
      SPAN_PLACEHOLDER,
      byGroups(({ index }, all) => {
        spans[Number(index)] = spans[Number(index)].replaceAll(
          "|",
          String.raw`\|`
        );
        return all;
      })
    );
  const render = (row) =>
    `| ${Array.from({ length: width }, (_, index) =>
      escapePipes((row[index] ?? []).join("<br />"))
    ).join(" | ")} |`;
  const [head, ...rest] = rows;
  const kept = rest.filter((row) => row.some((cell) => cell.length > 0));
  if (kept.length !== rest.length) {
    count("table rows dropped (empty)", rest.length - kept.length);
  }
  return [
    render(head),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...kept.map(render),
  ].join("\n");
};

const pickAlt = (attributes, caption) => {
  for (const candidate of [attributes.alt, caption, attributes.title]) {
    if (usableAlt(candidate)) {
      return textOf(candidate);
    }
  }
  return null;
};

const imageMarkdown = (attributes, caption, file) => {
  const src = textOf(attributes.src);
  if (src === undefined) {
    note(file, "an <Image> without src was left as is");
    return null;
  }
  let alt = pickAlt(attributes, caption);
  if (alt === null) {
    alt = altFromFile(src);
    note(file, `image alt derived from its file name ("${alt}"), review it`);
    count("image alt derived");
  }
  for (const key of [
    "align",
    "width",
    "height",
    "border",
    "wrap",
    "className",
    "lazy",
  ]) {
    if (attributes[key] !== undefined) {
      count(`<Image> ${key} dropped`);
    }
  }
  const markdown = `![${alt.replaceAll(/[[\]]/gu, "")}](${src})`;
  if (caption) {
    count("<Image> caption → <Frame>");
    return `<Frame caption=${attribute(caption)}>\n\n${markdown}\n\n</Frame>`;
  }
  return markdown;
};

const decodeRepeatedly = (text) => {
  let decoded = text;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return decoded;
    }
  }
  return decoded;
};

const youTubeId = (...candidates) => {
  for (const candidate of candidates.map(textOf).filter(Boolean)) {
    const match =
      /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^"'\s]*&)?v=|embed\/|shorts\/)|youtu\.be\/)(?<id>[\w-]{11})/u.exec(
        decodeRepeatedly(candidate)
      );
    if (match) {
      return match.groups.id;
    }
  }
};

const embedReplacement = (attributes, file) => {
  const id = youTubeId(attributes.url, attributes.href, attributes.html);
  if (id) {
    count("<Embed> → <YouTube>");
    const title = textOf(attributes.title);
    return `<YouTube id="${id}"${title ? ` title=${attribute(title)}` : ""} />`;
  }
  const url = textOf(attributes.url) ?? textOf(attributes.href);
  if (url === undefined) {
    note(file, "an <Embed> without url was left as is");
    return null;
  }
  const name =
    textOf(attributes.title) ??
    decodeURIComponent(url.split("/").pop() ?? url).replace(/\.pdf$/iu, "");
  const label = attributes.typeOfEmbed === "pdf" ? `${name} (PDF)` : name;
  note(
    file,
    `embed of ${url} became a link; use an <iframe> if it must stay inline`
  );
  count("<Embed> → link");
  return `[${escapeMdxText(label)}](${url})`;
};

const convertImages = (text, file) => {
  let out = text.replaceAll(
    new RegExp(
      String.raw`<Image\b(?<source>${ATTRS})(?<!\/)>(?<children>[\s\S]*?)<\/Image>`,
      "gu"
    ),
    byGroups(
      ({ children, source }, all) =>
        imageMarkdown(
          readAttributes(source),
          children.trim().replaceAll(/\s+/gu, " "),
          file
        ) ?? all
    )
  );
  out = out.replaceAll(
    new RegExp(String.raw`<Image\b(?<source>${ATTRS})\/>`, "gu"),
    byGroups(({ source }, all) => {
      const attributes = readAttributes(source);
      return (
        imageMarkdown(attributes, textOf(attributes.caption) ?? "", file) ?? all
      );
    })
  );
  // Legacy Markdown images whose alt is a pixel width and whose title is the
  // original file name: ![1544](url "image (1).png").
  return out.replaceAll(
    /!\[\d+\]\((?<src>[^)\s]+)(?:\s+"(?<title>[^"]*)")?\)/gu,
    byGroups(({ src, title }) => {
      const alt = usableAlt(title) ? title : altFromFile(src);
      note(file, `image alt was a pixel width, now "${alt}": review it`);
      count("image alt derived");
      return `![${alt.replaceAll(/[[\]]/gu, "")}](${src})`;
    })
  );
};

const convertEmbeds = (text, file) =>
  text
    .replaceAll(
      new RegExp(String.raw`<Embed\b(?<source>${ATTRS})\/>`, "gu"),
      byGroups(
        ({ source }, all) =>
          embedReplacement(readAttributes(source), file) ?? all
      )
    )
    .replaceAll(
      /\[(?<label>[^\]]*)\]\((?<url>[^)\s]+)\s+"@embed"\)/gu,
      byGroups(
        ({ label, url }, all) =>
          embedReplacement({ title: label, url }, file) ?? all
      )
    );

const convertTables = (text, file, spans) =>
  text.replaceAll(
    /<Table\b[^>]*>(?<inner>[\s\S]*?)<\/Table>/gu,
    byGroups(({ inner }, all) => {
      const markdown = tableToMarkdown(inner, file, spans);
      if (markdown === null) {
        count("<Table> → <table>");
        return all
          .replace(/^<Table\b[^>]*>/u, "<table>")
          .replace(/<\/Table>$/u, "</table>");
      }
      count("<Table> → Markdown table");
      return `\n${markdown}\n`;
    })
  );

const CSS_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\(.*\)|var\(.*\))$/iu;

const cardProps = (attributes, file, context) => {
  const props = [];
  if (attributes.title !== undefined) {
    props.push(`title=${attribute(attributes.title)}`);
  }
  const icon = lucideFor(attributes.icon, file);
  if (icon) {
    props.push(`icon="${icon}"`);
  }
  const href = textOf(attributes.href);
  if (href !== undefined) {
    props.push(`href=${attribute(context.rewrite(href, file))}`);
  }
  const color = textOf(attributes.iconColor);
  if (color !== undefined && CSS_COLOR.test(color)) {
    props.push(`color=${attribute(color)}`);
  } else if (color !== undefined) {
    note(file, `card iconColor dropped (not a CSS color): ${color}`);
  }
  if (attributes.kind !== undefined) {
    note(file, `card kind="${attributes.kind}" dropped`);
  }
  return props;
};

const convertCards = (text, file, context) =>
  text
    .replaceAll(
      /<Cards\b(?<source>[^>]*)>(?<inner>[\s\S]*?)<\/Cards>/gu,
      byGroups(({ inner, source }) => {
        const declared = Number(
          String(readAttributes(source).columns ?? "").replaceAll(/\D/gu, "")
        );
        const cards = (inner.match(/<Card\b/gu) ?? []).length;
        const cols = declared > 0 ? declared : Math.max(1, Math.min(cards, 3));
        count("<Cards> → <CardGroup>");
        return `<CardGroup cols={${cols}}>${inner}</CardGroup>`;
      })
    )
    .replaceAll(
      new RegExp(String.raw`<Card\b(?<source>${ATTRS})(?<close>\/?)>`, "gu"),
      byGroups(({ close, source }, all) => {
        const attributes = readAttributes(source);
        const readmeProps = ["iconColor", "badge", "target", "kind"].some(
          (key) => attributes[key] !== undefined
        );
        const icon = textOf(attributes.icon);
        if (
          !readmeProps &&
          (icon === undefined || /^[a-z0-9-]+$/u.test(icon))
        ) {
          return all;
        }
        count("<Card> props mapped");
        const props = cardProps(attributes, file, context).join(" ");
        if (close === "/") {
          return `<Card ${props} />`;
        }
        const badge = textOf(attributes.badge);
        return `<Card ${props}>${badge ? `\n<Badge>${escapeMdxText(badge)}</Badge>\n` : ""}`;
      })
    );

const convertColumns = (text) =>
  text.replaceAll(
    /<Columns\b(?<source>[^>]*)>(?<inner>[\s\S]*?)<\/Columns>/gu,
    byGroups(({ inner, source }, all) => {
      if (readAttributes(source).cols !== undefined) {
        return all;
      }
      const columns = (inner.match(/<Column\b/gu) ?? []).length || 2;
      count("<Columns> layout → cols");
      return `<Columns cols={${columns}}>${inner}</Columns>`;
    })
  );

const accordionItem = ({ groups }, file) => {
  const attributes = readAttributes(groups.source);
  const icon = lucideFor(attributes.icon, file);
  return `${groups.indent}  <AccordionItem title=${attribute(attributes.title)}${icon ? ` icon="${icon}"` : ""}>${groups.inner}</AccordionItem>`;
};

const accordionRuns = (text) => {
  const runs = [];
  for (const match of text.matchAll(
    /^(?<indent>[ \t]*)<Accordion\b(?<source>[^>]*\btitle=[^>]*)>(?<inner>[\s\S]*?)<\/Accordion>[ \t]*$/gmu
  )) {
    const last = runs.at(-1);
    const end = last ? last.at(-1).index + last.at(-1)[0].length : -1;
    if (last && /^\s*$/u.test(text.slice(end, match.index))) {
      last.push(match);
    } else {
      runs.push([match]);
    }
  }
  return runs;
};

// ReadMe's <Accordion title> is one collapsible: a run of them becomes one
// Blume <Accordion> of <AccordionItem>s, a lone one an <Expandable> (which
// takes no icon, so a lone one with an icon stays a one-item <Accordion>).
const convertAccordions = (text, file) => {
  let out = text;
  for (const run of accordionRuns(text).toReversed()) {
    const start = run[0].index;
    const end = run.at(-1).index + run.at(-1)[0].length;
    if (run.some((match) => /<Accordion\b/u.test(match.groups.inner))) {
      note(file, "nested <Accordion> left as is");
      continue;
    }
    const { indent, inner, source } = run[0].groups;
    let replacement;
    if (run.length === 1 && textOf(readAttributes(source).icon) === undefined) {
      const title = attribute(readAttributes(source).title);
      replacement = `${indent}<Expandable title=${title}>${inner}</Expandable>`;
      count("<Accordion> → <Expandable>");
    } else {
      const items = run.map((match) => accordionItem(match, file));
      replacement = `${indent}<Accordion>\n${items.join("\n\n")}\n${indent}</Accordion>`;
      count("<Accordion> run → <Accordion> of <AccordionItem>");
    }
    out = `${out.slice(0, start)}${replacement}${out.slice(end)}`;
  }
  return out;
};

const convertTabs = (text, file) =>
  text.replaceAll(
    /<Tab\b(?<source>[^>]*)>/gu,
    byGroups(({ source }, all) => {
      const attributes = readAttributes(source);
      const icon = textOf(attributes.icon);
      const bare = icon === undefined || /^[a-z0-9-]+$/u.test(icon);
      if (bare && attributes.iconColor === undefined) {
        return all;
      }
      const lucide = lucideFor(icon, file);
      count("<Tab> icon mapped");
      return `<Tab title=${attribute(attributes.title ?? "")}${lucide ? ` icon="${lucide}"` : ""}>`;
    })
  );

const convertGlossary = (text, file, context) => {
  const replace = (term, all) => {
    const definition = context.glossary.get(term.trim().toLowerCase());
    if (definition === undefined) {
      note(
        file,
        `glossary term "${term.trim()}" left as is: pass its definition with --glossary`
      );
      return all;
    }
    count("glossary term → <Tooltip>");
    return `<Tooltip tip=${attribute(definition)}>${term.trim()}</Tooltip>`;
  };
  return text
    .replaceAll(
      /<Glossary>(?<term>[^<]+)<\/Glossary>/gu,
      byGroups(({ term }, all) => replace(term, all))
    )
    .replaceAll(
      /<<glossary:(?<term>[^<>\n]+)>>/gu,
      byGroups(({ term }, all) => replace(term, all))
    );
};

const convertLinksAndRecipes = (text) =>
  text
    .replaceAll(
      /<Anchor\b(?<source>[^>]*)>(?<label>[\s\S]*?)<\/Anchor>/gu,
      byGroups(({ label, source }, all) => {
        const attributes = readAttributes(source);
        const href = textOf(attributes.href) ?? textOf(attributes.url);
        if (href === undefined) {
          return all;
        }
        count("<Anchor> → Markdown link");
        return `[${label.trim()}](${href})`;
      })
    )
    .replaceAll(
      /<Recipe\b(?<source>[^>]*)\/>/gu,
      byGroups(({ source }, all) => {
        const attributes = readAttributes(source);
        const slug = textOf(attributes.slug);
        if (slug === undefined) {
          return all;
        }
        count("<Recipe> → <Card>");
        return `<Card title=${attribute(attributes.title ?? slug)} href="/recipes/${slug}" />`;
      })
    );

const convertVariables = (text, file, context) => {
  const variable = (name, all) => {
    if (!/^[A-Za-z_][\w-]*$/u.test(name)) {
      note(
        file,
        `variable ${all} left as is (Blume names take letters, digits, _ and -)`
      );
      return all;
    }
    context.variables.add(name);
    count("variable → {{name}}");
    return `{{${name}}}`;
  };
  return text
    .replaceAll(
      /<Variable\b[^>]*\bname=["'](?<name>[^"']+)["'][^>]*\/>/gu,
      byGroups(({ name }, all) => variable(name, all))
    )
    .replaceAll(
      /\{\s*user\.(?<name>[\w-]+)\s*\}/gu,
      byGroups(({ name }, all) => variable(name, all))
    )
    .replaceAll(
      /\{\s*user\[["'](?<name>[^"']+)["']\]\s*\}/gu,
      byGroups(({ name }, all) => variable(name, all))
    )
    .replaceAll(
      /<<(?!glossary:)(?<name>[A-Za-z_][\w.-]*)>>/gu,
      byGroups(({ name }, all) => variable(name, all))
    );
};

const convertComponents = (text, file, context) => {
  let out = convertImages(text, file);
  out = convertEmbeds(out, file);
  out = convertTables(out, file, context.spans);
  out = convertCards(out, file, context);
  out = convertColumns(out);
  out = convertAccordions(out, file);
  out = convertTabs(out, file);
  out = convertGlossary(out, file, context);
  out = convertLinksAndRecipes(out);
  return convertVariables(out, file, context);
};

const convertShortcodes = (text, file) =>
  text.replaceAll(
    /(?<lead>^|[^\w:/\\])(?<code>:(?<name>[a-z0-9_+-]+):)(?![\w:])/gmu,
    byGroups(({ code, lead, name }, all) => {
      if (SHORTCODES.has(name)) {
        count(":shortcode: → emoji");
        return `${lead}${SHORTCODES.get(name)}`;
      }
      if (name.startsWith("fa-")) {
        note(file, `Font Awesome shortcode ${code} dropped`);
        return lead;
      }
      if (/[a-z]/u.test(name)) {
        note(
          file,
          `unknown emoji shortcode ${code} left as text: paste the emoji`
        );
      }
      return all;
    })
  );

// --- Magic blocks ---------------------------------------------------------------

const magicTable = (data) => {
  const cols = Number(data.cols) || 0;
  const rows = Number(data.rows) || 0;
  const cells = recordOf(data.data);
  const cell = (key) =>
    String(cells[key] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("<br />")
      .replaceAll("|", String.raw`\|`);
  const line = (prefix) =>
    `| ${Array.from({ length: cols }, (_, column) => cell(`${prefix}-${column}`)).join(" | ")} |`;
  return [
    line("h"),
    `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`,
    ...Array.from({ length: rows }, (_, row) => line(String(row))),
  ].join("\n");
};

const magicImage = (data, file) => {
  const image = listOf(data.images).find((entry) =>
    Array.isArray(entry?.image)
  );
  if (!image) {
    return "";
  }
  const [src, title, alt] = image.image;
  return imageMarkdown({ alt, src, title }, textOf(image.caption) ?? "", file);
};

const MAGIC = {
  "api-header": (data) =>
    `${"#".repeat(Math.min(Math.max(Number(data.level) || 2, 1), 6))} ${textOf(data.title) ?? ""}`,
  callout: (data) =>
    directive(
      MAGIC_CALLOUT[data.type] ?? "note",
      textOf(data.title) ?? "",
      escapeMdxMarkdown(textOf(data.body) ?? "")
    ),
  code: (data) =>
    listOf(data.codes)
      .map(
        (code) =>
          `\`\`\`${textOf(code.language) ?? ""}${code.name ? ` ${code.name}` : ""}\n${String(code.code ?? "").replace(/\n$/u, "")}\n\`\`\``
      )
      .join("\n"),
  embed: (data, file) => embedReplacement(data, file),
  html: (data) => {
    const html = textOf(data.html);
    return html === undefined
      ? null
      : `<HTMLBlock>{\`${html.replaceAll("`", "\\`")}\`}</HTMLBlock>`;
  },
  image: magicImage,
  parameters: magicTable,
  recipe: (data) =>
    `<Card title=${attribute(data.title ?? data.slug ?? "")} href="/recipes/${textOf(data.slug) ?? ""}" />`,
  table: magicTable,
  "tutorial-tile": (data) =>
    `<Card title=${attribute(data.title ?? data.slug ?? "")} href="/recipes/${textOf(data.slug) ?? ""}" />`,
};

// A block's JSON never holds a line opening another block, so one missing its
// `[/block]` can't swallow the next.
const convertMagicBlocks = (text, file) => {
  const out = text.replaceAll(
    /^\[block:(?<type>[\w-]+)\]\n(?<json>(?:(?!\n\[block:)[\s\S])*?)\n\[\/block\]$/gmu,
    byGroups(({ json, type }, all) => {
      if (!MAGIC_TYPES.has(type)) {
        note(file, `[block:${type}] has no conversion; rewrite it by hand`);
        return all;
      }
      let data;
      try {
        data = recordOf(JSON.parse(json));
      } catch {
        note(file, `[block:${type}] JSON didn't parse; convert it by hand`);
        return all;
      }
      count(`[block:${type}] converted`);
      return MAGIC[type](data, file) ?? all;
    })
  );
  for (const { groups } of out.matchAll(
    /^\[block:(?<type>[\w-]+)\]$(?<rest>(?:(?!\n\[block:)[\s\S])*)/gmu
  )) {
    if (!/^\[\/block\]$/mu.test(groups.rest)) {
      note(file, `[block:${groups.type}] has no [/block]; convert it by hand`);
    }
  }
  return out;
};

// --- HTML and judgment ------------------------------------------------------------

/** `text` without `pattern`'s matches, removed again until none is left. */
const removeAll = (text, pattern) => {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out.replaceAll(pattern, "");
  } while (out !== previous);
  return out;
};

const htmlIsSafe = (html) =>
  !/<\s*(?:style|script)\b/iu.test(html) && !/\son[a-z]+\s*=/iu.test(html);

const unwrapHtmlBlocks = (text, file) =>
  text.replaceAll(
    /<HTMLBlock\b[^>]*>\s*\{\s*`(?<raw>[\s\S]*?)`\s*\}\s*<\/HTMLBlock>/gu,
    byGroups(({ raw }, all) => {
      const html = raw.replaceAll("\\`", "`").replaceAll("\\${", "${");
      if (!htmlIsSafe(html)) {
        note(
          file,
          "<HTMLBlock> with <style>, <script>, or event handlers left as is: rebuild it with Blume components or an island"
        );
        count("<HTMLBlock> left for review");
        return all;
      }
      count("<HTMLBlock> unwrapped");
      const cleaned = removeAll(html, /<!--[\s\S]*?-->/gu)
        .replaceAll("{", "&#123;")
        .replaceAll("}", "&#125;")
        .replaceAll(VOID_TAGS, "<$<tag>$<rest> />")
        .trim();
      return `\n${cleaned}\n`;
    })
  );

const JUDGMENT = [
  [
    /\son[A-Z]\w*\s*=/u,
    "inline JSX event handlers (onClick, …) do nothing in Blume: rebuild that widget as an island",
  ],
  [
    /<\s*style\b/iu,
    "<style> block: page styles apply to the whole page, sidebar included; replace the markup with Blume components",
  ],
  [
    /<\s*script\b/iu,
    "<script> block: carry what it did over as an island or a script() adapter",
  ],
  [
    /\bclass(?:Name)?=["'][^"']*\bfa-[a-z]/u,
    'Font Awesome <i> icons in HTML: replace with <Icon icon="…" /> (Lucide)',
  ],
  [
    /\bclass(?:Name)?=["'][^"']*\b(?:p[xytblr]?|m[xytblr]?|bg|text|rounded|flex|grid|gap|w|h)-[\w[\]./-]+/u,
    "Tailwind utility classes in HTML: they don't style anything in Blume; restyle or use components",
  ],
];

const reportJudgment = (text, file, context) => {
  for (const [pattern, message] of JUDGMENT) {
    if (pattern.test(text)) {
      note(file, message);
    }
  }
  if (context.hasEsm) {
    note(
      file,
      "import/export in the page, left untouched: a component using React hooks must move to islands/, and one defined on several pages goes in islands/ once"
    );
  }
  const unknown = new Set();
  for (const match of text.matchAll(/<(?<name>[A-Z][\w.]*)\b/gu)) {
    const { name } = match.groups;
    const builtIn =
      BLUME_COMPONENTS.has(name) ||
      name.startsWith("Tree.") ||
      name.startsWith("Color.");
    if (!builtIn) {
      unknown.add(name);
    }
  }
  for (const name of [...unknown].toSorted()) {
    note(
      file,
      context.customComponents.has(name)
        ? `custom component <${name}> (custom_blocks/${name}.mdx): port it to islands/ or replace it with a Blume component`
        : `unknown component <${name}>: replace it, or the build fails`
    );
  }
};

// --- Code fences --------------------------------------------------------------

const tabLabel = (language) => {
  if (language === "") {
    return "Text";
  }
  return (
    LANGUAGE_LABEL[language] ??
    `${language[0].toUpperCase()}${language.slice(1)}`
  );
};

const fixFence = (line, file, label) => {
  const match =
    /^(?<indent>[ \t]*)(?<ticks>`{3,}|~{3,})(?<language>[^\s`]*)\s*(?<meta>.*)$/u.exec(
      line
    );
  if (!match) {
    return line;
  }
  const { indent, language: rawLanguage, meta: rawMeta, ticks } = match.groups;
  const lower = rawLanguage.toLowerCase();
  const language = FENCE_LANGUAGE[lower] ?? lower;
  if (language !== rawLanguage) {
    count(`fence language ${rawLanguage} → ${language}`);
  }
  let meta = rawMeta.trim();
  if (meta === "" && label) {
    meta = tabLabel(lower);
    count("code tab labeled with its language");
  }
  const blumeMeta =
    /(?:^|\s)(?:title=|lineNumbers|wrap|\{[\d,-]+\}|twoslash)/u.test(meta);
  if (meta !== "" && !blumeMeta && /\s/u.test(meta)) {
    meta = `title=${JSON.stringify(meta)}`;
    count('fence title → title="…"');
  }
  return `${indent}${ticks}${language}${meta ? ` ${meta}` : ""}`;
};

const withFixedFence = (segment, file, label) => ({
  ...segment,
  lines: [fixFence(segment.lines[0], file, label), ...segment.lines.slice(1)],
});

const groupAdjacentFences = (segments, file) => {
  const out = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment.code) {
      out.push(segment);
      continue;
    }
    const run = [segment];
    while (segments[index + 1]?.code) {
      index += 1;
      run.push(segments[index]);
    }
    const before = out.at(-1)?.lines.join("\n").trimEnd() ?? "";
    if (run.length === 1 || /<CodeGroup\b[^>]*>$/u.test(before)) {
      out.push(...run.map((entry) => withFixedFence(entry, file, false)));
      continue;
    }
    count("adjacent fences → <CodeGroup>");
    const [indent] = run[0].lines[0].match(/^[ \t]*/u);
    out.push({ code: false, lines: [`${indent}<CodeGroup>`, ""] });
    for (const [position, entry] of run.entries()) {
      out.push(withFixedFence(entry, file, true));
      if (position < run.length - 1) {
        out.push({ code: false, lines: [""] });
      }
    }
    out.push({ code: false, lines: ["", `${indent}</CodeGroup>`] });
  }
  return out;
};

// --- Inline ESM ---------------------------------------------------------------

// A quote opens a string only after an operator or a keyword, so JSX text
// like "don't" inside a component doesn't.
const OPENS_STRING = /^(?:|[=(,:[{!&|?+\-*%;]|=>|return)$/u;

const nextToken = (previous, char) => {
  if (/\s/u.test(char)) {
    return previous;
  }
  if (/\w/u.test(char)) {
    return /\w$/u.test(previous) ? `${previous}${char}` : char;
  }
  return previous === "=" && char === ">" ? "=>" : char;
};

// Skip a comment starting at `index`, or return -1 when there's none.
const skipComment = (text, index) => {
  if (text[index] !== "/") {
    return -1;
  }
  if (text[index + 1] === "/") {
    const newline = text.indexOf("\n", index);
    return newline === -1 ? text.length : newline - 1;
  }
  if (text[index + 1] === "*") {
    const close = text.indexOf("*/", index + 2);
    return close === -1 ? text.length : close + 1;
  }
  return -1;
};

// Advance through a string; returns the new index and whether it's still open.
const stepString = (state, text, index) => {
  const char = text[index];
  if (char === "\\") {
    return index + 1;
  }
  if (state.quote === "`" && char === "$" && text[index + 1] === "{") {
    state.stack.push("`");
    state.quote = null;
    return index + 1;
  }
  if (char === state.quote || (char === "\n" && state.quote !== "`")) {
    state.quote = null;
  }
  return index;
};

const stepCode = (state, text, index) => {
  const char = text[index];
  if (
    char === "`" ||
    ((char === '"' || char === "'") && OPENS_STRING.test(state.previous))
  ) {
    state.quote = char;
    return false;
  }
  if ("([{".includes(char)) {
    state.stack.push(char);
  } else if (")]}".includes(char) && state.stack.pop() === "`") {
    state.quote = "`";
  } else if (char === "\n" && state.stack.length === 0) {
    return true;
  }
  state.previous = nextToken(state.previous, char);
  return false;
};

// The end of the statement starting at `start` (an `import` or `export` at
// column 0): the first line end where every bracket it opened has closed.
const statementEnd = (text, start) => {
  const state = { previous: "", quote: null, stack: [] };
  for (let index = start; index < text.length; index += 1) {
    if (state.quote) {
      index = stepString(state, text, index);
      continue;
    }
    const skipped = skipComment(text, index);
    if (skipped !== -1) {
      index = skipped;
      continue;
    }
    if (stepCode(state, text, index)) {
      return index;
    }
  }
  return text.length;
};

// Swap each column-0 import/export statement for a placeholder, so no
// conversion touches the code: those components move to islands/ by hand.
const stashEsm = (text, stash) => {
  let out = "";
  let cursor = 0;
  const pattern = /^(?:import|export)\s/gmu;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const end = statementEnd(text, match.index);
    out += text.slice(cursor, match.index);
    out += `${CODE_MARK}${stash.push(text.slice(match.index, end)) - 1}${CODE_MARK}`;
    cursor = end;
    pattern.lastIndex = end;
  }
  return out + text.slice(cursor);
};

// A code block's placeholder keeps the block's indentation, so a JSX child
// block around it dedents as one.
const stashCode = (segments, stash) =>
  segments
    .map((segment) => {
      const text = segment.lines.join("\n");
      if (!segment.code) {
        return text;
      }
      const [indent] = text.match(/^[ \t]*/u);
      return `${indent}${CODE_MARK}${stash.push(text.slice(indent.length)) - 1}${CODE_MARK}`;
    })
    .join("\n");

// --- Spec descriptions -------------------------------------------------------

// ReadMe renders its own Markdown in spec descriptions too: callouts, emoji
// shortcodes, and doc:/ref: links. Nothing else is touched.
const convertDescription = (value, file, context) => {
  const code = [];
  let out = stashCode(
    segmentBody(
      mapProse(value, (text) => convertBlockquoteCallouts(text, file))
    ),
    code
  );
  out = convertCalloutComponents(out, code);
  out = convertShortcodes(out, file);
  out = rewriteLinks(out, file, context.rewrite);
  return stripSpacers(restore(out, CODE_PLACEHOLDER, code));
};

// --- Page body ----------------------------------------------------------------

const convertCustomSnippets = (text, context) =>
  text.replaceAll(
    /^(?<indent>[ \t]*)<(?<name>[A-Z]\w*)\s*\/>[ \t]*$/gmu,
    byGroups(({ indent, name }, all) => {
      const snippet = context.snippets.get(name);
      if (!snippet) {
        return all;
      }
      count("reusable content → <include>");
      return `${indent}<include>/_snippets/${snippet}.mdx</include>`;
    })
  );

// A body H1 that repeats the title goes; any other H1 means the page used
// H1s for sections, so every body heading moves down a level.
const fixHeadings = (text, title) => {
  let out = text;
  const first = /^\s*#\s+(?<heading>.+?)\s*#*\s*(?:\n|$)/u.exec(out);
  const titleText = textOf(title)?.toLowerCase();
  if (
    first &&
    titleText &&
    first.groups.heading.replaceAll(/[*_`]/gu, "").trim().toLowerCase() ===
      titleText
  ) {
    out = out.slice(first[0].length);
    count("duplicate H1 removed");
  }
  if (/^[ \t]*#[ \t]/mu.test(out)) {
    out = out.replaceAll(
      /^(?<indent>[ \t]*)(?<marks>#{1,5})(?=[ \t])/gmu,
      "$<indent>#$<marks>"
    );
    count("body headings demoted one level (the page used H1s)");
  }
  return out;
};

const commentCount = (text) => (text.match(/<!--[\s\S]*?-->/gu) ?? []).length;

// A comment on lines of its own goes with its lines; one inside a line leaves
// a space if it stood between words. Removing one can join the text around it
// into another (`<!-<!-- x -->-`), so this repeats until none is left.
const dropComments = (text) => {
  let out = text;
  let comments = commentCount(out);
  while (comments > 0) {
    count("HTML comment deleted", comments);
    out = out
      .replaceAll(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*(?:\n|$)/gmu, "")
      .replaceAll(/[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*/gu, (comment) =>
        /^[ \t]|[ \t]$/u.test(comment) ? " " : ""
      );
    comments = commentCount(out);
  }
  return out;
};

const selfCloseVoidTags = (text) =>
  text.replaceAll(
    VOID_TAGS,
    byGroups(({ rest, tag }) => {
      count(`<${tag}> self-closed`);
      return `<${tag}${rest} />`;
    })
  );

const convertBody = (body, file, context, title) => {
  const code = [];
  // Magic blocks and emoji callouts first, outside code: both can turn into
  // fenced code, which is then set aside with the rest.
  const prose = mapProse(
    mapProse(body, (text) => convertMagicBlocks(text, file)),
    (text) => convertBlockquoteCallouts(text, file)
  );
  const segments = groupAdjacentFences(segmentBody(prose), file);
  let text = stashCode(segments, code);
  const hasEsm = /^(?:import|export)\s/mu.test(text);
  text = unwrapHtmlBlocks(stashEsm(text, code), file);
  const spans = [];
  text = dropComments(stashSpans(text, spans));
  text = convertCalloutComponents(text, code);
  text = convertComponents(text, file, { ...context, spans });
  text = selfCloseVoidTags(text);
  text = convertShortcodes(text, file);
  text = rewriteLinks(text, file, context.rewrite);
  text = convertCustomSnippets(text, context);
  reportJudgment(text, file, { ...context, hasEsm });
  text = fixHeadings(text, title);
  text = restore(
    restore(text, SPAN_PLACEHOLDER, spans),
    CODE_PLACEHOLDER,
    code
  );
  if (code.some((block) => /<<[A-Za-z_][\w-]*>>/u.test(block))) {
    note(
      file,
      "a <<variable>> inside a code block was left as is; ReadMe filled it per reader"
    );
  }
  return text.replaceAll(/\n{3,}/gu, "\n\n").replace(/^\n+/u, "");
};

// --- Frontmatter --------------------------------------------------------------

const ordered = (fields) => {
  const out = {};
  for (const key of KEY_ORDER) {
    if (fields.has(key)) {
      out[key] = fields.get(key);
    }
  }
  for (const [key, value] of fields) {
    if (!(key in out) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
};

// A frontmatter map the mapping consumes key by key.
const createSource = (data) => {
  const source = new Map(Object.entries(recordOf(data)));
  const take = (key) => {
    const value = source.get(key);
    source.delete(key);
    return value;
  };
  return { source, take };
};

const merge = (fields, key, value) => {
  fields.set(key, { ...recordOf(fields.get(key)), ...value });
};

const mapChangelog = ({ take }, fields, file) => {
  fields.set("type", "changelog");
  const kind = textOf(take("type"));
  if (kind !== undefined && CHANGELOG_TYPES.has(kind.toLowerCase())) {
    if (kind.toLowerCase() !== "none") {
      const category = `${kind[0].toUpperCase()}${kind.slice(1).toLowerCase()}`;
      merge(fields, "changelog", { category });
    }
  } else if (kind !== undefined && kind !== "changelog") {
    note(file, `changelog type "${kind}" dropped`);
  }
  const date =
    textOf(take("date")) ??
    textOf(take("published_at")) ??
    textOf(take("created_at"));
  if (date === undefined) {
    note(file, "changelog entry without a date: take it from the live entry");
  } else {
    fields.set("date", date.slice(0, 10));
  }
  const author = take("author") ?? take("authors");
  if (Array.isArray(author) || textOf(author) !== undefined) {
    fields.set("authors", author);
  } else if (isRecord(author)) {
    note(file, "changelog author is an ID object; dropped");
  }
  const existing = take("changelog");
  if (isRecord(existing)) {
    merge(fields, "changelog", existing);
  }
};

const mapVisibility = ({ take }, fields, info, data) => {
  const hidden = take("hidden");
  if (
    hidden !== undefined &&
    hidden !== null &&
    hidden !== true &&
    hidden !== false
  ) {
    info.notes.push(
      `hidden: ${JSON.stringify(hidden)} isn't true or false: dropped; set hidden: true if the page was hidden`
    );
  }
  const privacy = recordOf(take("privacy"));
  const unlisted = hidden === true || privacy.view === "anyone_with_link";
  if (info.section === "page") {
    // rdme@10 writes a custom page's flag as appearance.fullscreen.
    const fullscreen =
      take("fullscreen") ?? recordOf(data.appearance).fullscreen;
    const mode = textOf(take("mode")) ?? textOf(data.mode);
    fields.set("hidden", true);
    fields.set("mode", fullscreen === true ? "custom" : (mode ?? "center"));
    count("custom page → hidden + mode");
  } else if (unlisted) {
    fields.set("hidden", true);
    if (info.section !== "changelog") {
      merge(fields, "search", { exclude: true });
    }
    count("hidden → hidden (+ search.exclude)");
  }
  if (hidden === true && info.legacyRdme) {
    info.notes.push(
      "hidden: true in rdme ≤ 9 frontmatter: check the live URL, and use draft: true if it 404s"
    );
  }
  const deprecated = take("deprecated");
  if (deprecated === true || take("state") === "deprecated") {
    fields.set("deprecated", true);
  }
  if (take("allow_crawlers") === "disabled") {
    fields.set("noindex", true);
  }
};

const mapMetadata = ({ take }, fields, info) => {
  const metadata = recordOf(take("metadata"));
  const seo = {};
  for (const key of ["title", "description"]) {
    if (textOf(metadata[key]) !== undefined) {
      seo[key] = textOf(metadata[key]);
    }
  }
  const image = textOf(metadata.image) ?? textOf(recordOf(metadata.image).url);
  if (image !== undefined) {
    seo.image = image;
  } else if (isRecord(metadata.image)) {
    // rdme@10 writes `{ uri: "/images/<id>" }`, an id rather than a URL.
    info.notes.push(
      "metadata.image has no URL (an rdme image id?): set seo.image by hand"
    );
  }
  if (Object.keys(seo).length > 0) {
    merge(fields, "seo", seo);
    count("metadata → seo");
  }
  const keywords = Array.isArray(metadata.keywords)
    ? metadata.keywords.map((keyword) => textOf(keyword)).filter(Boolean)
    : (textOf(metadata.keywords) ?? "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
  if (keywords.length > 0) {
    merge(fields, "search", { keywords });
    count("metadata.keywords → search.keywords");
  }
  if (metadata.robots === "noindex") {
    fields.set("noindex", true);
  }
};

const relatedEntry = (entry, context, notes) => {
  const page = recordOf(entry);
  const url = textOf(page.url);
  if (page.type === "link" && url !== undefined) {
    const title = textOf(page.title);
    return title ? { [title]: url } : url;
  }
  const prefix = NEXT_PREFIX[page.type];
  const slug = textOf(page.slug);
  if (prefix === undefined || slug === undefined) {
    return;
  }
  const target = `${prefix}${slug}`;
  if (context.knownUrls && !context.knownUrls.has(target)) {
    notes.push(`next.pages entry ${target} dropped: no such page in this repo`);
    return;
  }
  return target;
};

const mapNext = ({ take }, fields, info, context) => {
  const content = recordOf(take("content"));
  const description = textOf(take("excerpt")) ?? textOf(take("description"));
  const excerpt = description ?? textOf(content.excerpt);
  if (excerpt !== undefined) {
    fields.set("description", excerpt);
  }
  const next = recordOf(take("next") ?? content.next);
  const related = listOf(next.pages)
    .map((entry) => relatedEntry(entry, context, info.notes))
    .filter((entry) => entry !== undefined);
  if (related.length > 0) {
    // Blume's schema takes at most 10 related pages.
    fields.set("related", related.slice(0, 10));
    count("next.pages → related");
    if (related.length > 10) {
      info.notes.push(
        `related keeps the first 10 of ${related.length} next.pages entries (Blume's limit)`
      );
    }
  }
  const link = recordOf(take("link") ?? content.link);
  info.linkUrl = textOf(link.url);
};

const mapRest = ({ source, take }, fields, info) => {
  const appearance = recordOf(take("appearance"));
  const icon = lucideFor(
    take("icon") ?? recordOf(appearance.icon).name,
    info.file
  );
  if (icon) {
    fields.set("icon", icon);
  }
  if (take("table_of_contents") === false) {
    if (!fields.has("mode")) {
      fields.set("mode", "wide");
    }
    info.notes.push("table_of_contents: false approximated with mode: wide");
  }
  const recipes = listOf(take("recipes"));
  if (recipes.length > 0) {
    info.notes.push(`related recipes dropped: ${recipes.join(", ")}`);
  }
  for (const key of ["recipe", "x-import", "x_import", "api_config", "name"]) {
    take(key);
  }
  if (isRecord(source.get("api")) || source.get("api") === null) {
    take("api");
  }
  if (info.section !== "changelog") {
    const kind = textOf(take("type"));
    if (
      kind !== undefined &&
      !["basic", "link", "error", "endpoint", "webhook", "api_config"].includes(
        kind
      )
    ) {
      fields.set("type", kind);
    }
  }
  for (const key of NAV_KEYS) {
    if (source.has(key)) {
      info.notes.push(
        `${key}: rdme-upload navigation key left in place: rebuild the tree (see the reference), then remove it`
      );
    }
  }
};

const passThrough = (source, fields, info) => {
  for (const [key, value] of source) {
    if (!fields.has(key)) {
      fields.set(key, value);
      if (!BLUME_KEYS.has(key) && !NAV_KEYS.includes(key)) {
        info.notes.push(
          `frontmatter key "${key}" kept as is: Blume rejects unknown keys`
        );
      }
    } else if (isRecord(value) && isRecord(fields.get(key))) {
      fields.set(key, { ...value, ...fields.get(key) });
    }
  }
};

const mapFrontmatter = (data, info, context) => {
  const reader = createSource(data);
  const fields = new Map();
  const title = reader.take("title");
  if (title !== undefined) {
    fields.set("title", title);
  }
  if (info.section === "changelog") {
    mapChangelog(reader, fields, info.file);
  }
  mapNext(reader, fields, info, context);
  mapVisibility(reader, fields, info, data);
  mapMetadata(reader, fields, info);
  mapRest(reader, fields, info);
  if (info.slug) {
    fields.set("slug", info.slug);
  }
  passThrough(reader.source, fields, info);
  for (const message of info.notes) {
    note(info.file, message);
  }
  return ordered(fields);
};

// --- Project: reading -----------------------------------------------------------

// ReadMe's flat URL for a page, from its path in the synced repo.
const readmeUrl = (section, parts, stem) => {
  const real = parts.filter((part) => !isGroup(part));
  const slug = stem === "index" ? real.at(-1) : stem;
  return `${URL_PREFIX[section]}${slug}`;
};

const isSyncLayout = (root) =>
  existsSync(path.join(root, INVENTORY)) ||
  ["docs", "reference", "recipes", "custom_pages", "page"].some((dir) =>
    existsSync(path.join(root, dir, "_order.yaml"))
  ) ||
  walk(path.join(root, "docs")).some((file) => file.endsWith("_order.yaml"));

const loadSpecs = (root) => {
  const specs = new Map();
  const dir = path.join(root, "reference");
  for (const file of walk(dir).filter((entry) => path.dirname(entry) === dir)) {
    const name = path.basename(file);
    if (/\.json$/iu.test(name)) {
      try {
        specs.set(name, {
          data: JSON.parse(readFileSync(file, "utf-8")),
          file,
        });
      } catch {
        specs.set(name, { data: null, file });
      }
    } else if (
      /\.ya?ml$/iu.test(name) &&
      /^(?:openapi|swagger):/mu.test(readFileSync(file, "utf-8"))
    ) {
      specs.set(name, { data: null, file, yaml: true });
    }
  }
  return specs;
};

const findOperation = (items, operationId) => {
  for (const [route, item] of Object.entries(recordOf(items))) {
    for (const [method, operation] of Object.entries(recordOf(item))) {
      if (recordOf(operation).operationId === operationId) {
        return {
          method: method.toUpperCase(),
          path: route,
          tag: textOf(listOf(operation.tags)[0]) ?? null,
        };
      }
    }
  }
};

const operationOf = (spec, operationId) => {
  if (!spec?.data) {
    return;
  }
  return (
    findOperation(spec.data.paths, operationId) ??
    findOperation(spec.data.webhooks ?? spec.data["x-webhooks"], operationId)
  );
};

// --glossary takes JSON, or a saved page of the hub, whose embedded settings
// carry the glossary as "glossaryTerms": [{ "term", "definition" }].
const bracketEnd = (text, from) => {
  let depth = 0;
  let quoted = false;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === "\\") {
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === "[") {
      depth += 1;
    } else if (!quoted && char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
};

const readGlossary = (file) => {
  const content = readFileSync(file, "utf-8");
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('"glossaryTerms":');
    const from = start === -1 ? -1 : content.indexOf("[", start);
    const end = from === -1 ? -1 : bracketEnd(content, from);
    if (end === -1) {
      throw new Error(
        `${file} is neither JSON nor a hub page with glossaryTerms`
      );
    }
    return JSON.parse(content.slice(from, end + 1));
  }
};

const loadGlossary = (file) => {
  const glossary = new Map();
  if (!file) {
    return glossary;
  }
  const raw = readGlossary(file);
  const entries = Array.isArray(raw)
    ? raw.map((entry) => [recordOf(entry).term, recordOf(entry).definition])
    : Object.entries(recordOf(raw));
  for (const [term, definition] of entries) {
    if (textOf(term) !== undefined && textOf(definition) !== undefined) {
      glossary.set(textOf(term).toLowerCase(), textOf(definition));
    }
  }
  return glossary;
};

const loadBlocks = (root) => {
  const snippets = new Map();
  const components = new Set();
  for (const file of walk(path.join(root, "custom_blocks"))) {
    const name = path.basename(file).replace(/\.mdx?$/u, "");
    if (file.endsWith(".mdx")) {
      components.add(name);
    } else if (file.endsWith(".md")) {
      snippets.set(
        name,
        name
          .replaceAll(
            /(?<lower>[a-z0-9])(?<upper>[A-Z])/gu,
            "$<lower>-$<upper>"
          )
          .toLowerCase()
      );
    }
  }
  return { components, snippets };
};

const readPage = (root, dir, file) => {
  const relative = path.relative(path.join(root, dir), file).split(path.sep);
  // A byte order mark would hide the frontmatter; it goes.
  const raw = readFileSync(file, "utf-8").replace(/^\uFEFF/u, "");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const source = raw.replaceAll("\r\n", "\n");
  const { body, raw: frontmatter } = splitFrontmatter(source);
  const page = {
    body,
    data: {},
    dir,
    eol,
    file,
    fm: frontmatter,
    parseError: null,
    parts: relative.slice(0, -1),
    section: SECTIONS[dir],
    source,
    stem: path.basename(file).replace(/\.(?:mdx?|html)$/u, ""),
  };
  if (frontmatter !== null) {
    try {
      page.data = recordOf(parseYaml(frontmatter));
    } catch (error) {
      page.parseError = error.message;
    }
  }
  return page;
};

const readPages = (root, sectionDirs) => {
  const pages = [];
  for (const dir of sectionDirs) {
    for (const file of walk(path.join(root, dir))) {
      if (/\.(?:mdx?|html)$/u.test(file)) {
        pages.push(readPage(root, dir, file));
      }
    }
  }
  return pages;
};

const isEndpoint = (page) =>
  textOf(recordOf(page.data.api).operationId) !== undefined;

const tagFolderOf = (page) =>
  page.parts.length > 0 ? path.join(page.dir, ...page.parts) : null;

// --- Project: state ---------------------------------------------------------------

const createProject = (root, options) => {
  const syncLayout = isSyncLayout(root);
  const inventory = readJson(path.join(root, INVENTORY), {
    endpoints: [],
    redirects: [],
    referenceOrder: [],
    tagFolders: [],
    urls: [],
  });
  const redirects = new Map(
    readJson(path.join(root, REDIRECTS), []).map((entry) => [entry.from, entry])
  );
  const sectionDirs = Object.keys(SECTIONS).filter((dir) =>
    existsSync(path.join(root, dir))
  );
  const blocks = loadBlocks(root);
  const project = {
    deletes: new Set(),
    handled: new Set(),
    inventory,
    knownUrls: new Set(inventory.urls.map((entry) => entry.url)),
    options,
    pages: readPages(root, sectionDirs),
    redirects,
    root,
    sectionDirs,
    specs: loadSpecs(root),
    syncLayout,
    writes: new Map(),
  };
  project.context = {
    customComponents: blocks.components,
    glossary: loadGlossary(options.glossary),
    knownUrls: syncLayout ? project.knownUrls : null,
    snippets: blocks.snippets,
    variables: new Set(),
  };
  project.context.rewrite = createLinkRewriter({
    knownUrls: project.context.knownUrls,
    sites: options.sites,
  });
  return project;
};

const addRedirect = (project, from, to, status) => {
  if (from !== to && !project.redirects.has(from)) {
    project.redirects.set(from, status ? { from, status, to } : { from, to });
  }
};

const setKind = (project, url, kind) => {
  const entry = project.inventory.urls.find(
    (candidate) => candidate.url === url
  );
  if (entry) {
    entry.kind = kind;
  }
};

const drop = (project, page, kind) => {
  project.deletes.add(page.file);
  project.handled.add(page.file);
  if (kind) {
    setKind(project, page.url, kind);
  }
};

const recordUrls = (project) => {
  for (const page of project.pages) {
    if (!project.syncLayout || page.parseError) {
      continue;
    }
    page.url = readmeUrl(page.section, page.parts, page.stem);
    if (!project.knownUrls.has(page.url)) {
      project.knownUrls.add(page.url);
      project.inventory.urls.push({
        hidden: page.data.hidden === true || undefined,
        kind: isEndpoint(page) ? "endpoint" : "page",
        url: page.url,
      });
    }
  }
};

// --- Project: the API reference ---------------------------------------------------

const proseOf = (project, page, title) =>
  stripSpacers(
    convertBody(
      page.body,
      path.relative(project.root, page.file),
      project.context,
      title
    )
  );

const recordEndpoint = (project, page) => {
  const relative = path.relative(project.root, page.file);
  const api = recordOf(page.data.api);
  const specName = path.basename(String(api.file ?? ""));
  const operationId = textOf(api.operationId);
  const spec = project.specs.get(specName);
  const found = operationOf(spec, operationId);
  if (!spec) {
    note(
      relative,
      `endpoint page names ${specName}, which isn't in reference/`
    );
  } else if (spec.yaml) {
    note(
      relative,
      `${specName} is YAML: convert it to JSON so the redirect and order steps can read it`
    );
  } else if (!found) {
    note(relative, `operationId ${operationId} isn't in ${specName}`);
  }
  const order =
    readOrder(
      path.join(project.root, tagFolderOf(page) ?? "reference", "_order.yaml")
    ) ?? [];
  const prose = proseOf(project, page);
  if (/<[A-Za-z]/u.test(prose)) {
    note(
      relative,
      "endpoint prose holds JSX or HTML, which the operation description escapes: rewrite it as Markdown in the overlay"
    );
  }
  if (page.data.hidden === true) {
    note(
      relative,
      "hidden endpoint: ReadMe hid this operation; remove it with an overlay (remove: true) if it should stay hidden"
    );
  }
  if (!project.inventory.endpoints.some((entry) => entry.oldUrl === page.url)) {
    project.inventory.endpoints.push({
      category: page.parts[0] ?? null,
      folder: page.parts.at(-1) ?? null,
      method: found?.method ?? null,
      oldUrl: page.url,
      operationId,
      path: found?.path ?? null,
      position: order.indexOf(page.stem),
      prose,
      spec: specName,
      tag: found?.tag ?? null,
    });
  }
  drop(project, page);
  count("endpoint page deleted (generated from the spec)");
};

const recordTagPage = (project, page) => {
  const folder = tagFolderOf(page);
  const prose = proseOf(project, page, page.data.title);
  const order = readOrder(path.join(project.root, folder, "_order.yaml")) ?? [];
  const categoryOrder =
    readOrder(path.join(project.root, path.dirname(folder), "_order.yaml")) ??
    [];
  if (
    !project.inventory.tagFolders.some((entry) => entry.oldUrl === page.url)
  ) {
    project.inventory.tagFolders.push({
      category: page.parts.length > 1 ? page.parts[0] : null,
      endpoints: order,
      oldUrl: page.url,
      position: categoryOrder.indexOf(page.parts.at(-1)),
      prose,
      title: textOf(page.data.title) ?? null,
    });
  }
  drop(project, page, "tag");
  count("tag page deleted");
};

const recordConfigPage = (project, page) => {
  const relative = path.relative(project.root, page.file);
  const kind = page.data.api_config;
  if (proseOf(project, page, page.data.title) === "") {
    drop(project, page, "config");
    todo(
      `${page.url} (ReadMe's ${kind} page) had no prose and was deleted: redirect it to the closest page`
    );
    count("API config page deleted (empty)");
  } else {
    page.moveTo = path.join(project.root, "reference", `${page.stem}.mdx`);
    note(
      relative,
      `ReadMe's ${kind} page: kept as a plain page; its personalized API key widget has no equivalent`
    );
  }
};

const classifyReference = (project) => {
  const reference = project.pages.filter(
    (page) => page.dir === "reference" && !page.parseError
  );
  if (!project.syncLayout || reference.length === 0) {
    return;
  }
  const order = readOrder(path.join(project.root, "reference", "_order.yaml"));
  if (order && project.inventory.referenceOrder.length === 0) {
    project.inventory.referenceOrder = order;
  }
  const endpointFolders = new Set(
    reference.filter(isEndpoint).map(tagFolderOf)
  );
  for (const page of reference.filter(isEndpoint)) {
    recordEndpoint(project, page);
  }
  for (const page of reference) {
    if (page.stem === "index" && endpointFolders.has(tagFolderOf(page))) {
      recordTagPage(project, page);
    } else if (page.data.api_config && !project.handled.has(page.file)) {
      recordConfigPage(project, page);
    }
  }
};

// --- Project: empty parents and section roots ------------------------------------

const firstPageIn = (project, folder) => {
  const order = readOrder(path.join(folder, "_order.yaml")) ?? [];
  const live = project.pages.filter((page) => !project.handled.has(page.file));
  for (const entry of order) {
    const page = live.find(
      (candidate) =>
        path.dirname(candidate.file) === folder && candidate.stem === entry
    );
    if (page) {
      return page.url;
    }
    const sub = path.join(folder, entry);
    if (existsSync(sub)) {
      const index = live.find(
        (candidate) =>
          path.dirname(candidate.file) === sub &&
          candidate.stem === "index" &&
          candidate.body.trim() !== ""
      );
      return index?.url ?? firstPageIn(project, sub);
    }
  }
};

const isEmptyParent = (project, page) => {
  if (
    project.handled.has(page.file) ||
    page.stem !== "index" ||
    page.parseError ||
    page.section === "changelog" ||
    page.body.trim() !== "" ||
    page.parts.length === 0 ||
    isGroup(page.parts.at(-1))
  ) {
    return false;
  }
  const categorized = page.section === "docs" || page.section === "reference";
  const folder = path.dirname(page.file);
  return (
    page.parts.length > (categorized ? 1 : 0) &&
    project.pages.some(
      (other) => other !== page && other.file.startsWith(folder + path.sep)
    )
  );
};

// ReadMe answers an empty parent page's URL with a 302 to its first child.
const removeEmptyParents = (project) => {
  if (!project.syncLayout) {
    return;
  }
  for (const page of project.pages.filter((entry) =>
    isEmptyParent(project, entry)
  )) {
    const target = firstPageIn(project, path.dirname(page.file));
    drop(project, page, "parent");
    page.emptyParentTitle = textOf(page.data.title);
    if (target) {
      addRedirect(project, page.url, target, 302);
    } else {
      todo(
        `${page.url}: empty parent page deleted, but its first child couldn't be found; add a redirect`
      );
    }
    count("empty parent page deleted (302 to its first child)");
  }
};

// ReadMe answers /docs and /reference with a 301 to the section's first page;
// these are 302s, since that first page can change.
const addSectionRedirects = (project) => {
  if (!project.syncLayout) {
    return;
  }
  const docs = path.join(project.root, "docs");
  const docsTarget = existsSync(docs) ? firstPageIn(project, docs) : undefined;
  if (docsTarget) {
    addRedirect(project, "/docs", docsTarget, 302);
  }
  const [firstCategory] = project.inventory.referenceOrder;
  const referenceTarget = firstCategory
    ? firstPageIn(project, path.join(project.root, "reference", firstCategory))
    : undefined;
  if (referenceTarget) {
    addRedirect(project, "/reference", referenceTarget, 302);
  }
  if (
    existsSync(path.join(project.root, "changelogs")) ||
    existsSync(path.join(project.root, "changelog"))
  ) {
    addRedirect(project, "/changelog.rss", "/changelog/rss.xml");
  }
  todo(
    "/ : ReadMe sent it to the landing page or the first section; add an index.mdx or a redirect"
  );
};

// --- Project: pages -----------------------------------------------------------------

const destination = (project, absolute) => {
  const [top, ...rest] = path.relative(project.root, absolute).split(path.sep);
  const section = project.syncLayout ? (SECTIONS[top] ?? top) : top;
  const categorized = section === "docs" || section === "reference";
  if (
    project.syncLayout &&
    categorized &&
    rest.length > 1 &&
    !isGroup(rest[0])
  ) {
    rest[0] = `(${rest[0]})`;
  }
  return path.join(project.root, section, ...rest);
};

// Pin `slug` when Blume's own route would differ from ReadMe's URL: groups add
// nothing, `index` is its folder, and a leading digit can be read as an
// ordering prefix (`1-setup`). Blume keeps dates (`12-05-2022`, `2024-01`)
// and versions whole, so pinning every digit-led segment is only cautious.
const slugPin = (project, page) => {
  if (!project.syncLayout || !page.url || page.moveTo) {
    return;
  }
  const categorized = page.section === "docs" || page.section === "reference";
  const nested = categorized ? page.parts.slice(1) : page.parts;
  const segments = [
    ...nested.filter((part) => !isGroup(part)),
    page.stem === "index" ? null : page.stem,
  ].filter(Boolean);
  const route = `/${[page.section, ...segments].join("/")}`;
  const digitLed = segments.some((segment) => /^\d/u.test(segment));
  return route !== page.url || digitLed ? page.url.slice(1) : undefined;
};

const pageOutput = (project, page, front, relative) => {
  const body = convertBody(page.body, relative, project.context, front.title);
  const header =
    Object.keys(front).length > 0 ? `---\n${emitYaml(front)}\n---\n\n` : "";
  const output = `${header}${body.trimEnd()}\n`;
  return page.eol === "\r\n" ? output.replaceAll("\n", "\r\n") : output;
};

const convertPage = (project, page) => {
  const relative = path.relative(project.root, page.file);
  if (page.file.endsWith(".html")) {
    note(
      relative,
      "HTML custom page: rebuild it as page/<slug>.mdx (HTML as JSX) or pages/page/<slug>.astro"
    );
    todo(`${relative}: HTML custom page left for you`);
    return;
  }
  if (page.parseError) {
    note(
      relative,
      `frontmatter not converted (${page.parseError}); the file was left as is`
    );
    todo(`${relative}: convert by hand (frontmatter didn't parse)`);
    return;
  }
  const info = {
    file: relative,
    legacyRdme:
      "parentDoc" in page.data ||
      /^[0-9a-f]{24}$/u.test(textOf(page.data.category) ?? ""),
    notes: [],
    section: page.section,
    slug: slugPin(project, page),
  };
  const front = mapFrontmatter(page.data, info, project.context);
  if (info.linkUrl && page.url) {
    addRedirect(project, page.url, info.linkUrl, 302);
    drop(project, page, "link");
    todo(
      `${page.url} was a link page: it now redirects to ${info.linkUrl}; add it to navigation.featured if it should stay in the sidebar`
    );
    count("link page → redirect");
    return;
  }
  if (info.linkUrl) {
    note(
      relative,
      `link page to ${info.linkUrl}: delete it and redirect its URL there`
    );
  }
  const target =
    page.moveTo ?? destination(project, page.file).replace(/\.md$/u, ".mdx");
  if (target !== page.file && existsSync(target)) {
    note(
      relative,
      `${path.relative(project.root, target)} already exists; left both in place`
    );
    return;
  }
  const output = pageOutput(project, page, front, relative);
  if (target !== page.file) {
    project.deletes.add(page.file);
    count(page.file.endsWith(".md") ? ".md → .mdx" : "file moved");
  }
  if (
    output !== page.source.replaceAll("\n", page.eol) ||
    target !== page.file
  ) {
    project.writes.set(target, output);
  }
};

const convertSnippetFiles = (project) => {
  for (const file of walk(path.join(project.root, "custom_blocks"))) {
    if (!file.endsWith(".md")) {
      continue;
    }
    const name = path.basename(file, ".md");
    const target = path.join(
      project.root,
      "_snippets",
      `${project.context.snippets.get(name)}.mdx`
    );
    if (existsSync(target)) {
      continue;
    }
    const { body } = splitFrontmatter(
      readFileSync(file, "utf-8").replaceAll("\r\n", "\n")
    );
    const converted = convertBody(
      body,
      path.relative(project.root, file),
      project.context
    );
    project.writes.set(target, `${converted.trimEnd()}\n`);
    count("reusable content → _snippets/");
  }
  for (const name of [...project.context.customComponents].toSorted()) {
    todo(
      `custom_blocks/${name}.mdx is a React component: move it to islands/${name}.tsx (export default) or replace its uses`
    );
  }
};

// --- Project: _order.yaml → meta.ts -------------------------------------------------

const orderFiles = (project) =>
  project.sectionDirs.flatMap((dir) =>
    walk(path.join(project.root, dir))
      .filter((file) => path.basename(file) === "_order.yaml")
      .map((file) => ({ dir, file }))
  );

const metaFields = (project, dir, folder, remaining, order) => {
  const fields = {};
  const section = SECTIONS[dir];
  const parts = path
    .relative(path.join(project.root, dir), folder)
    .split(path.sep)
    .filter(Boolean);
  const isCategory =
    (section === "docs" || section === "reference") && parts.length === 1;
  const index = project.pages.find(
    (page) => path.dirname(page.file) === folder && page.stem === "index"
  );
  if (!isCategory && parts.length > 0 && index) {
    const title = index.emptyParentTitle ?? textOf(index.data.title);
    if (title) {
      fields.title = title;
    }
    fields.display = "group";
  }
  // Blume labels a group folder by its name, capitalized and with `-` and `_`
  // read as spaces: keep the category's own spelling where that differs.
  const [category] = parts;
  if (isCategory && /^\p{Ll}|[-_]|^\d+\./u.test(category)) {
    fields.title = category;
  }
  if (section === "reference" && isCategory) {
    const position = project.inventory.referenceOrder.indexOf(parts[0]);
    if (position !== -1) {
      fields.order = position;
    }
  }
  fields.pages = order.filter((entry) =>
    remaining.some((page) => {
      const [first] = path.relative(folder, page.file).split(path.sep);
      return first === entry || first.replace(/\.mdx?$/u, "") === entry;
    })
  );
  return fields;
};

const writeMeta = (project, { dir, file }) => {
  if (project.deletes.has(file)) {
    return;
  }
  const folder = path.dirname(file);
  const section = SECTIONS[dir];
  let order;
  try {
    order = readOrder(file);
  } catch (error) {
    todo(
      `${path.relative(project.root, file)} didn't parse (${error.message}); write its meta.ts by hand`
    );
    return;
  }
  project.deletes.add(file);
  if (
    section === "page" ||
    (section === "reference" && folder === path.join(project.root, dir))
  ) {
    count("_order.yaml with no sidebar to order, deleted");
    return;
  }
  const remaining = project.pages.filter(
    (page) =>
      !project.handled.has(page.file) && page.file.startsWith(folder + path.sep)
  );
  if (remaining.length === 0) {
    return;
  }
  const target = path.join(
    destination(project, path.join(folder, "x")).replace(/[/\\]x$/u, ""),
    "meta.ts"
  );
  if (existsSync(target)) {
    note(
      path.relative(project.root, file),
      `${path.relative(project.root, target)} already exists; merge the order by hand`
    );
    return;
  }
  project.writes.set(
    target,
    metaModule(metaFields(project, dir, folder, remaining, order))
  );
  count("_order.yaml → meta.ts");
};

// --- Project: overlays ----------------------------------------------------------------

const operationActions = (project, name, spec, describe) => {
  const actions = [];
  for (const [route, item] of Object.entries(recordOf(spec.data.paths))) {
    for (const [method, raw] of Object.entries(recordOf(item))) {
      const operation = recordOf(raw);
      if (!("responses" in operation || "operationId" in operation)) {
        continue;
      }
      const original = textOf(operation.description) ?? "";
      const converted = original === "" ? "" : describe(original);
      const prose = project.inventory.endpoints.find(
        (entry) =>
          entry.spec === name &&
          entry.operationId === operation.operationId &&
          entry.prose
      )?.prose;
      if (converted === original && !prose) {
        continue;
      }
      const reasons = [
        converted !== original && "ReadMe callouts as directives",
        prose && "the ReadMe endpoint page's prose",
      ].filter(Boolean);
      actions.push({
        description: `${reasons.join("; ")} (${operation.operationId ?? `${method.toUpperCase()} ${route}`})`,
        target: `$.paths['${route.replaceAll("'", String.raw`\'`)}'].${method}`,
        update: {
          description: [converted, prose].filter(Boolean).join("\n\n"),
        },
      });
    }
  }
  return actions;
};

const tagActions = (project, name, spec, describe) => {
  const actions = [];
  for (const [position, raw] of listOf(spec.data.tags).entries()) {
    const tag = recordOf(raw);
    const original = textOf(tag.description) ?? "";
    const converted = original === "" ? "" : describe(original);
    const prose = project.inventory.tagFolders.find(
      (entry) =>
        entry.prose &&
        project.inventory.endpoints.some(
          (endpoint) =>
            endpoint.spec === name &&
            endpoint.tag === tag.name &&
            endpoint.folder === entry.oldUrl.split("/").pop()
        )
    )?.prose;
    if (converted !== original || prose) {
      actions.push({
        description: `tag ${tag.name}`,
        target: `$.tags[${position}]`,
        update: {
          description: [converted, prose].filter(Boolean).join("\n\n"),
        },
      });
    }
  }
  return actions;
};

const writeOverlays = (project) => {
  for (const [name, spec] of [...project.specs.entries()].toSorted()) {
    if (spec.yaml) {
      todo(
        `reference/${name} is YAML: the overlay, redirect, and order steps read JSON only; convert it (npx @redocly/cli bundle reference/${name} --output reference/${name.replace(/\.ya?ml$/iu, ".json")}) and rerun`
      );
    }
    if (!spec.data) {
      continue;
    }
    const specFile = `reference/${name}`;
    const describe = (value) =>
      convertDescription(value, specFile, project.context);
    const actions = [
      ...operationActions(project, name, spec, describe),
      ...tagActions(project, name, spec, describe),
    ];
    const info = textOf(recordOf(spec.data.info).description);
    if (info !== undefined && describe(info) !== info) {
      actions.push({
        description: "info",
        target: "$.info",
        update: { description: describe(info) },
      });
    }
    if (actions.length === 0) {
      continue;
    }
    const overlay = `reference/overlays/${name.replace(/\.json$/iu, "")}.overlay.json`;
    project.writes.set(
      path.join(project.root, overlay),
      `${JSON.stringify({ actions, info: { title: `ReadMe migration (${name})`, version: "1.0.0" }, overlay: "1.0.0" }, null, 2)}\n`
    );
    count("overlay actions", actions.length);
    todo(`add the overlay to that spec's source: overlays: ["./${overlay}"]`);
  }
};

const reportProject = (project) => {
  const specsByCategory = new Map();
  for (const endpoint of project.inventory.endpoints) {
    const set = specsByCategory.get(endpoint.category) ?? new Set();
    set.add(endpoint.spec);
    specsByCategory.set(endpoint.category, set);
  }
  for (const [category, set] of specsByCategory) {
    if (set.size > 1) {
      todo(
        `reference category "${category}" held ${set.size} specs (${[...set].toSorted().join(", ")}): give each its own label or route; they can't share one`
      );
    }
  }
  if (project.context.variables.size > 0) {
    todo(
      `define these in blume.config.ts variables (defaults from the hub): ${[...project.context.variables].toSorted().join(", ")}`
    );
  }
};

const sortedRedirects = (redirects) =>
  [...redirects.values()].toSorted((a, b) => a.from.localeCompare(b.from));

const convertProject = (root, options) => {
  const project = createProject(root, options);
  recordUrls(project);
  classifyReference(project);
  removeEmptyParents(project);
  for (const page of project.pages.filter(
    (entry) => !project.handled.has(entry.file)
  )) {
    convertPage(project, page);
  }
  convertSnippetFiles(project);
  if (project.syncLayout) {
    for (const entry of orderFiles(project)) {
      writeMeta(project, entry);
    }
  }
  writeOverlays(project);
  addSectionRedirects(project);
  reportProject(project);
  if (project.syncLayout) {
    project.writes.set(
      path.join(root, INVENTORY),
      `${JSON.stringify(project.inventory, null, 2)}\n`
    );
    project.writes.set(
      path.join(root, REDIRECTS),
      `${JSON.stringify(sortedRedirects(project.redirects), null, 2)}\n`
    );
  } else {
    todo(
      "not ReadMe's Git sync layout (no _order.yaml): only page content was converted; rebuild the tree from frontmatter as the reference describes"
    );
  }
  return { deletes: project.deletes, writes: project.writes };
};

// --- Pass 2: routes -------------------------------------------------------------------

const resolveRoute = (state, endpoint) => {
  const reference = state.bySpec.get(endpoint.spec);
  const byId =
    state.references[reference]?.operationIds?.[endpoint.operationId];
  if (byId) {
    return byId;
  }
  if (!(endpoint.method && endpoint.path)) {
    return;
  }
  const key = `${endpoint.method} ${endpoint.path}`;
  const candidates = Object.entries(state.references)
    .filter(([route]) => !reference || route === reference)
    .map(([, entry]) => entry.endpoints?.[key])
    .filter(Boolean);
  if (candidates.length > 1) {
    todo(
      `${endpoint.oldUrl}: ${key} is in several references; pass --spec to pick one`
    );
  }
  return candidates.length === 1 ? candidates[0] : undefined;
};

const rankOf = (inventory, endpoint) => [
  Math.max(inventory.referenceOrder.indexOf(endpoint.category), 0),
  Math.max(
    inventory.tagFolders.find(
      (tag) => tag.oldUrl.split("/").pop() === endpoint.folder
    )?.position ?? 0,
    0
  ),
  endpoint.position < 0 ? Number.MAX_SAFE_INTEGER : endpoint.position,
];

const compareRanks = (inventory) => (a, b) => {
  const left = rankOf(inventory, a);
  const right = rankOf(inventory, b);
  const index = left.findIndex((value, position) => value !== right[position]);
  return index === -1 ? 0 : left[index] - right[index];
};

const redirectEndpoints = (state) => {
  for (const endpoint of state.inventory.endpoints) {
    const route = resolveRoute(state, endpoint);
    if (!route) {
      todo(
        `${endpoint.oldUrl} (${endpoint.spec} ${endpoint.operationId}) has no generated page in the routes file`
      );
      continue;
    }
    endpoint.route = route;
    state.moved.set(endpoint.oldUrl, route);
    if (
      state.taken.has(endpoint.oldUrl) ||
      state.pageUrls.has(endpoint.oldUrl)
    ) {
      todo(
        `${endpoint.oldUrl} is now ${state.taken.has(endpoint.oldUrl) ? "a reference overview or operation" : "a page"}: no redirect (it would hide that page)`
      );
    } else if (!state.redirects.has(endpoint.oldUrl)) {
      state.redirects.set(endpoint.oldUrl, {
        from: endpoint.oldUrl,
        to: route,
      });
    }
  }
};

const redirectTags = (state) => {
  const routed = state.inventory.endpoints
    .filter((endpoint) => endpoint.route)
    .toSorted(state.compare);
  for (const tag of state.inventory.tagFolders) {
    const folder = tag.oldUrl.split("/").pop();
    const first = routed.find((endpoint) => endpoint.folder === folder);
    if (!first) {
      continue;
    }
    state.moved.set(tag.oldUrl, first.route);
    const free = !(
      state.taken.has(tag.oldUrl) || state.pageUrls.has(tag.oldUrl)
    );
    if (free && !state.redirects.has(tag.oldUrl)) {
      state.redirects.set(tag.oldUrl, {
        from: tag.oldUrl,
        status: 302,
        to: first.route,
      });
    }
  }
  const [first] = routed;
  if (
    !state.redirects.has("/reference") &&
    !state.taken.has("/reference") &&
    first &&
    state.inventory.referenceOrder[0] === first.category
  ) {
    state.redirects.set("/reference", {
      from: "/reference",
      status: 302,
      to: first.route,
    });
  }
};

// A redirect from a URL that is now a reference overview or operation page
// would hide that page (pass 1 sends /reference to the first page, but a
// single spec's overview lives there).
const dropShadowingRedirects = (state) => {
  for (const from of state.redirects.keys()) {
    if (state.taken.has(from)) {
      state.redirects.delete(from);
      todo(
        `${from} is now a reference page: its redirect was removed (it would hide the page)`
      );
    }
  }
};

const groupByDirectory = (endpoints) => {
  const byDirectory = new Map();
  for (const endpoint of endpoints) {
    const directory = endpoint.route.split("/").slice(0, -1).join("/");
    byDirectory.set(directory, [
      ...(byDirectory.get(directory) ?? []),
      endpoint,
    ]);
  }
  const bySource = new Map();
  for (const [directory, list] of byDirectory) {
    const source = directory.split("/").slice(0, -1).join("/");
    bySource.set(source, [...(bySource.get(source) ?? []), [directory, list]]);
  }
  return bySource;
};

// Tag-level meta.ts: ReadMe's endpoint order inside each tag, where it can
// differ from the spec's order, which the generated sidebar follows.
const writeTagMetas = (state) => {
  const routed = state.inventory.endpoints.filter((endpoint) => endpoint.route);
  for (const [source, directories] of sortedEntries(groupByDirectory(routed))) {
    const sorted = directories
      .map(([directory, list]) => [directory, list.toSorted(state.compare)])
      .toSorted((a, b) => state.compare(a[1][0], b[1][0]));
    for (const [position, [directory, endpoints]] of sorted.entries()) {
      const [{ tag }] = endpoints;
      if (!tag) {
        todo(
          `${directory.slice(1)}: tag name unknown (YAML spec?); write its meta.ts by hand`
        );
        continue;
      }
      const target = path.join(state.root, directory.slice(1), "meta.ts");
      const content = metaModule({
        order: position,
        pages: endpoints.map((endpoint) => endpoint.route.split("/").pop()),
        title: tag,
      });
      if (existsSync(target) && readFileSync(target, "utf-8") !== content) {
        note(
          path.relative(state.root, target),
          "exists with other content; left as is"
        );
      } else {
        state.writes.set(target, content);
        count("tag meta.ts written (ReadMe's endpoint order)");
      }
    }
    const [[, [{ category }]]] = sorted;
    const position = state.inventory.referenceOrder.indexOf(category);
    todo(
      `${source.slice(1)}/meta.ts: defineMeta({ order: ${position === -1 ? "<n>" : position} }) puts it where ReadMe listed "${category}" (the source's label stays its title)`
    );
  }
};

const rewriteMovedLinks = (state) => {
  if (state.moved.size === 0) {
    return;
  }
  const urls = [...state.moved.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const pattern = new RegExp(
    String.raw`(?<=[\s("'\x60])(?<url>${urls.join("|")})(?<hash>#[^\s)"'\x60]*)?(?=[\s)"'\x60]|$)`,
    "gmu"
  );
  for (const dir of [
    "docs",
    "reference",
    "recipes",
    "page",
    "changelog",
    "_snippets",
  ]) {
    for (const file of walk(path.join(state.root, dir)).filter((entry) =>
      entry.endsWith(".mdx")
    )) {
      const before = readFileSync(file, "utf-8");
      // Fenced code samples keep the URLs they show.
      const after = mapProse(before, (text) =>
        text.replaceAll(
          pattern,
          byGroups(({ hash, url }) => {
            count("link to an old endpoint or tag URL rewritten");
            if (hash) {
              note(
                path.relative(state.root, file),
                `anchor ${hash} dropped from a link to ${url}`
              );
            }
            return state.moved.get(url);
          })
        )
      );
      if (after !== before) {
        state.writes.set(file, after);
      }
    }
  }
};

const applyRoutes = (root, options) => {
  const inventory = readJson(path.join(root, INVENTORY), null);
  if (!inventory) {
    throw new Error(`${INVENTORY} not found: run the convert pass first`);
  }
  const routes = readJson(options.routes, null);
  if (!routes?.references) {
    throw new Error(`${options.routes} isn't operation-routes.mjs output`);
  }
  const references = recordOf(routes.references);
  const state = {
    bySpec: new Map(
      options.specs.map(({ file, route }) => [path.basename(file), route])
    ),
    compare: compareRanks(inventory),
    inventory,
    moved: new Map(),
    pageUrls: new Set(
      inventory.urls
        .filter((entry) => entry.kind === "page")
        .map((entry) => entry.url)
    ),
    redirects: new Map(
      readJson(path.join(root, REDIRECTS), []).map((entry) => [
        entry.from,
        entry,
      ])
    ),
    references,
    root,
    taken: new Set([
      ...Object.keys(references),
      ...Object.values(references).flatMap((entry) =>
        Object.values(recordOf(entry.endpoints))
      ),
    ]),
    writes: new Map(),
  };
  dropShadowingRedirects(state);
  redirectEndpoints(state);
  redirectTags(state);
  writeTagMetas(state);
  rewriteMovedLinks(state);
  state.writes.set(
    path.join(root, INVENTORY),
    `${JSON.stringify(inventory, null, 2)}\n`
  );
  state.writes.set(
    path.join(root, REDIRECTS),
    `${JSON.stringify(sortedRedirects(state.redirects), null, 2)}\n`
  );
  return { deletes: new Set(), writes: state.writes };
};

// --- Driver ---------------------------------------------------------------------------

const HELP = `readme-codemod: the mechanical pass of a ReadMe → Blume migration

  node readme-codemod.mjs [--write] [--json] [--site <origin>]... [--glossary <file>] <project-root>
  node readme-codemod.mjs --routes <routes.json> [--spec <route>=<file>]... [--write] [--json] <project-root>

Without --write it only reports. See the header of this file for what each pass does.`;

const OPTION_HANDLERS = {
  "--glossary": (options, value) => {
    options.glossary = path.resolve(value);
  },
  "--routes": (options, value) => {
    options.routes = path.resolve(value);
  },
  "--site": (options, value) => {
    options.sites.push(value.replace(/\/+$/u, ""));
  },
  "--spec": (options, value) => {
    const split = value.indexOf("=");
    if (split <= 0) {
      throw new Error(`--spec takes <route>=<file>, got ${value}`);
    }
    const route = value.slice(0, split).replaceAll(/^\/+|\/+$/gu, "");
    options.specs.push({ file: value.slice(split + 1), route: `/${route}` });
  },
};
const FLAGS = {
  "--help": "help",
  "--json": "json",
  "--write": "write",
  "-h": "help",
};

const parseArgs = (argv) => {
  const options = {
    glossary: null,
    help: false,
    json: false,
    root: null,
    routes: null,
    sites: [],
    specs: [],
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (Object.hasOwn(FLAGS, arg)) {
      options[FLAGS[arg]] = true;
    } else if (Object.hasOwn(OPTION_HANDLERS, arg)) {
      index += 1;
      if (argv[index] === undefined) {
        throw new Error(`${arg} needs a value`);
      }
      OPTION_HANDLERS[arg](options, argv[index]);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (options.root === null) {
      options.root = path.resolve(arg);
    } else {
      throw new Error("one project root only");
    }
  }
  return options;
};

const removeEmptyDirs = (dir) => {
  if (!(existsSync(dir) && statSync(dir).isDirectory())) {
    return;
  }
  for (const name of readdirSync(dir)) {
    removeEmptyDirs(path.join(dir, name));
  }
  if (readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
};

const apply = (root, writes, deletes) => {
  for (const [file, content] of [...writes.entries()].toSorted()) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf-8");
  }
  for (const file of [...deletes].toSorted()) {
    if (!writes.has(file) && existsSync(file)) {
      rmSync(file);
    }
  }
  for (const dir of [
    "docs",
    "reference",
    "recipes",
    "custom_pages",
    "page",
    "changelogs",
    "changelog",
  ]) {
    removeEmptyDirs(path.join(root, dir));
  }
};

const summarize = (root, writes, deletes, write) => {
  const relative = (file) => path.relative(root, file);
  return {
    counts: Object.fromEntries(
      sortedEntries(report.counts).filter(([, value]) => value !== 0)
    ),
    deleted: [...deletes]
      .filter((file) => existsSync(file) || write)
      .map(relative)
      .toSorted(),
    files: Object.fromEntries(
      sortedEntries(report.files).map(([file, messages]) => [
        file,
        [...new Set(messages)],
      ])
    ),
    todo: [...new Set(report.todo)],
    written: [...writes.keys()].map(relative).toSorted(),
    wrote: write,
  };
};

const printReport = (summary) => {
  const out = [];
  if (summary.written.length === 0 && summary.deleted.length === 0) {
    out.push("Nothing to change.");
  } else {
    out.push(
      summary.wrote ? "Applied:" : "Would apply (dry run; --write to apply):"
    );
    for (const [kind, value] of Object.entries(summary.counts)) {
      out.push(`  ${value}× ${kind}`);
    }
    out.push(
      `  ${summary.written.length} file(s) written, ${summary.deleted.length} deleted`
    );
  }
  const files = Object.entries(summary.files);
  if (files.length > 0) {
    out.push("", "Review, per file:");
    for (const [file, messages] of files) {
      out.push(`  ${file}`, ...messages.map((message) => `    - ${message}`));
    }
  }
  if (summary.todo.length > 0) {
    out.push("", "Left for you:", ...summary.todo.map((item) => `  - ${item}`));
  }
  process.stdout.write(`${out.join("\n")}\n`);
};

const run = (options) => {
  const result = options.routes
    ? applyRoutes(options.root, options)
    : convertProject(options.root, options);
  // Skip writes that wouldn't change a byte, so a rerun reports nothing.
  const writes = new Map(
    [...result.writes].filter(
      ([file, content]) =>
        !(existsSync(file) && readFileSync(file, "utf-8") === content)
    )
  );
  const deletes = new Set(
    [...result.deletes].filter((file) => existsSync(file))
  );
  if (options.write) {
    apply(options.root, writes, deletes);
  }
  return summarize(options.root, writes, deletes, options.write);
};

const main = () => {
  let options;
  let summary;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help || options.root === null) {
      process.stdout.write(`${HELP}\n`);
      return;
    }
    summary = run(options);
  } catch (error) {
    process.stderr.write(`readme-codemod: ${error.message}\n`);
    process.exit(1);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printReport(summary);
  }
};

main();
