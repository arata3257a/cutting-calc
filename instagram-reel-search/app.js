const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const REEL_ACTOR = "zaver.api~instagram-reel-scraper";
const PROFILE_ACTOR = "zaver.api~instagram-profile-scraper";
const APIFY_API = "https://api.apify.com/v2";

const results = $("#results");
const allResults = $("#allResults");
const count = $("#count");
const allCount = $("#allCount");
const summary = $("#summary");
const progress = $("#progress");
const tokenStatus = $("#tokenStatus");

let lastAll = [];
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

function parseHashtags(text) {
  return [...new Set(
    String(text || "").split(/[\s,、]+/)
      .map(s => s.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
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
    if (u.hostname.includes("instagram.com") && u.pathname.startsWith("/p/")) {
      u.pathname = u.pathname.replace(/^\/p\//, "/reel/");
    }
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function getRules() {
  return {
    minFollowers: Number($("#minFollowers").value) || 10000,
    maxPostsExclusive: Number($("#maxPostsExclusive").value) || 180,
    minRatio: Number($("#minRatio").value) || 3,
    maxDays: Math.min(14, Number($("#maxDays").value) || 14),
    bestDays: Math.min(14, Number($("#bestDays").value) || 7)
  };
}

function setProgress(message, kind = "") {
  progress.hidden = false;
  progress.className = "progress" + (kind ? " " + kind : "");
  progress.textContent = message;
}

function setTokenStatus(message, kind = "") {
  tokenStatus.hidden = false;
  tokenStatus.className = "status-box" + (kind ? " " + kind : "");
  tokenStatus.textContent = message;
}

async function apifyFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || ("HTTP " + res.status);
    throw new Error(msg);
  }
  return data;
}

async function testToken() {
  const token = $("#apifyToken").value.trim();
  if (!token) return setTokenStatus("APIトークンを入力してください。", "error");

  $("#testTokenBtn").disabled = true;
  try {
    const data = await apifyFetch(APIFY_API + "/users/me", token);
    const username = data?.data?.username || data?.username || "Apify";
    setTokenStatus("接続OK：" + username, "success");

    if ($("#rememberToken").checked) localStorage.setItem("reelFinderApifyToken", token);
    else localStorage.removeItem("reelFinderApifyToken");
  } catch (err) {
    setTokenStatus("接続できません：" + (err.message || err), "error");
  } finally {
    $("#testTokenBtn").disabled = false;
  }
}

async function runActor(actorId, input, token) {
  const url = APIFY_API + "/acts/" + actorId + "/run-sync-get-dataset-items?clean=true";
  const data = await apifyFetch(url, token, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return Array.isArray(data) ? data : [];
}

function normalizeReel(row) {
  const username = String(
    row.username ?? row.owner_username ?? row.ownerUsername ?? row.author_username ?? ""
  ).replace(/^@/, "").trim();

  const views = Number(
    row.views ?? row.plays ?? row.play_count ?? row.playCount ?? row.videoPlayCount ?? 0
  );

  const date = toDateInput(
    row.taken_at ?? row.timestamp ?? row.created_at ?? row.createdAt ?? row.date ?? ""
  );

  return {
    source: String(row.source ?? ""),
    username,
    views,
    date,
    days: daysAgo(date),
    url: normalizeUrl(row.url ?? row.post_url ?? row.postUrl ?? row.permalink ?? ""),
    caption: String(row.caption ?? ""),
    thumbnail: String(row.thumbnail_url ?? row.thumbnailUrl ?? "")
  };
}

function normalizeProfile(row) {
  return {
    username: String(row.username ?? row.source ?? "").replace(/^@/, "").trim(),
    followers: Number(row.followers ?? row.followers_count ?? row.followersCount ?? 0),
    posts: Number(row.posts_count ?? row.postsCount ?? row.media_count ?? row.mediaCount ?? 0)
  };
}

function evaluate(item, rules) {
  const reasons = [];
  if (!item.followers) reasons.push("フォロワー取得不可");
  else if (item.followers < rules.minFollowers) reasons.push("フォロワー不足");

  if (!item.posts) reasons.push("投稿数取得不可");
  else if (item.posts >= rules.maxPostsExclusive) reasons.push("投稿数オーバー");

  if (!item.views) reasons.push("再生数取得不可");
  if (!(item.ratio >= rules.minRatio)) reasons.push("3倍未満");

  if (!(item.days >= 0 && item.days <= rules.maxDays)) reasons.push("期間外");

  return { ...item, passed: reasons.length === 0, reasons };
}

function mergeData(reels, profiles) {
  const profileMap = new Map(
    profiles.filter(p => p.username).map(p => [p.username.toLowerCase(), p])
  );

  return reels.map(reel => {
    const profile = profileMap.get(reel.username.toLowerCase()) || {};
    const followers = Number(profile.followers || 0);
    const posts = Number(profile.posts || 0);
    const ratio = followers > 0 ? reel.views / followers : 0;

    return {
      ...reel,
      followers,
      posts,
      ratio
    };
  });
}

function sortItems(items) {
  const rules = getRules();
  return [...items].sort((a, b) => {
    if (currentSort === "ratio") return b.ratio - a.ratio || a.days - b.days;
    if (currentSort === "newest") return a.days - b.days || b.ratio - a.ratio;

    const aBest = a.days <= rules.bestDays ? 1 : 0;
    const bBest = b.days <= rules.bestDays ? 1 : 0;
    return bBest - aBest || b.ratio - a.ratio || a.days - b.days;
  });
}

function cardHtml(x, compact = false) {
  const rules = getRules();
  const best = x.days <= rules.bestDays;
  const tag = x.passed
    ? '<span class="status passed">条件一致</span>'
    : '<span class="status failed">' + escapeHtml(x.reasons.join("・")) + '</span>';

  return `
    <article class="card ${best && x.passed ? "best" : ""} ${compact ? "compact" : ""}">
      <div class="topline">
        <div>
          <strong>@${escapeHtml(x.username || "unknown")}</strong>
          ${tag}
        </div>
        <span class="tag">${Number.isFinite(x.days) ? (best ? "🔥 " : "") + x.days + "日前" : "-"}</span>
      </div>

      <div class="ratio">${x.ratio ? x.ratio.toFixed(2) + "倍" : "-"}</div>

      <div class="meta">
        <span>👥 ${formatNum(x.followers)}人</span>
        <span>🎞 ${formatNum(x.posts)}投稿</span>
        <span>▶ ${formatNum(x.views)}再生</span>
        <span>📅 ${escapeHtml(x.date)}</span>
      </div>

      ${x.caption && !compact ? '<div class="caption">' + escapeHtml(x.caption.slice(0, 140)) + '</div>' : ''}

      <div class="url-actions">
        <a class="open-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">リールを開く</a>
        <button class="copy-link" type="button" data-url="${escapeHtml(x.url)}">URLコピー</button>
      </div>
    </article>`;
}

function render() {
  const sorted = sortItems(lastFiltered);
  count.textContent = sorted.length + "件";
  summary.textContent = lastAll.length
    ? "取得 " + lastAll.length + "件 → 条件一致 " + sorted.length + "件"
    : "#検索すると、条件一致した投稿がここに出ます。";

  results.innerHTML = sorted.length
    ? sorted.map(x => cardHtml(x)).join("")
    : '<p class="empty">条件に合うリールはありません。</p>';

  allCount.textContent = lastAll.length + "件";
  allResults.innerHTML = lastAll.length
    ? sortItems(lastAll).map(x => cardHtml(x, true)).join("")
    : '<p class="empty">まだ検索していません。</p>';
}

async function autoSearch() {
  const token = $("#apifyToken").value.trim();
  const tags = parseHashtags($("#hashtags").value);
  const limit = Number($("#resultsLimit").value) || 30;
  const rules = getRules();

  if (!token) return setProgress("① Apify APIトークンを入力してください。", "error");
  if (!tags.length) return setProgress("検索する#ハッシュタグを入力してください。", "error");

  if ($("#rememberToken").checked) localStorage.setItem("reelFinderApifyToken", token);
  else localStorage.removeItem("reelFinderApifyToken");

  $("#autoSearchBtn").disabled = true;
  lastAll = [];
  lastFiltered = [];
  render();

  try {
    setProgress("① リールを取得中…");

    const reelRows = await runActor(REEL_ACTOR, {
      directUrls: tags.map(tag => "#" + tag),
      resultsLimit: limit,
      onlyPostsNewerThan: rules.maxDays + " days"
    }, token);

    const seen = new Set();
    const reels = reelRows
      .map(normalizeReel)
      .filter(x => {
        if (!x.username || !x.url || !x.views || !x.date) return false;
        if (x.days < 0 || x.days > rules.maxDays) return false;
        if (seen.has(x.url)) return false;
        seen.add(x.url);
        return true;
      });

    if (!reels.length) {
      setProgress("リールが見つかりませんでした。別のハッシュタグを試してください。", "error");
      return;
    }

    const usernames = [...new Set(reels.map(x => x.username.toLowerCase()))];
    setProgress("② " + reels.length + "件取得。投稿者 " + usernames.length + "アカウントを確認中…");

    const profileRows = await runActor(PROFILE_ACTOR, {
      usernames,
      includeLatestPosts: false
    }, token);

    const profiles = profileRows.map(normalizeProfile);
    const merged = mergeData(reels, profiles).map(item => evaluate(item, rules));

    lastAll = merged;
    lastFiltered = merged.filter(x => x.passed);
    render();

    setProgress(
      "完了：リール " + reels.length + "件 / 投稿者 " + profiles.length + "件 / 条件一致 " + lastFiltered.length + "件",
      "success"
    );
  } catch (err) {
    console.error(err);
    setProgress("検索できませんでした：" + (err.message || err), "error");
  } finally {
    $("#autoSearchBtn").disabled = false;
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
  if (!lastFiltered.length) return alert("CSVに保存する検索結果がありません。");

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
  a.download = "reel-search-" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function updateCostEstimate() {
  const tags = Math.max(1, parseHashtags($("#hashtags").value).length);
  const limit = Number($("#resultsLimit").value) || 30;
  const maxResults = tags * limit;
  const estimated = maxResults * (0.00099 + 0.00149);
  $("#costEstimate").textContent = "$" + estimated.toFixed(2);
  $(".cost-box small").textContent =
    tags + "タグ × 最大" + limit + "件・全て別アカウントの場合";
}

$("#testTokenBtn").addEventListener("click", testToken);
$("#autoSearchBtn").addEventListener("click", autoSearch);
$("#resultsLimit").addEventListener("change", updateCostEstimate);
$("#hashtags").addEventListener("input", updateCostEstimate);
$("#exportBtn").addEventListener("click", exportCsv);

document.addEventListener("click", event => {
  const btn = event.target.closest(".copy-link");
  if (btn) copyUrl(btn.dataset.url, btn);
});

$$("[data-sort]").forEach(btn => btn.addEventListener("click", () => {
  currentSort = btn.dataset.sort;
  $$("[data-sort]").forEach(b => b.classList.toggle("active", b === btn));
  render();
}));

const savedToken = localStorage.getItem("reelFinderApifyToken");
if (savedToken) {
  $("#apifyToken").value = savedToken;
  $("#rememberToken").checked = true;
}

updateCostEstimate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
