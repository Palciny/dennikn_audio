function formatDate(value) {
  if (!value) return "Dátum neznámy";
  try {
    return new Date(value).toLocaleString("sk-SK", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function el(id) {
  return document.getElementById(id);
}

const listEl = el("list");
const metaEl = el("meta");
const searchEl = el("search");
const template = el("card-template");

let allArticles = [];

function render(items) {
  listEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenašli sa žiadne články pre tento filter.";
    listEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const node = template.content.cloneNode(true);
    node.querySelector(".title").textContent = item.title || item.url;
    node.querySelector(".details").textContent = `Publikované: ${formatDate(item.published)}`;

    const articleLink = node.querySelector(".article-link");
    articleLink.href = item.url;

    const mp3Link = node.querySelector(".mp3-link");
    mp3Link.href = item.mp3_url;

    const audio = node.querySelector("audio");
    audio.src = item.mp3_url;

    fragment.appendChild(node);
  }

  listEl.appendChild(fragment);
}

function applyFilter() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    render(allArticles);
    return;
  }
  render(allArticles.filter((item) => (item.title || "").toLowerCase().includes(q)));
}

async function load() {
  try {
    const response = await fetch("data/articles.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    allArticles = Array.isArray(payload.articles) ? payload.articles : [];
    metaEl.textContent = `Naposledy generované: ${formatDate(payload.generated_at)} · Počet položiek: ${payload.count ?? allArticles.length}`;
    render(allArticles);
  } catch (error) {
    metaEl.textContent = "Nepodarilo sa načítať index článkov.";
    listEl.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

searchEl.addEventListener("input", applyFilter);
load();
