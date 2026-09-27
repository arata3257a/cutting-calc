const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const template = $("#rowTemplate");
const list = $("#inputList");
const results = $("#results");
const count = $("#count");
const summary = $("#summary");

let lastFiltered = [];
let currentSort = "best";

function addCandidate(data = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".url").value = data.url || "";
  node.querySelector(".username").value = data.username || "";
  node.querySelector(".followers").value = data.followers ?? "";
  node.querySelector(".posts").value = data.posts ?? "";
  node.querySelector(".views").value = data.views ?? "";
  node.querySelector(".date").value = toDateInput(data.date || "");
  node.querySelector(".remove").addEventListener("click", () => node.remove());
  list.appendChild(node);
}

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const now = new Date();
  const d = new Date(dateString + "T00:00:00");
  if (Number.isNaN(d.getTime())) return Infinity;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - d) / 86400000);
}

function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return s;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function readCandidates() {
  return $$(".candidate").map((row) => {
    const followers = Number(row.querySelector(".followers").value);
    const posts = Number(row.querySelector(".posts").value);
    const views = Number(row.querySelector(".views").value);
    const date = row.querySelector(".date").value;
    const url = normalizeUrl(row.querySelector(".url").value);
    return {
      username: row.querySelector(".username").value.trim().replace(/^@/, "") || "(名称なし)",
      followers,
      posts,
      views,
      date,
      url,
      days: daysAgo(date),
      ratio: followers > 0 ? views / followers : 0
    };
  });
}

function getRules() {
  return {
    minFollowers: Number($("#minFollowers").value),
    maxPostsExclusive: Number($("#maxPostsExclusive").value),
    minRatio: Number($("#minRatio").value),
    maxDays: Number($("#maxDays").value),
    bestDays: Number($("#bestDays").value)
  };
}

function runFilter() {
  const rules = getRules();
  lastFiltered = readCandidates().filter(x =>
    x.url &&
    x.followers >= rules.minFollowers &&
    x.posts < rules.maxPostsExclusive &&
    x.ratio >= rules.minRatio &&
    x.days >= 0 &&
    x.days <= rules.maxDays
  );
  render(lastFiltered, rules.bestDays);
}

function sortItems(items, bestDays) {
  return [...items].sort((a, b) => {
    if (currentSort === "ratio") return b.ratio - a.ratio || a.days - b.days;
    if (currentSort === "newest") return a.days - b.days || b.ratio - a.ratio;
    const aBest = a.days <= bestDays ? 1 : 0;
    const bBest = b.days <= bestDays ? 1 : 0;
    return bBest - aBest || b.ratio - a.ratio || a.days - b.days;
  });
}

function formatNum(n) {
  return new Intl.NumberFormat("ja-JP").format(n || 0);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function render(items, bestDays) {
  const sorted = sortItems(items, bestDays);
  count.textContent = sorted.length + "件";
  summary.textContent = sorted.length
    ? `条件一致 ${sorted.length}件。候補投稿のURLを表示しています。`
    : "条件に合うリールはありません。";

  if (!sorted.length) {
    results.innerHTML = '<p class="empty">条件に合う候補はありません。</p>';
    return;
  }

  results.innerHTML = sorted.map((x, index) => {
    const best = x.days <= bestDays;
    const user = x.username === "(名称なし)" ? "投稿者名未入力" : "@" + escapeHtml(x.username);
    return `
      <article class="card ${best ? "best" : ""}">
        <div class="topline">
          <strong>${user}</strong>
          <span class="tag">${best ? "🔥 " + x.days + "日前" : x.days + "日前"}</span>
        </div>
        <div class="ratio">${x.ratio.toFixed(2)}倍</div>
        <div class="meta">
          <span>👥 ${formatNum(x.followers)}人</span>
          <span>🎞 ${formatNum(x.posts)}投稿</span>
          <span>▶ ${formatNum(x.views)}再生</span>
          <span>📅 ${escapeHtml(x.date)}</span>
        </div>

        <div class="url-block">
          <div class="url-label">候補投稿URL</div>
          <div class="url-text">${escapeHtml(x.url)}</div>
          <div class="url-actions">
            <a class="open-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">投稿を開く</a>
            <button class="copy-link" type="button" data-url="${escapeHtml(x.url)}" data-index="${index}">URLをコピー</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function parseHashtags(text) {
  return [...new Set(
    text.split(/[\s,、]+/)
      .map(s => s.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
}

function buildSearchLinks() {
  const tags = parseHashtags($("#hashtags").value);
  const box = $("#searchLinks");

  if (!tags.length) {
    box.innerHTML = '<p class="empty small">ハッシュタグを入力してください。</p>';
    return;
  }

  box.innerHTML = tags.map(tag => {
    const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
    return `
      <a class="search-link" href="${url}" target="_blank" rel="noopener">
        <span>#${escapeHtml(tag)}</span>
        <strong>Instagramで検索 →</strong>
      </a>`;
  }).join("");
}

function addBulkUrls() {
  const urls = $("#bulkUrls").value
    .split(/\r?\n/)
    .map(normalizeUrl)
    .filter(Boolean);

  const unique = [...new Set(urls)];
  if (!unique.length) return;

  const existing = new Set(
    $$(".candidate .url").map(el => normalizeUrl(el.value)).filter(Boolean)
  );

  const emptyFirst = $$(".candidate").length === 1 &&
    !$(".candidate .url").value &&
    !$(".candidate .followers").value &&
    !$(".candidate .views").value;

  if (emptyFirst) list.innerHTML = "";

  unique.filter(url => !existing.has(url)).forEach(url => addCandidate({ url }));
  $("#bulkUrls").value = "";
}

async function copyUrl(url, button) {
  try {
    await navigator.clipboard.writeText(url);
    const old = button.textContent;
    button.textContent = "コピー済み";
    setTimeout(() => button.textContent = old, 1200);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    button.textContent = "コピー済み";
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  if (!lastFiltered.length) {
    alert("CSVに保存する検索結果がありません。");
    return;
  }
  const rows = [
    ["username","followers","posts","views","ratio","days","date","url"],
    ...lastFiltered.map(x => [
      x.username,x.followers,x.posts,x.views,x.ratio.toFixed(2),x.days,x.date,x.url
    ])
  ];
  const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reel-search-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#makeSearchBtn").addEventListener("click", buildSearchLinks);
$("#addBtn").addEventListener("click", () => addCandidate());
$("#bulkAddBtn").addEventListener("click", addBulkUrls);
$("#runBtn").addEventListener("click", runFilter);
$("#exportBtn").addEventListener("click", exportCsv);

results.addEventListener("click", (event) => {
  const btn = event.target.closest(".copy-link");
  if (!btn) return;
  copyUrl(btn.dataset.url, btn);
});

$$('[data-sort]').forEach(btn => btn.addEventListener("click", () => {
  currentSort = btn.dataset.sort;
  $$('[data-sort]').forEach(b => b.classList.toggle("active", b === btn));
  render(lastFiltered, getRules().bestDays);
}));

addCandidate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
