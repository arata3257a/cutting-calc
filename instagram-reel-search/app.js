const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const template = $("#rowTemplate");
const list = $("#inputList");
const results = $("#results");
const count = $("#count");
const summary = $("#summary");

let lastFiltered = [];
let currentSort = "best";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function formatNum(n) {
  return new Intl.NumberFormat("ja-JP").format(Number(n) || 0);
}

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const d = new Date(dateString + "T00:00:00");
  if (Number.isNaN(d.getTime())) return Infinity;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - d) / 86400000);
}

function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

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

function getRules() {
  return {
    minFollowers: Number($("#minFollowers").value),
    maxPostsExclusive: Number($("#maxPostsExclusive").value),
    minRatio: Number($("#minRatio").value),
    maxDays: Number($("#maxDays").value),
    bestDays: Number($("#bestDays").value)
  };
}

function readCandidates() {
  return $$(".candidate").map(row => {
    const followers = Number(row.querySelector(".followers").value);
    const posts = Number(row.querySelector(".posts").value);
    const views = Number(row.querySelector(".views").value);
    const date = row.querySelector(".date").value;
    return {
      url: normalizeUrl(row.querySelector(".url").value),
      username: row.querySelector(".username").value.trim().replace(/^@/, ""),
      followers,
      posts,
      views,
      date,
      days: daysAgo(date),
      ratio: followers > 0 ? views / followers : 0
    };
  });
}

function runFilter() {
  const r = getRules();
  lastFiltered = readCandidates().filter(x =>
    x.url &&
    x.followers >= r.minFollowers &&
    x.posts > 0 &&
    x.posts < r.maxPostsExclusive &&
    x.ratio >= r.minRatio &&
    x.days >= 0 &&
    x.days <= r.maxDays
  );
  render(lastFiltered);
}

function sortItems(items) {
  const r = getRules();
  return [...items].sort((a, b) => {
    if (currentSort === "ratio") return b.ratio - a.ratio || a.days - b.days;
    if (currentSort === "newest") return a.days - b.days || b.ratio - a.ratio;

    const aBest = a.days <= r.bestDays ? 1 : 0;
    const bBest = b.days <= r.bestDays ? 1 : 0;
    return bBest - aBest || b.ratio - a.ratio || a.days - b.days;
  });
}

function render(items) {
  const r = getRules();
  const sorted = sortItems(items);

  count.textContent = sorted.length + "件";
  summary.textContent = sorted.length
    ? "条件一致 " + sorted.length + "件。候補投稿URLを表示しています。"
    : "条件に合うリールはありません。";

  if (!sorted.length) {
    results.innerHTML = '<p class="empty">条件に合う候補はありません。</p>';
    return;
  }

  results.innerHTML = sorted.map(x => {
    const best = x.days <= r.bestDays;
    const user = x.username ? "@" + escapeHtml(x.username) : "投稿者名未入力";
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
            <button class="copy-link" type="button" data-url="${escapeHtml(x.url)}">URLをコピー</button>
          </div>
        </div>
      </article>`;
  }).join("");
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
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv() {
  if (!lastFiltered.length) {
    alert("CSVに保存する検索結果がありません。");
    return;
  }

  const rows = [
    ["username","followers","posts","views","ratio","days","date","url"],
    ...lastFiltered.map(x => [
      x.username,
      x.followers,
      x.posts,
      x.views,
      x.ratio.toFixed(2),
      x.days,
      x.date,
      x.url
    ])
  ];

  const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "reel-search-" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#addBtn").addEventListener("click", () => addCandidate());
$("#runBtn").addEventListener("click", runFilter);
$("#exportBtn").addEventListener("click", exportCsv);

results.addEventListener("click", event => {
  const btn = event.target.closest(".copy-link");
  if (!btn) return;
  copyUrl(btn.dataset.url, btn);
});

$$("[data-sort]").forEach(btn => btn.addEventListener("click", () => {
  currentSort = btn.dataset.sort;
  $$("[data-sort]").forEach(b => b.classList.toggle("active", b === btn));
  render(lastFiltered);
}));

addCandidate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
