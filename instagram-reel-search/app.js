const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const template = $("#rowTemplate");
const list = $("#inputList");
const results = $("#results");
const count = $("#count");
const progress = $("#progress");
const summary = $("#summary");

const APIFY_ACTOR = "zaver.api~instagram-scraper";
let lastFiltered = [];
let currentSort = "best";

function addCandidate(data = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".username").value = data.username || "";
  node.querySelector(".followers").value = data.followers ?? "";
  node.querySelector(".posts").value = data.posts ?? "";
  node.querySelector(".views").value = data.views ?? "";
  node.querySelector(".date").value = toDateInput(data.date || "");
  node.querySelector(".url").value = data.url || "";
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

function readCandidates() {
  return $$(".candidate").map((row) => {
    const followers = Number(row.querySelector(".followers").value);
    const posts = Number(row.querySelector(".posts").value);
    const views = Number(row.querySelector(".views").value);
    const date = row.querySelector(".date").value;
    return {
      username: row.querySelector(".username").value.trim().replace(/^@/, "") || "(名称なし)",
      followers,
      posts,
      views,
      date,
      url: row.querySelector(".url").value.trim(),
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
  summary.textContent = sorted.length ? `条件一致 ${sorted.length}件。7日以内を優先表示します。` : "条件に合うリールはありません。";
  if (!sorted.length) {
    results.innerHTML = '<p class="empty">条件に合う候補はありません。</p>';
    return;
  }
  results.innerHTML = sorted.map(x => {
    const best = x.days <= bestDays;
    const link = x.url
      ? '<a class="link" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">Instagramで見る →</a>'
      : "";
    return `
      <article class="card ${best ? "best" : ""}">
        <div class="topline">
          <strong>@${escapeHtml(x.username)}</strong>
          <span class="tag">${best ? "🔥 " + x.days + "日前" : x.days + "日前"}</span>
        </div>
        <div class="ratio">${x.ratio.toFixed(2)}倍</div>
        <div class="meta">
          <span>👥 ${formatNum(x.followers)}人</span>
          <span>🎞 ${formatNum(x.posts)}投稿</span>
          <span>▶ ${formatNum(x.views)}再生</span>
          <span>📅 ${escapeHtml(x.date)}</span>
        </div>
        ${link}
      </article>`;
  }).join("");
}

function parseHashtags(text) {
  return [...new Set(text.split(/[\s,、]+/).map(s => s.trim().replace(/^#/, "")).filter(Boolean))];
}

function setProgress(message, kind = "info") {
  progress.hidden = false;
  progress.className = `progress ${kind}`;
  progress.textContent = message;
}

async function apifyRun(input, token) {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`取得エラー ${res.status}: ${text.slice(0, 180)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function firstText(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeReel(row) {
  const username = firstText(row, ["username", "owner_username", "ownerUsername", "authorUsername", "author_username"]).replace(/^@/, "");
  const views = firstNumber(row, ["views", "plays", "play_count", "playCount", "videoPlayCount", "video_play_count", "igPlayCount", "ig_play_count"]);
  const date = firstText(row, ["taken_at", "timestamp", "createdAt", "created_at", "date"]);
  const url = firstText(row, ["url", "postUrl", "post_url", "permalink"]);
  return { username, views, date, url, raw: row };
}

function normalizeProfile(row) {
  return {
    username: firstText(row, ["username", "userName", "owner_username"]).replace(/^@/, ""),
    followers: firstNumber(row, ["followers", "followers_count", "followersCount", "followerCount", "authorFollowerCount"]),
    posts: firstNumber(row, ["posts_count", "postsCount", "media_count", "mediaCount", "posts"])
  };
}

function fillCandidates(items) {
  list.innerHTML = "";
  items.forEach(addCandidate);
  if (!items.length) addCandidate();
}

async function autoSearch() {
  const token = $("#apifyToken").value.trim();
  const tags = parseHashtags($("#hashtags").value);
  const limit = Math.max(5, Math.min(200, Number($("#resultsLimit").value) || 50));
  const rules = getRules();

  if (!token) return setProgress("Apify APIトークンを入力してください。", "error");
  if (!tags.length) return setProgress("検索するハッシュタグを1つ以上入力してください。", "error");

  if ($("#rememberToken").checked) localStorage.setItem("reelFinderApifyToken", token);
  else localStorage.removeItem("reelFinderApifyToken");

  $("#autoSearchBtn").disabled = true;
  try {
    setProgress(`① ${tags.length}個のハッシュタグからリールを取得中…`);
    const reelsRaw = await apifyRun({
      directUrls: tags.map(t => `#${t}`),
      resultsType: "reels",
      resultsLimit: limit,
      onlyPostsNewerThan: `${rules.maxDays} days`
    }, token);

    const reels = reelsRaw.map(normalizeReel).filter(x => x.username && x.views > 0 && x.date);
    const recent = reels.filter(x => {
      const d = daysAgo(toDateInput(x.date));
      return d >= 0 && d <= rules.maxDays;
    });
    const usernames = [...new Set(recent.map(x => x.username))];

    if (!usernames.length) {
      fillCandidates([]);
      runFilter();
      return setProgress("対象期間内のリールを取得できませんでした。別のハッシュタグでも試してください。", "error");
    }

    setProgress(`② ${usernames.length}アカウントのフォロワー数・投稿数を取得中…`);
    const profilesRaw = await apifyRun({
      directUrls: usernames,
      resultsType: "details",
      resultsLimit: 1
    }, token);

    const profileMap = new Map();
    profilesRaw.map(normalizeProfile).filter(p => p.username).forEach(p => profileMap.set(p.username.toLowerCase(), p));

    const merged = recent.map(r => {
      const p = profileMap.get(r.username.toLowerCase()) || {};
      return {
        username: r.username,
        followers: p.followers || 0,
        posts: p.posts || 0,
        views: r.views,
        date: toDateInput(r.date),
        url: r.url
      };
    }).filter(x => x.followers > 0 && x.posts > 0);

    fillCandidates(merged);
    runFilter();
    const missing = recent.length - merged.length;
    setProgress(`完了：候補 ${recent.length}件を確認し、投稿者情報と照合できた ${merged.length}件を判定しました。${missing ? ` 未照合 ${missing}件。` : ""}`, "success");
  } catch (err) {
    console.error(err);
    setProgress(`検索できませんでした。${err.message || err}`, "error");
  } finally {
    $("#autoSearchBtn").disabled = false;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  if (!lastFiltered.length) return setProgress("CSVに保存する検索結果がありません。", "error");
  const rows = [["username","followers","posts","views","ratio","days","date","url"], ...lastFiltered.map(x => [x.username,x.followers,x.posts,x.views,x.ratio.toFixed(2),x.days,x.date,x.url])];
  const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reel-search-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#addBtn").addEventListener("click", () => addCandidate());
$("#runBtn").addEventListener("click", runFilter);
$("#autoSearchBtn").addEventListener("click", autoSearch);
$("#exportBtn").addEventListener("click", exportCsv);

$$('[data-sort]').forEach(btn => btn.addEventListener("click", () => {
  currentSort = btn.dataset.sort;
  $$('[data-sort]').forEach(b => b.classList.toggle("active", b === btn));
  render(lastFiltered, getRules().bestDays);
}));

const savedToken = localStorage.getItem("reelFinderApifyToken");
if (savedToken) {
  $("#apifyToken").value = savedToken;
  $("#rememberToken").checked = true;
}

addCandidate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
