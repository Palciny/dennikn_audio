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
const dayEl = el("day-filter");
const categoryEl = el("category-filter");
const template = el("card-template");

let allArticles = [];

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function fillSelect(selectEl, values, defaultLabel) {
  selectEl.innerHTML = "";
  selectEl.appendChild(createOption("", defaultLabel));
  values.forEach((value) => selectEl.appendChild(createOption(value, value)));
}

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

    const categoryText = Array.isArray(item.categories) && item.categories.length
      ? item.categories.join(", ")
      : "Bez kategórie";
    node.querySelector(".details").textContent = `Publikované: ${formatDate(item.published)} · Kategórie: ${categoryText}`;

    const articleLink = node.querySelector(".article-link");
    articleLink.href = item.url;

    const mp3Link = node.querySelector(".mp3-link");
    mp3Link.href = item.mp3_url;

    const audio = node.querySelector("audio");
    audio.src = item.mp3_url;

    const chipsEl = node.querySelector(".chips");
    (item.categories || []).forEach((category) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = category;
      chip.addEventListener("click", () => {
        categoryEl.value = category;
        applyFilter();
      });
      chipsEl.appendChild(chip);
    });

    fragment.appendChild(node);
  }

  listEl.appendChild(fragment);
}

function applyFilter() {
  const q = searchEl.value.trim().toLowerCase();
  const selectedDay = dayEl.value;
  const selectedCategory = categoryEl.value;

  const filtered = allArticles.filter((item) => {
    if (q && !(item.title || "").toLowerCase().includes(q)) {
      return false;
    }
    if (selectedDay && item.published_day !== selectedDay) {
      return false;
    }
    if (selectedCategory && !(item.categories || []).includes(selectedCategory)) {
      return false;
    }
    return true;
  });

  metaEl.dataset.filteredCount = String(filtered.length);
  const generatedAt = metaEl.dataset.generatedAtText || "";
  const total = allArticles.length;
  metaEl.textContent = `${generatedAt} · Zobrazené: ${filtered.length} z ${total}`;
  render(filtered);
}

async function load() {
  try {
    const response = await fetch("data/articles.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    allArticles = Array.isArray(payload.articles) ? payload.articles : [];
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    const days = Array.isArray(payload.published_days) ? payload.published_days : [];

    fillSelect(dayEl, days, "Všetky dni");
    fillSelect(categoryEl, categories, "Všetky kategórie");

    metaEl.dataset.generatedAtText = `Naposledy generované: ${formatDate(payload.generated_at)}`;
    metaEl.textContent = `${metaEl.dataset.generatedAtText} · Zobrazené: ${allArticles.length} z ${allArticles.length}`;
    render(allArticles);
  } catch (error) {
    metaEl.textContent = "Nepodarilo sa načítať index článkov.";
    listEl.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

searchEl.addEventListener("input", applyFilter);
dayEl.addEventListener("change", applyFilter);
categoryEl.addEventListener("change", applyFilter);
load();
