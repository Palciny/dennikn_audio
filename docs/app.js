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
const speedEl = el("speed-control");
const template = el("card-template");

const FULL_DATA_URL = "data/articles.json";
const LATEST_DATA_URL = "data/latest.json";
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 200;

let allArticles = [];
let filteredArticles = [];
let visibleCount = PAGE_SIZE;
let archiveLoaded = false;
let latestDay = null;
let totalArticleCount = 0;
let playbackRate = Number(localStorage.getItem("preferredPlaybackRate") || "1");

const audioObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setAudioSource(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "400px 0px" })
  : null;

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function debounce(fn, delay) {
  let timerId;
  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), delay);
  };
}

function fillSelect(selectEl, values, defaultLabel) {
  selectEl.innerHTML = "";
  selectEl.appendChild(createOption("", defaultLabel));
  values.forEach((value) => selectEl.appendChild(createOption(value, value)));
}

function applyPlaybackRate(audio, labelEl) {
  audio.playbackRate = playbackRate;
  if (labelEl) labelEl.textContent = `${playbackRate}×`;
}

function syncAllPlaybackRates() {
  document.querySelectorAll(".card").forEach((card) => {
    const audio = card.querySelector("audio");
    const label = card.querySelector(".speed-value");
    if (audio) applyPlaybackRate(audio, label);
  });
  if (speedEl) speedEl.value = String(playbackRate);
}

function setAudioSource(audio) {
  if (!audio.src && audio.dataset.src) {
    audio.src = audio.dataset.src;
  }
}

function updateMeta() {
  const generatedAt = metaEl.dataset.generatedAtText || "";
  const filteredCount = filteredArticles.length;
  const shownCount = Math.min(filteredCount, visibleCount);
  const total = totalArticleCount || allArticles.length;
  const loadingMode = archiveLoaded ? "" : " · Načítaný najnovší deň";

  metaEl.dataset.filteredCount = String(filteredCount);
  metaEl.textContent = `${generatedAt} · Zobrazené: ${shownCount} z ${filteredCount} vyfiltrovaných · Celkom: ${total}${loadingMode}`;
}

function showError(message, detail) {
  metaEl.textContent = message;
  listEl.innerHTML = `<div class="empty">${detail}</div>`;
}

function runFilter() {
  applyFilter().catch((error) => {
    showError("Nepodarilo sa filtrovať články.", error.message);
  });
}

function createShowMoreButton(totalCount) {
  const remaining = totalCount - visibleCount;
  const button = document.createElement("button");

  button.type = "button";
  button.className = "show-more";
  button.textContent = `Zobraziť ďalších ${Math.min(PAGE_SIZE, remaining)} (${remaining} zostáva)`;
  button.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    updateMeta();
    render(filteredArticles);
    syncAllPlaybackRates();
  });

  return button;
}

function render(items) {
  if (audioObserver) {
    listEl.querySelectorAll("audio").forEach((audio) => audioObserver.unobserve(audio));
  }

  listEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenašli sa žiadne články pre tento filter.";
    listEl.appendChild(empty);
    return;
  }

  const visibleItems = items.slice(0, visibleCount);
  const fragment = document.createDocumentFragment();

  for (const item of visibleItems) {
    const node = template.content.cloneNode(true);
    node.querySelector(".title").textContent = item.title || item.url || "Bez názvu";

    const categoryText = Array.isArray(item.categories) && item.categories.length
      ? item.categories.join(", ")
      : "Bez kategórie";
    node.querySelector(".details").textContent = `Publikované: ${formatDate(item.published)} · Kategórie: ${categoryText}`;

    const articleLink = node.querySelector(".article-link");
    articleLink.href = item.url;

    const mp3Link = node.querySelector(".mp3-link");
    mp3Link.href = item.mp3_url;

    const audio = node.querySelector("audio");
    audio.dataset.src = item.mp3_url;
    audio.preload = "none";
    const speedValueEl = node.querySelector(".speed-value");
    applyPlaybackRate(audio, speedValueEl);
    audio.addEventListener("pointerdown", () => setAudioSource(audio), { once: true });
    audio.addEventListener("focus", () => setAudioSource(audio), { once: true });
    audio.addEventListener("keydown", () => setAudioSource(audio), { once: true });
    audio.addEventListener("loadedmetadata", () => applyPlaybackRate(audio, speedValueEl));
    audio.addEventListener("play", () => {
      setAudioSource(audio);
      applyPlaybackRate(audio, speedValueEl);
    });

    if (audioObserver) {
      audioObserver.observe(audio);
    } else {
      setAudioSource(audio);
    }

    const chipsEl = node.querySelector(".chips");
    (item.categories || []).forEach((category) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = category;
      chip.addEventListener("click", () => {
        categoryEl.value = category;
        runFilter();
      });
      chipsEl.appendChild(chip);
    });

    fragment.appendChild(node);
  }

  listEl.appendChild(fragment);

  if (items.length > visibleCount) {
    listEl.appendChild(createShowMoreButton(items.length));
  }
}

function applyPayload(payload, isArchive) {
  const previousDay = dayEl.value;
  const previousCategory = categoryEl.value;
  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  const days = Array.isArray(payload.published_days) ? payload.published_days : [];

  allArticles = Array.isArray(payload.articles) ? payload.articles : [];
  archiveLoaded = isArchive;
  latestDay = payload.latest_day || days[0] || latestDay;
  totalArticleCount = Number(payload.total_count || payload.count || allArticles.length);

  fillSelect(dayEl, days, "Všetky dni");
  fillSelect(categoryEl, categories, "Všetky kategórie");

  if (previousDay && days.includes(previousDay)) {
    dayEl.value = previousDay;
  } else if (!previousDay && isArchive) {
    dayEl.value = "";
  } else if (latestDay) {
    dayEl.value = latestDay;
  }

  if (previousCategory && categories.includes(previousCategory)) {
    categoryEl.value = previousCategory;
  }

  metaEl.dataset.generatedAtText = `Naposledy generované: ${formatDate(payload.generated_at)}`;
}

async function fetchPayload(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function loadArchiveIfNeeded() {
  const selectedDay = dayEl.value;
  const needsArchive = !archiveLoaded && (!selectedDay || selectedDay !== latestDay);

  if (!needsArchive) {
    return;
  }

  metaEl.textContent = "Načítavam celý archív…";
  applyPayload(await fetchPayload(FULL_DATA_URL), true);
}

async function applyFilter(resetVisible = true) {
  if (resetVisible) {
    visibleCount = PAGE_SIZE;
  }

  await loadArchiveIfNeeded();

  const q = searchEl.value.trim().toLowerCase();
  const selectedDay = dayEl.value;
  const selectedCategory = categoryEl.value;

  filteredArticles = allArticles.filter((item) => {
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

  updateMeta();
  render(filteredArticles);
}

async function load() {
  try {
    let payload;
    let isArchive = false;

    try {
      payload = await fetchPayload(LATEST_DATA_URL);
    } catch {
      payload = await fetchPayload(FULL_DATA_URL);
      isArchive = true;
    }

    applyPayload(payload, isArchive);

    if (latestDay) {
      dayEl.value = latestDay;
    }

    await applyFilter();
    syncAllPlaybackRates();
  } catch (error) {
    showError("Nepodarilo sa načítať index článkov.", error.message);
  }
}

const debouncedApplyFilter = debounce(runFilter, SEARCH_DEBOUNCE_MS);

searchEl.addEventListener("input", debouncedApplyFilter);
dayEl.addEventListener("change", runFilter);
categoryEl.addEventListener("change", runFilter);
load();

if (speedEl) {
  if (!["0.75", "1", "1.25", "1.5", "1.75", "2"].includes(String(playbackRate))) {
    playbackRate = 1;
  }
  speedEl.value = String(playbackRate);
  speedEl.addEventListener("change", () => {
    playbackRate = Number(speedEl.value || "1");
    localStorage.setItem("preferredPlaybackRate", String(playbackRate));
    syncAllPlaybackRates();
  });
}
