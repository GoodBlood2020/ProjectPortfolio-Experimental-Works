/* David de la Montombre — Experimental Works (static)
   Loads data.json, renders cards, filters, lightweight markdown, RSS */

const $ = (s) => document.querySelector(s);

const els = {
  grid: $("#grid"),
  tpl: $("#cardTpl"),
  search: $("#search"),
  tagFilter: $("#tagFilter"),
  showDrafts: $("#showDrafts"),
  showArchived: $("#showArchived"),
  showPrivate: $("#showPrivate"),
  count: $("#count"),
  rssLink: $("#rssLink"),
};

let all = [];

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function uniqueTags(items) {
  const set = new Set();
  items.forEach(p => (p.tags || []).forEach(t => set.add(t)));
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}

/**
 * Lightweight Markdown (no dependencies).
 * Supports:
 * - #, ##, ### headings
 * - paragraphs
 * - unordered lists (- or *)
 * - inline code `code`
 * - links [text](url)
 * - blockquotes > quote
 *
 * It intentionally avoids raw HTML passthrough for safety.
 */
function mdToHtml(md) {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inList = false;

  const esc = (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const inline = (str) => {
    let s = esc(str);

    // inline code
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    // links [text](url) — only http(s) and relative allowed
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const u = url.trim();
      const safe =
        u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/") || u.startsWith("./") || u.startsWith("../");
      if (!safe) return esc(text);
      return `<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(text)}</a>`;
    });

    return s;
  };

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      closeList();
      const q = line.trim().replace(/^>\s?/, "");
      out.push(`<blockquote>${inline(q)}</blockquote>`);
      continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) { closeList(); out.push(`<h3>${inline(h3[1])}</h3>`); continue; }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) { closeList(); out.push(`<h2>${inline(h2[1])}</h2>`); continue; }

    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) { closeList(); out.push(`<h1>${inline(h1[1])}</h1>`); continue; }

    // Unordered list
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }

    // Paragraph
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return out.join("\n");
}

function makeRSS(items) {
  const base = location.href.replace(/\/index\.html?$/, "/");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>David de la Montombre — Experimental Works</title>
    <link>${base}</link>
    <description>Project updates</description>
    ${items.slice(0, 30).map(p => `
    <item>
      <title><![CDATA[${p.title || ""}]]></title>
      <link>${(p.links && p.links[0] && p.links[0].url) ? p.links[0].url : base}</link>
      <description><![CDATA[${p.description || ""}]]></description>
      <pubDate>${p.date ? new Date(p.date).toUTCString() : new Date().toUTCString()}</pubDate>
      <guid isPermaLink="false">${p.id || p.title || Math.random()}</guid>
    </item>`).join("")}
  </channel>
</rss>`;
  const blob = new Blob([xml], { type: "application/rss+xml" });
  return URL.createObjectURL(blob);
}

function badge(text) {
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = text;
  return span;
}

function render(items) {
  els.grid.innerHTML = "";

  items.forEach(p => {
    const node = els.tpl.content.cloneNode(true);

    node.querySelector(".title").textContent = p.title || "Untitled";
    node.querySelector(".date").textContent = p.date ? `Updated: ${fmtDate(p.date)}` : "";

    // Badges: status + flags
    const badges = node.querySelector(".badges");
    if (p.status) badges.appendChild(badge(p.status));

    if (p.isDraft) badges.appendChild(badge("Draft"));
    if (p.isArchived) badges.appendChild(badge("Archived"));
    if (p.isPrivate) badges.appendChild(badge("Private"));

    // Gallery
    const wrap = node.querySelector(".galleryWrap");
    const gallery = node.querySelector(".gallery");
    const imgs = Array.isArray(p.images) ? p.images : [];
    if (imgs.length) {
      wrap.classList.remove("hide");
      imgs.forEach(img => {
        const im = document.createElement("img");
        // img can be string or {src, alt}
        const src = typeof img === "string" ? img : img.src;
        const alt = typeof img === "string" ? (p.title || "project image") : (img.alt || p.title || "project image");
        im.src = src;
        im.alt = alt;
        im.loading = "lazy";
        gallery.appendChild(im);
      });
    } else {
      wrap.classList.add("hide");
    }

    // Markdown description
    const desc = node.querySelector(".desc");
    desc.innerHTML = mdToHtml(p.description || "");

    // Tags
    const tagsWrap = node.querySelector(".tags");
    (p.tags || []).forEach(t => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagsWrap.appendChild(span);
    });

    // Links
    const linksWrap = node.querySelector(".links");
    (p.links || []).forEach(l => {
      const a = document.createElement("a");
      a.className = "btn";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = l.label || "Link";
      linksWrap.appendChild(a);
    });

    els.grid.appendChild(node);
  });

  els.count.textContent = `${items.length} project${items.length === 1 ? "" : "s"}`;
  els.rssLink.href = makeRSS(all);
}

function applyFilters() {
  const q = normalize(els.search.value);
  const tag = els.tagFilter.value;

  const showDrafts = els.showDrafts.checked;
  const showArchived = els.showArchived.checked;
  const showPrivate = els.showPrivate.checked;

  const filtered = all.filter(p => {
    // hide private unless toggled
    if (p.isPrivate && !showPrivate) return false;

    // hide drafts unless toggled
    if (p.isDraft && !showDrafts) return false;

    // hide archived unless toggled
    if (p.isArchived && !showArchived) return false;

    const hay = normalize([p.title, p.description, (p.tags || []).join(" ")].join(" "));
    const matchQ = !q || hay.includes(q);
    const matchTag = !tag || (p.tags || []).includes(tag);

    return matchQ && matchTag;
  });

  render(filtered);
}

async function init() {
  const res = await fetch("data.json", { cache: "no-store" });
  const data = await res.json();

  all = (data.projects || []).slice().sort((a,b) => {
    const ad = a.date ? new Date(a.date).getTime() : 0;
    const bd = b.date ? new Date(b.date).getTime() : 0;
    return bd - ad;
  });

  // Populate tag filter
  const tags = uniqueTags(all);
  tags.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    els.tagFilter.appendChild(opt);
  });

  // Wire events
  els.search.addEventListener("input", applyFilters);
  els.tagFilter.addEventListener("change", applyFilters);
  els.showDrafts.addEventListener("change", applyFilters);
  els.showArchived.addEventListener("change", applyFilters);
  els.showPrivate.addEventListener("change", applyFilters);

  applyFilters();
}

init().catch(err => {
  els.grid.innerHTML =
    `<div class="card"><p style="color:rgba(167,173,187,.95);margin:0">
      Could not load <code>data.json</code>. Host this folder using GitHub Pages / Netlify / Vercel so <code>fetch()</code> works.
    </p></div>`;
  console.error(err);
});
