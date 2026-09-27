const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const GRAPH_VERSION = "v25.0";
const GRAPH_BASE = "https://graph.facebook.com/" + GRAPH_VERSION;

const template = $("#rowTemplate");
const list = $("#inputList");
const results = $("#results");
const count = $("#count");
const summary = $("#summary");
const progress = $("#progress");

let lastItems = [];
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

function parseHashtags(text) {
  return [...new Set(
    text.split(/[\s,、]+/)
      .map(s => s.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
}

function getRules() {
  return {
    minFollowers: Number($("#minFollowers").value),
    maxPostsExclusive: Number($("#maxPostsExclusive").value),
    minRatio: Number($("#minRatio").value),
    maxDays: Math.min(14, Number($("#maxDays").value) || 14),
    bestDays: Math.min(14, Number($("#bestDays").value) || 7)
  };
}

function setProgress(message, kind = "") {
  progress.hidden = false;
  progress.className = "progress" + (kind ? " " + kind : "");
  progress.textContent = message;
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

function readManualCandidates() {
  return $$(".candidate").map(row => {
    const followers = Number(row.querySelector(".followers").value);
    const posts = Number(row.querySelector(".posts").value);
    const views = Number(row.querySelector(".views").value);
    const date = row.querySelector(".date").value;
    const url = normalizeUrl(row.querySelector(".url").value);
    return {
      source: "manual",
      url,
      username: row.querySelector(".username").value.trim().replace(/^@/, "") || "",
      followers,
      posts,
      views,
      date,
      days: daysAgo(date),
      ratio: followers > 0 ? views / followers : 0,
      verified: true
    };
  });
}

function runManualFilter() {
  const r = getRules();
  const passed = readManualCandidates().filter(x =>
    x.url &&
    x.followers >= r.minFollowers &&
    x.posts > 0 &&
    x.posts < r.maxPostsExclusive &&
    x.ratio >= r.minRatio &&
    x.days >= 0 &&
    x.days <= r.maxDays
  );
  lastItems = passed;
  render(lastItems);
}

function sortItems(items) {
  const r = getRules();
  return [...items].sort((a, b) => {
    if (currentSort === "ratio") {
      const ar = Number.isFinite(a.ratio) ? a.ratio : -1;
      const br = Number.isFinite(b.ratio) ? b.ratio : -1;
      return br - ar || a.days - b.days;
    }
    if (currentSort === "newest") return a.days - b.days;
    const ab = a.days <= r.bestDays ? 1 : 0;
    const bb = b.days <= r.bestDays ? 1 : 0;
    return bb - ab || a.days - b.days;
  });
}

function render(items) {
  const r = getRules();
  const sorted = sortItems(items);
  count.textContent = sorted.length + "件";
  summary.textContent = sorted.length
    ? "候補 " + sorted.length + "件。7日以内を優先表示しています。"
    : "候補はありません。";

  if (!sorted.length) {
    results.innerHTML = '<p class="empty">条件に合う候補はありません。</p>';
    return;
  }

  results.innerHTML = sorted.map((x, index) => {
    const best = x.days <= r.bestDays;
    const ratioKnown = Number.isFinite(x.ratio) && x.ratio > 0;
    const status = x.verified
      ? '<span class="status passed">3倍条件クリア</span>'
      : '<span class="status pending">3倍条件は未判定</span>';
    const meta = x.verified
      ? `<div class="meta">
          <span>👥 ${formatNum(x.followers)}人</span>
          <span>🎞 ${formatNum(x.posts)}投稿</span>
          <span>▶ ${formatNum(x.views)}再生</span>
          <span>📈 ${ratioKnown ? x.ratio.toFixed(2) + "倍" : "-"}</span>
        </div>`
      : `<div class="meta">
          <span>📅 ${escapeHtml(x.date)}</span>
          <span>🗓 ${x.days}日前</span>
          <span>🏷 #${escapeHtml(x.hashtag || "")}</span>
          <span>Meta公式API</span>
        </div>`;

    return `
      <article class="card ${best ? "best" : ""}">
        <div class="topline">
          <div>
            <strong>${x.username ? "@" + escapeHtml(x.username) : "リール候補"}</strong>
            ${status}
          </div>
          <span class="tag">${best ? "🔥 " + x.days + "日前" : x.days + "日前"}</span>
        </div>
        ${x.verified ? '<div class="ratio">' + x.ratio.toFixed(2) + '倍</div>' : ''}
        ${meta}
        <div class="url-block">
          <div class="url-label">候補投稿URL</div>
          <div class="url-text">${escapeHtml(x.url)}</div>
          <div class="url-actions">
            <a class="open-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">投稿を開く</a>
            <button class="copy-link" type="button" data-url="${escapeHtml(x.url)}" data-index="${index}">URLをコピー</button>
            ${!x.verified ? '<button class="send-to-check" type="button" data-url="' + escapeHtml(x.url) + '" data-date="' + escapeHtml(x.date) + '">③へ送る</button>' : ''}
          </div>
        </div>
      </article>`;
  }).join("");
}

async function graphGet(path, params, token) {
  const url = new URL(GRAPH_BASE + "/" + path.replace(/^\//, ""));
  Object.entries(params || {}).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data?.error?.message || ("HTTP " + res.status);
    throw new Error(msg);
  }
  return data;
}

async function fetchMediaPages(hashtagId, edge, igUserId, token, maxPages = 2) {
  const fields = "id,caption,media_type,permalink,timestamp";
  let path = hashtagId + "/" + edge;
  let params = { user_id: igUserId, fields, limit: "50" };
  const rows = [];

  for (let page = 0; page < maxPages; page++) {
    const data = await graphGet(path, params, token);
    rows.push(...(Array.isArray(data.data) ? data.data : []));
    const after = data?.paging?.cursors?.after;
    if (!after) break;
    params = { user_id: igUserId, fields, limit: "50", after };
  }
  return rows;
}

async function searchOneHashtag(tag, igUserId, token) {
  const hash = await graphGet("ig_hashtag_search", {
    user_id: igUserId,
    q: tag
  }, token);

  const hashtagId = hash?.data?.[0]?.id;
  if (!hashtagId) return [];

  const [recent, top] = await Promise.all([
    fetchMediaPages(hashtagId, "recent_media", igUserId, token, 2),
    fetchMediaPages(hashtagId, "top_media", igUserId, token, 2)
  ]);

  const seen = new Set();
  return [...recent, ...top].filter(row => {
    const key = row.id || row.permalink;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(row => ({
    source: "official",
    hashtag: tag,
    url: normalizeUrl(row.permalink),
    date: toDateInput(row.timestamp),
    days: daysAgo(toDateInput(row.timestamp)),
    ratio: NaN,
    verified: false,
    mediaType: row.media_type || ""
  }));
}

async function officialSearch() {
  const tags = parseHashtags($("#hashtags").value);
  const igUserId = $("#igUserId").value.trim();
  const token = $("#accessToken").value.trim();
  const r = getRules();

  if (!tags.length) return setProgress("ハッシュタグを1つ以上入力してください。", "error");
  if (!igUserId || !token) {
    $("#setupDetails").open = true;
    return setProgress("初回設定のInstagram User IDとAccess Tokenを入力してください。", "error");
  }

  if ($("#rememberMeta").checked) {
    localStorage.setItem("reelFinderIgUserId", igUserId);
    localStorage.setItem("reelFinderAccessToken", token);
  } else {
    localStorage.removeItem("reelFinderIgUserId");
    localStorage.removeItem("reelFinderAccessToken");
  }

  $("#officialSearchBtn").disabled = true;

  try {
    const all = [];
    for (let i = 0; i < tags.length; i++) {
      setProgress("検索中 " + (i + 1) + "/" + tags.length + "：#" + tags[i]);
      const rows = await searchOneHashtag(tags[i], igUserId, token);
      all.push(...rows);
    }

    const seen = new Set();
    const filtered = all.filter(x => {
      if (!x.url || seen.has(x.url)) return false;
      seen.add(x.url);
      const isReel = /instagram\.com\/reel\//i.test(x.url);
      return isReel && x.days >= 0 && x.days <= r.maxDays;
    });

    lastItems = filtered;
    render(lastItems);

    if (filtered.length) {
      setProgress("完了：" + filtered.length + "件のリール候補を④に表示しました。", "success");
    } else {
      setProgress("14日以内のリール候補が見つかりませんでした。別のハッシュタグでも試してください。", "error");
    }
  } catch (err) {
    console.error(err);
    setProgress("検索できませんでした：" + (err.message || err), "error");
  } finally {
    $("#officialSearchBtn").disabled = false;
  }
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
  if (!lastItems.length) return alert("CSVに保存する検索結果がありません。");
  const rows = [
    ["source","hashtag","date","days","verified","followers","posts","views","ratio","url"],
    ...lastItems.map(x => [
      x.source || "",x.hashtag || "",x.date || "",x.days,
      x.verified ? "yes" : "no",
      x.followers || "",x.posts || "",x.views || "",
      Number.isFinite(x.ratio) ? x.ratio.toFixed(2) : "",
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

$("#officialSearchBtn").addEventListener("click", officialSearch);
$("#addBtn").addEventListener("click", () => addCandidate());
$("#runBtn").addEventListener("click", runManualFilter);
$("#exportBtn").addEventListener("click", exportCsv);

results.addEventListener("click", (event) => {
  const copy = event.target.closest(".copy-link");
  if (copy) return copyUrl(copy.dataset.url, copy);

  const send = event.target.closest(".send-to-check");
  if (send) {
    addCandidate({ url: send.dataset.url, date: send.dataset.date });
    document.querySelector(".candidate:last-child")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

$$("[data-sort]").forEach(btn => btn.addEventListener("click", () => {
  currentSort = btn.dataset.sort;
  $$("[data-sort]").forEach(b => b.classList.toggle("active", b === btn));
  render(lastItems);
}));

const savedId = localStorage.getItem("reelFinderIgUserId");
const savedToken = localStorage.getItem("reelFinderAccessToken");
if (savedId && savedToken) {
  $("#igUserId").value = savedId;
  $("#accessToken").value = savedToken;
  $("#rememberMeta").checked = true;
}

addCandidate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
