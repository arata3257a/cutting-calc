const $ = (s) => document.querySelector(s);

const MUST_FOLLOWERS = 10000;
const MUST_MAX_POSTS_EXCLUSIVE = 180;
const MUST_MAX_DAYS = 7;
const MIN_RATIO = 3;
const STORAGE_KEY = "reelFinderPassedV2";

let passedItems = loadPassed();

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

function formatNum(n) {
  return new Intl.NumberFormat("ja-JP").format(Number(n) || 0);
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

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getSearchDate() {
  const value = $("#searchDate").value;
  if (!value) return new Date();

  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();

  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function daysFromSearchDate(dateString) {
  if (!dateString) return Infinity;

  const parts = dateString.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Infinity;

  const post = new Date(parts[0], parts[1] - 1, parts[2]);
  const search = getSearchDate();
  const searchDay = new Date(search.getFullYear(), search.getMonth(), search.getDate());

  return Math.round((searchDay - post) / 86400000);
}

function updatePostDateRange() {
  const search = getSearchDate();
  const maxDate = new Date(search.getFullYear(), search.getMonth(), search.getDate());
  const minDate = new Date(search.getFullYear(), search.getMonth(), search.getDate() - MUST_MAX_DAYS);

  $("#postDate").max = localDateString(maxDate);
  $("#postDate").min = localDateString(minDate);

  const current = $("#postDate").value;
  if (current && (current < $("#postDate").min || current > $("#postDate").max)) {
    $("#postDate").value = "";
  }
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
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function savePassed() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(passedItems));
}

function setResult(el, message, kind) {
  el.hidden = false;
  el.className = "result-box " + kind;
  el.innerHTML = message;
}

function buildSearchLinks() {
  const tags = parseHashtags($("#hashtags").value);
  const box = $("#searchLinks");

  if (!tags.length) {
    box.innerHTML = '<p class="empty small">#ハッシュタグを入力してください。</p>';
    return;
  }

  box.innerHTML = tags.map(tag => {
    const url = "https://www.instagram.com/explore/tags/" + encodeURIComponent(tag) + "/";
    return `
      <a class="search-link" href="${url}" target="_blank" rel="noopener">
        <span>#${escapeHtml(tag)}</span>
        <strong>Instagramで開く →</strong>
      </a>`;
  }).join("");
}

function currentCandidate() {
  return {
    url: normalizeUrl($("#reelUrl").value),
    followers: Number($("#followers").value),
    posts: Number($("#posts").value),
    searchDate: $("#searchDate").value,
    date: $("#postDate").value
  };
}

function screenCandidate() {
  const item = currentCandidate();
  const result = $("#screenResult");
  const stage2 = $("#stage2");
  stage2.hidden = true;
  $("#ratioResult").hidden = true;

  if (!item.url || !isInstagramPostUrl(item.url)) {
    return setResult(result, "InstagramのリールURLを入れてください。", "ng");
  }
  if (!Number.isFinite(item.followers) || item.followers <= 0) {
    return setResult(result, "フォロワー数を入力してください。", "ng");
  }
  if (!Number.isFinite(item.posts) || item.posts <= 0) {
    return setResult(result, "総投稿数を入力してください。", "ng");
  }
  if (!item.date) {
    return setResult(result, "投稿日を入力してください。", "ng");
  }

  const days = daysFromSearchDate(item.date);
  const checks = [
    {
      ok: item.followers >= MUST_FOLLOWERS,
      okText: `✓ フォロワー ${formatNum(item.followers)}人`,
      ngText: `✕ フォロワー ${formatNum(item.followers)}人（10,000人未満）`
    },
    {
      ok: item.posts < MUST_MAX_POSTS_EXCLUSIVE,
      okText: `✓ 投稿数 ${formatNum(item.posts)}`,
      ngText: `✕ 投稿数 ${formatNum(item.posts)}（180投稿以上）`
    },
    {
      ok: days >= 0 && days <= MUST_MAX_DAYS,
      okText: `✓ 投稿日 検索日から${days}日前`,
      ngText: days < 0 ? "✕ 投稿日が検索日より後になっています" : `✕ 投稿日 検索日から${days}日前（7日超過）`
    }
  ];

  const passed = checks.every(c => c.ok);
  const html = checks.map(c =>
    `<div class="check-line ${c.ok ? "ok" : "bad"}">${escapeHtml(c.ok ? c.okText : c.ngText)}</div>`
  ).join("");

  if (!passed) {
    return setResult(result, '<strong>この候補はここで除外</strong>' + html, "ng");
  }

  setResult(result, '<strong>必須3条件クリア</strong>' + html, "ok");
  stage2.hidden = false;
  const target = Math.ceil(item.followers * MIN_RATIO);
  $("#targetViews").innerHTML =
    `3倍クリアの目安：<strong>${formatNum(target)}再生以上</strong>`;
  setTimeout(() => $("#views").focus(), 50);
}

function ratioCheck() {
  const item = currentCandidate();
  const views = Number($("#views").value);
  const result = $("#ratioResult");

  if (!Number.isFinite(views) || views <= 0) {
    return setResult(result, "再生数を入力してください。", "ng");
  }

  const days = daysFromSearchDate(item.date);
  if (
    item.followers < MUST_FOLLOWERS ||
    item.posts >= MUST_MAX_POSTS_EXCLUSIVE ||
    days < 0 ||
    days > MUST_MAX_DAYS
  ) {
    $("#stage2").hidden = true;
    return setResult($("#screenResult"), "入力内容が変わりました。もう一度3条件を判定してください。", "ng");
  }

  const ratio = views / item.followers;
  if (ratio < MIN_RATIO) {
    return setResult(
      result,
      `<strong>${ratio.toFixed(2)}倍 → 3倍未満</strong><br>この候補は保存しません。`,
      "ng"
    );
  }

  const saved = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    url: item.url,
    followers: item.followers,
    posts: item.posts,
    searchDate: item.searchDate,
    date: item.date,
    days,
    views,
    ratio,
    savedAt: new Date().toISOString()
  };

  const existingIndex = passedItems.findIndex(x => x.url === saved.url);
  if (existingIndex >= 0) passedItems[existingIndex] = saved;
  else passedItems.unshift(saved);

  savePassed();
  renderPassed();

  setResult(
    result,
    `<strong>🎯 ${ratio.toFixed(2)}倍でクリア</strong><br>③の一覧に保存しました。`,
    "ok"
  );
}

function resetForm() {
  $("#reelUrl").value = "";
  $("#followers").value = "";
  $("#posts").value = "";
  $("#postDate").value = "";
  $("#views").value = "";
  $("#screenResult").hidden = true;
  $("#ratioResult").hidden = true;
  $("#stage2").hidden = true;
  $("#shareBadge").hidden = true;
  window.scrollTo({ top: $("#reelUrl").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  $("#reelUrl").focus();
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
        <span>🔎 ${escapeHtml(x.searchDate || "")} 検索</span>
        <span>📅 ${escapeHtml(x.date)}（検索日から${x.days}日前）</span>
      </div>

      <div class="saved-url">${escapeHtml(x.url)}</div>

      <div class="url-actions">
        <a class="open-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">リールを開く</a>
        <button class="copy-btn" data-url="${escapeHtml(x.url)}">URLコピー</button>
      </div>
    </article>
  `).join("");
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "コピー済み";
    setTimeout(() => button.textContent = old, 1000);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
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
    ["followers","posts","search_date","post_date","days_from_search","views","ratio","url"],
    ...passedItems.map(x => [
      x.followers, x.posts, x.searchDate || "", x.date, x.days, x.views, Number(x.ratio).toFixed(2), x.url
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
    setTimeout(() => $("#followers").focus(), 50);
  }
}

$("#makeSearchBtn").addEventListener("click", buildSearchLinks);
$("#screenBtn").addEventListener("click", screenCandidate);
$("#ratioBtn").addEventListener("click", ratioCheck);
$("#resetBtn").addEventListener("click", resetForm);
$("#exportBtn").addEventListener("click", exportCsv);

$("#clearPassedBtn").addEventListener("click", () => {
  if (!passedItems.length) return;
  if (!confirm("保存した条件一致結果をすべて消しますか？")) return;
  passedItems = [];
  savePassed();
  renderPassed();
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

$("#reelUrl").addEventListener("paste", () => {
  setTimeout(() => {
    $("#reelUrl").value = normalizeUrl($("#reelUrl").value);
  }, 0);
});

const today = new Date();
$("#searchDate").value = localDateString(today);
updatePostDateRange();

$("#searchDate").addEventListener("change", () => {
  updatePostDateRange();
  $("#screenResult").hidden = true;
  $("#ratioResult").hidden = true;
  $("#stage2").hidden = true;
});

renderPassed();
receiveSharedUrl();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
