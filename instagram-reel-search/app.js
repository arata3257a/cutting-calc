const $ = (s) => document.querySelector(s);
const template = $("#rowTemplate");
const list = $("#inputList");
const results = $("#results");
const count = $("#count");

function addCandidate(data = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".username").value = data.username || "";
  node.querySelector(".followers").value = data.followers || "";
  node.querySelector(".posts").value = data.posts || "";
  node.querySelector(".views").value = data.views || "";
  node.querySelector(".date").value = data.date || "";
  node.querySelector(".url").value = data.url || "";
  node.querySelector(".remove").addEventListener("click", () => node.remove());
  list.appendChild(node);
}

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const now = new Date();
  const d = new Date(dateString + "T00:00:00");
  const diff = now - d;
  return Math.floor(diff / 86400000);
}

function readCandidates() {
  return [...document.querySelectorAll(".candidate")].map((row) => {
    const followers = Number(row.querySelector(".followers").value);
    const posts = Number(row.querySelector(".posts").value);
    const views = Number(row.querySelector(".views").value);
    const date = row.querySelector(".date").value;
    return {
      username: row.querySelector(".username").value.trim() || "(名称なし)",
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

function runFilter() {
  const minFollowers = Number($("#minFollowers").value);
  const maxPosts = Number($("#maxPosts").value);
  const minRatio = Number($("#minRatio").value);
  const maxDays = Number($("#maxDays").value);
  const bestDays = Number($("#bestDays").value);

  const filtered = readCandidates()
    .filter(x =>
      x.followers >= minFollowers &&
      x.posts <= maxPosts &&
      x.ratio >= minRatio &&
      x.days >= 0 &&
      x.days <= maxDays
    )
    .sort((a,b) => {
      const aBest = a.days <= bestDays ? 1 : 0;
      const bBest = b.days <= bestDays ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      if (a.ratio !== b.ratio) return b.ratio - a.ratio;
      return a.days - b.days;
    });

  render(filtered, bestDays);
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
  count.textContent = items.length + "件";
  if (!items.length) {
    results.innerHTML = '<p class="empty">条件に合う候補はありません。</p>';
    return;
  }
  results.innerHTML = items.map(x => {
    const best = x.days <= bestDays;
    const link = x.url
      ? '<a class="link" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">Instagramで見る →</a>'
      : "";
    return `
      <article class="card ${best ? "best" : ""}">
        <div class="topline">
          <strong>${escapeHtml(x.username)}</strong>
          <span class="tag">${best ? "🔥 7日以内" : "14日以内"}</span>
        </div>
        <div class="ratio">${x.ratio.toFixed(2)}倍</div>
        <div class="meta">
          <span>👥 ${formatNum(x.followers)}人</span>
          <span>🎞 ${formatNum(x.posts)}投稿</span>
          <span>▶ ${formatNum(x.views)}再生</span>
          <span>🗓 ${x.days}日前</span>
        </div>
        ${link}
      </article>`;
  }).join("");
}

$("#addBtn").addEventListener("click", () => addCandidate());
$("#runBtn").addEventListener("click", runFilter);

addCandidate();
