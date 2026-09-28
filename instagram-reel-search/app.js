const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const MUST_FOLLOWERS = 10000;
const MUST_MAX_POSTS_EXCLUSIVE = 180;
const MUST_MAX_DAYS = 7;
const MIN_RATIO = 3;
const STORAGE_KEY = "reelFinderPassedV3";
const OLD_STORAGE_KEY = "reelFinderPassedV2";

let selectedDay = null;
let passedItems = loadPassed();

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function formatNum(n) {
  return new Intl.NumberFormat("ja-JP").format(Number(n) || 0);
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function displayDate(date = new Date()) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

function parseJapaneseNumber(value) {
  let s = String(value ?? "").trim()
    .replace(/[，,\s]/g, "")
    .replace(/人|回|再生|投稿/g, "");

  if (!s) return NaN;

  const man = s.match(/^([0-9０-９]+(?:[.．][0-9０-９]+)?)万$/);
  if (man) {
    const n = Number(
      man[1]
        .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace("．", ".")
    );
    return Number.isFinite(n) ? Math.round(n * 10000) : NaN;
  }

  s = s
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace("．", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const match = raw.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i);
  const value = match ? match[0] : raw;
  try {
    const u = new URL(value);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return value;
  }
}

function isInstagramPostUrl(url) {
  return /^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\//i.test(url);
}

function parseHashtags(text) {
  return [...new Set(
    String(text || "")
      .split(/[\s,、]+/)
      .map(s => s.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
}

function loadPassed() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(current) && current.length) return current;

    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || "[]");
    if (!Array.isArray(old)) return [];

    return old.map(x => ({
      ...x,
      searchDate: x.searchDate || localDateString(new Date()),
      days: Number.isFinite(Number(x.days)) ? Number(x.days) : 0
    }));
  } catch {
    return [];
  }
}

function savePassed() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(passedItems));
}

function currentValues() {
  return {
    url: normalizeUrl($("#reelUrl").value),
    followers: parseJapaneseNumber($("#followers").value),
    posts: parseJapaneseNumber($("#posts").value),
    days: selectedDay
  };
}

function setDay(day) {
  selectedDay = day;
  $$("#dayButtons button").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.day) === day);
  });

  $("#daySelectedText").textContent =
    day === null ? "未選択" :
    day === 0 ? "今日" :
    day >= 8 ? "8日以上" :
    day + "日前";

  evaluateMust();
}

function evaluateMust() {
  const v = currentValues();
  const result = $("#mustResult");
  const stage = $("#viewsStage");
  const save = $("#saveBtn");

  stage.hidden = true;
  save.hidden = true;
  $("#views").value = "";
  $("#ratioLive").textContent = "再生数を入力してください";

  const haveFollowers = Number.isFinite(v.followers);
  const havePosts = Number.isFinite(v.posts);
  const haveDay = v.days !== null;

  if (!haveFollowers || !havePosts || !haveDay) {
    result.className = "live-result waiting";
    result.textContent = "フォロワー・投稿数・投稿日を入れると自動判定します";
    return;
  }

  const followerOK = v.followers >= MUST_FOLLOWERS;
  const postsOK = v.posts < MUST_MAX_POSTS_EXCLUSIVE;
  const dayOK = v.days >= 0 && v.days <= MUST_MAX_DAYS;

  const lines = [
    `${followerOK ? "✓" : "✕"} フォロワー ${formatNum(v.followers)}人`,
    `${postsOK ? "✓" : "✕"} 投稿数 ${formatNum(v.posts)}`,
    `${dayOK ? "✓" : "✕"} 投稿日 ${v.days >= 8 ? "8日以上" : v.days === 0 ? "今日" : v.days + "日前"}`
  ];

  if (!(followerOK && postsOK && dayOK)) {
    result.className = "live-result ng";
    result.innerHTML = "<strong>この候補は除外</strong>" +
      lines.map(x => "<span>" + escapeHtml(x) + "</span>").join("");
    return;
  }

  result.className = "live-result ok";
  result.innerHTML = "<strong>必須3条件クリア</strong>" +
    lines.map(x => "<span>" + escapeHtml(x) + "</span>").join("");

  stage.hidden = false;
  const target = Math.ceil(v.followers * MIN_RATIO);
  $("#ratioLive").innerHTML =
    `3倍の目安：<strong>${formatNum(target)}再生以上</strong>`;
}

function evaluateViews() {
  const v = currentValues();
  const views = parseJapaneseNumber($("#views").value);
  const box = $("#ratioLive");
  const save = $("#saveBtn");

  save.hidden = true;

  if (!Number.isFinite(views) || views <= 0 || !Number.isFinite(v.followers) || v.followers <= 0) {
    const target = Number.isFinite(v.followers) ? Math.ceil(v.followers * MIN_RATIO) : 0;
    box.className = "ratio-live";
    box.innerHTML = target
      ? `3倍の目安：<strong>${formatNum(target)}再生以上</strong>`
      : "再生数を入力してください";
    return;
  }

  const ratio = views / v.followers;
  if (ratio >= MIN_RATIO) {
    box.className = "ratio-live pass";
    box.innerHTML = `🎯 <strong>${ratio.toFixed(2)}倍</strong>　3倍クリア`;
    save.hidden = false;
  } else {
    box.className = "ratio-live fail";
    box.innerHTML = `<strong>${ratio.toFixed(2)}倍</strong>　3倍未満`;
  }
}

function saveCandidate() {
  const v = currentValues();
  const views = parseJapaneseNumber($("#views").value);
  const ratio = views / v.followers;
  const url = normalizeUrl($("#reelUrl").value);

  if (
    v.followers < MUST_FOLLOWERS ||
    v.posts >= MUST_MAX_POSTS_EXCLUSIVE ||
    v.days === null ||
    v.days > MUST_MAX_DAYS ||
    !Number.isFinite(views) ||
    ratio < MIN_RATIO
  ) return;

  if (!url || !isInstagramPostUrl(url)) {
    $("#reelUrl").focus();
    $("#reelUrl").classList.add("input-alert");
    setTimeout(() => $("#reelUrl").classList.remove("input-alert"), 1300);
    alert("保存するにはリールURLを入れてください。Instagramの共有から開くと自動入力できます。");
    return;
  }

  const saved = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    url,
    followers: v.followers,
    posts: v.posts,
    searchDate: localDateString(new Date()),
    date: dateDaysAgo(v.days),
    days: v.days,
    views,
    ratio,
    savedAt: new Date().toISOString()
  };

  const existing = passedItems.findIndex(x => x.url === saved.url);
  if (existing >= 0) passedItems[existing] = saved;
  else passedItems.unshift(saved);

  savePassed();
  renderPassed();

  $("#saveBtn").textContent = "保存しました ✓";
  setTimeout(() => {
    resetCandidate();
    $("#saveBtn").textContent = "この投稿を保存";
  }, 650);
}

function resetCandidate() {
  $("#reelUrl").value = "";
  $("#followers").value = "";
  $("#posts").value = "";
  $("#views").value = "";
  $("#shareBadge").hidden = true;
  selectedDay = null;
  $$("#dayButtons button").forEach(btn => btn.classList.remove("active"));
  $("#daySelectedText").textContent = "未選択";
  $("#viewsStage").hidden = true;
  $("#saveBtn").hidden = true;
  $("#mustResult").className = "live-result waiting";
  $("#mustResult").textContent = "フォロワー・投稿数・投稿日を入れると自動判定します";
  $("#followers").focus();
}

function buildSearchLinks() {
  const tags = parseHashtags($("#hashtags").value);
  const box = $("#searchLinks");

  if (!tags.length) {
    box.innerHTML = '<span class="hint">#ハッシュタグを入力してください</span>';
    return;
  }

  box.innerHTML = tags.map(tag => {
    const url = "https://www.instagram.com/explore/tags/" + encodeURIComponent(tag) + "/";
    return `<a href="${url}" target="_blank" rel="noopener">#${escapeHtml(tag)} を開く →</a>`;
  }).join("");
}

function renderPassed() {
  const box = $("#passedList");
  $("#passedCount").textContent = passedItems.length + "件";

  if (!passedItems.length) {
    box.innerHTML = '<p class="empty">まだ条件一致した投稿はありません。</p>';
    return;
  }

  box.innerHTML = passedItems.map(x => `
    <article class="saved-card">
      <div class="saved-top">
        <div>
          <span class="pass-pill">条件クリア</span>
          <strong class="ratio">${Number(x.ratio).toFixed(2)}倍</strong>
        </div>
        <button class="delete-btn" data-id="${escapeHtml(x.id)}">削除</button>
      </div>
      <div class="saved-meta">
        <span>👥 ${formatNum(x.followers)}人</span>
        <span>🎞 ${formatNum(x.posts)}投稿</span>
        <span>▶ ${formatNum(x.views)}再生</span>
        <span>📅 ${Number(x.days)}日前</span>
      </div>
      <div class="saved-url">${escapeHtml(x.url)}</div>
      <div class="url-actions">
        <a class="open-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">リールを開く</a>
        <button class="copy-btn" data-url="${escapeHtml(x.url)}">URLコピー</button>
      </div>
    </article>
  `).join("");
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const old = button.textContent;
    button.textContent = "コピー済み";
    setTimeout(() => button.textContent = old, 1000);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv() {
  if (!passedItems.length) return alert("保存する結果がありません。");

  const rows = [
    ["followers","posts","days_ago","post_date","views","ratio","url"],
    ...passedItems.map(x => [
      x.followers, x.posts, x.days, x.date, x.views, Number(x.ratio).toFixed(2), x.url
    ])
  ];

  const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "reel-passed-" + localDateString() + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function receiveSharedUrl() {
  const params = new URLSearchParams(location.search);
  const combined = [
    params.get("url"),
    params.get("text"),
    params.get("title")
  ].filter(Boolean).join(" ");

  if (!combined) return;

  const url = normalizeUrl(combined);
  if (isInstagramPostUrl(url)) {
    $("#reelUrl").value = url;
    $("#shareBadge").hidden = false;
    history.replaceState(null, "", location.pathname);
    setTimeout(() => $("#followers").focus(), 60);
  }
}

$("#searchDateLabel").textContent = displayDate(new Date()) + "（今日）";

$("#searchBtn").addEventListener("click", buildSearchLinks);
$("#followers").addEventListener("input", evaluateMust);
$("#posts").addEventListener("input", evaluateMust);
$("#views").addEventListener("input", evaluateViews);
$("#saveBtn").addEventListener("click", saveCandidate);
$("#nextBtn").addEventListener("click", resetCandidate);

$("#dayButtons").addEventListener("click", event => {
  const btn = event.target.closest("button[data-day]");
  if (!btn) return;
  setDay(Number(btn.dataset.day));
});

$("#reelUrl").addEventListener("paste", () => {
  setTimeout(() => {
    $("#reelUrl").value = normalizeUrl($("#reelUrl").value);
  }, 0);
});

$("#passedList").addEventListener("click", event => {
  const copy = event.target.closest(".copy-btn");
  if (copy) return copyText(copy.dataset.url, copy);

  const del = event.target.closest(".delete-btn");
  if (del) {
    passedItems = passedItems.filter(x => x.id !== del.dataset.id);
    savePassed();
    renderPassed();
  }
});

$("#exportBtn").addEventListener("click", exportCsv);

$("#clearPassedBtn").addEventListener("click", () => {
  if (!passedItems.length) return;
  if (!confirm("保存した結果をすべて消しますか？")) return;
  passedItems = [];
  savePassed();
  renderPassed();
});

renderPassed();
receiveSharedUrl();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
