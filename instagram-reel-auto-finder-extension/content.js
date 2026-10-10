(() => {
  if (window.__reelAutoFinderLoaded) return;
  window.__reelAutoFinderLoaded = true;

  const RULES = {
    minFollowers: 10000,
    maxPostsExclusive: 180,
    maxDays: 7,
    minRatio: 3
  };

  const STORAGE = {
    tags: "reelAutoFinderTags",
    limit: "reelAutoFinderLimit",
    state: "reelAutoFinderState",
    results: "reelAutoFinderResults"
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);

  function formatNum(n) {
    return new Intl.NumberFormat("ja-JP").format(Number(n) || 0);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function parseCompactNumber(value) {
    if (value == null) return NaN;
    let s = String(value).trim().replace(/[\s,，]/g, "");
    if (!s) return NaN;
    s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace("．", ".");
    const m = s.match(/^([0-9]+(?:\.[0-9]+)?)([KkMmBb万])?$/);
    if (!m) return Number(s);
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return NaN;
    const u = m[2];
    if (!u) return n;
    if (u === "K" || u === "k") return Math.round(n * 1000);
    if (u === "M" || u === "m") return Math.round(n * 1000000);
    if (u === "B" || u === "b") return Math.round(n * 1000000000);
    if (u === "万") return Math.round(n * 10000);
    return n;
  }

  function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  function setStorage(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
  }

  function removeStorage(keys) {
    return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
  }

  function reelCodeFromUrl(url) {
    const m = String(url).match(/\/reel\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : "";
  }

  function normalizeInstagramUrl(url) {
    try {
      const u = new URL(url, location.origin);
      if (!u.hostname.endsWith("instagram.com")) return "";
      u.search = "";
      u.hash = "";
      return u.toString();
    } catch {
      return "";
    }
  }

  function metaContent(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const value = el?.getAttribute("content");
      if (value) return value;
    }
    return "";
  }

  function firstRegexNumber(text, patterns) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
    return NaN;
  }

  function firstRegexString(text, patterns) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) return m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    }
    return "";
  }

  function parseReelHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const code = reelCodeFromUrl(url);
    let scoped = html;
    if (code) {
      const idx = html.indexOf(code);
      if (idx >= 0) scoped = html.slice(Math.max(0, idx - 80000), Math.min(html.length, idx + 180000));
    }

    const ogTitle = metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    const ogDescription = metaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]']);

    let username = "";
    let m = ogTitle.match(/^@?([A-Za-z0-9._]+)\s+on\s+Instagram/i);
    if (m) username = m[1];
    if (!username) {
      m = ogDescription.match(/[-–]\s*@?([A-Za-z0-9._]+)\s+on\s+/i);
      if (m) username = m[1];
    }
    if (!username) {
      username = firstRegexString(scoped, [
        /"owner"\s*:\s*\{[^{}]{0,1500}?"username"\s*:\s*"([A-Za-z0-9._]+)"/,
        /"username"\s*:\s*"([A-Za-z0-9._]+)"/
      ]);
    }

    const views = firstRegexNumber(scoped, [
      /"video_view_count"\s*:\s*(\d+)/,
      /"video_play_count"\s*:\s*(\d+)/,
      /"play_count"\s*:\s*(\d+)/,
      /"view_count"\s*:\s*(\d+)/
    ]);

    let timestamp = firstRegexNumber(scoped, [
      /"taken_at_timestamp"\s*:\s*(\d{10})/,
      /"taken_at"\s*:\s*(\d{10})/,
      /"created_at"\s*:\s*(\d{10})/
    ]);

    if (!Number.isFinite(timestamp)) {
      const published = metaContent(doc, ['meta[property="article:published_time"]']);
      const d = published ? new Date(published) : null;
      if (d && !Number.isNaN(d.getTime())) timestamp = Math.floor(d.getTime() / 1000);
    }

    return { username, views, timestamp };
  }

  function parseProfileHtml(html, expectedUsername) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const desc = metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]']);

    let followers = NaN;
    let posts = NaN;

    const english = desc.match(/([\d.,KkMmBb]+)\s+Followers?.*?([\d.,KkMmBb]+)\s+Following.*?([\d.,KkMmBb]+)\s+Posts?/i);
    if (english) {
      followers = parseCompactNumber(english[1]);
      posts = parseCompactNumber(english[3]);
    }

    if (!Number.isFinite(followers)) {
      const f = desc.match(/(?:フォロワー|followers?)\s*[:：]?\s*([\d.,KkMmBb万]+)/i) ||
                desc.match(/([\d.,KkMmBb万]+)\s*(?:人)?\s*(?:の)?フォロワー/i);
      if (f) followers = parseCompactNumber(f[1]);
    }

    if (!Number.isFinite(posts)) {
      const p = desc.match(/(?:投稿|posts?)\s*[:：]?\s*([\d.,KkMmBb万]+)/i) ||
                desc.match(/([\d.,KkMmBb万]+)\s*(?:件)?\s*(?:の)?投稿/i);
      if (p) posts = parseCompactNumber(p[1]);
    }

    if (!Number.isFinite(followers)) {
      followers = firstRegexNumber(html, [
        /"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
        /"follower_count"\s*:\s*(\d+)/,
        /"followers_count"\s*:\s*(\d+)/
      ]);
    }

    if (!Number.isFinite(posts)) {
      posts = firstRegexNumber(html, [
        /"edge_owner_to_timeline_media"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
        /"media_count"\s*:\s*(\d+)/,
        /"posts_count"\s*:\s*(\d+)/
      ]);
    }

    return { username: expectedUsername, followers, posts };
  }

  function daysSince(timestamp) {
    if (!Number.isFinite(timestamp)) return Infinity;
    const posted = new Date(timestamp * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const postDay = new Date(posted.getFullYear(), posted.getMonth(), posted.getDate());
    return Math.floor((today - postDay) / 86400000);
  }

  async function fetchText(url) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Accept": "text/html,application/xhtml+xml" },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function inspectReel(url, profileCache) {
    try {
      const reelHtml = await fetchText(url);
      const reel = parseReelHtml(reelHtml, url);
      const days = daysSince(reel.timestamp);

      if (!reel.username || !Number.isFinite(reel.views) || !Number.isFinite(reel.timestamp)) {
        return { url, status: "parse_failed", username: reel.username || "", views: reel.views, days };
      }

      let profile = profileCache[reel.username.toLowerCase()];
      if (!profile) {
        const profileUrl = `https://www.instagram.com/${encodeURIComponent(reel.username)}/`;
        const profileHtml = await fetchText(profileUrl);
        profile = parseProfileHtml(profileHtml, reel.username);
        profileCache[reel.username.toLowerCase()] = profile;
      }

      const followers = Number(profile.followers);
      const posts = Number(profile.posts);
      const ratio = followers > 0 ? reel.views / followers : 0;
      const passed =
        Number.isFinite(followers) && followers >= RULES.minFollowers &&
        Number.isFinite(posts) && posts < RULES.maxPostsExclusive &&
        days >= 0 && days <= RULES.maxDays &&
        ratio >= RULES.minRatio;

      return {
        url,
        username: reel.username,
        followers,
        posts,
        views: reel.views,
        timestamp: reel.timestamp,
        days,
        ratio,
        passed,
        status: passed ? "passed" : "filtered"
      };
    } catch (err) {
      return { url, status: "fetch_failed", error: String(err?.message || err) };
    }
  }

  function discoverVisibleReelLinks() {
    const links = new Set();
    document.querySelectorAll('a[href*="/reel/"]').forEach(a => {
      const url = normalizeInstagramUrl(a.href);
      if (url) links.add(url);
    });
    return [...links];
  }

  async function autoScrollCollect(limit, onUpdate) {
    const found = new Set(discoverVisibleReelLinks());
    let stableRounds = 0;
    let lastSize = found.size;

    for (let i = 0; i < 14 && found.size < limit && stableRounds < 3; i++) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(1100);
      discoverVisibleReelLinks().forEach(x => found.add(x));
      onUpdate?.(found.size);

      if (found.size === lastSize) stableRounds++;
      else stableRounds = 0;
      lastSize = found.size;
    }

    return [...found].slice(0, limit);
  }

  function makePanel() {
    const root = document.createElement("section");
    root.id = "reel-auto-finder-panel";
    root.innerHTML = `
      <button id="raf-toggle" title="開閉">発掘</button>
      <div id="raf-body">
        <div class="raf-head">
          <strong>リール自動発掘</strong>
          <button id="raf-close">×</button>
        </div>
        <div class="raf-rules">
          <span>1万人以上</span><span>180投稿未満</span><span>7日以内</span><span>3倍以上</span>
        </div>
        <label>検索タグ
          <input id="raf-tags" placeholder="加工 DIY 工具">
        </label>
        <label>1タグの確認数
          <select id="raf-limit"><option>20</option><option selected>40</option><option>60</option></select>
        </label>
        <button id="raf-start" class="raf-primary">自動発掘スタート</button>
        <button id="raf-stop" class="raf-secondary" hidden>停止</button>
        <div id="raf-status">準備完了</div>
        <div class="raf-summary">
          <span>合格 <strong id="raf-pass-count">0</strong></span>
          <span>確認 <strong id="raf-scan-count">0</strong></span>
          <span>取得不可 <strong id="raf-fail-count">0</strong></span>
        </div>
        <div id="raf-results"></div>
        <div class="raf-actions">
          <button id="raf-copy-all">URL一括コピー</button>
          <button id="raf-clear">結果消去</button>
        </div>
        <div class="raf-note">Instagramの表示仕様変更で取得できない投稿は合格にしません。</div>
      </div>`;
    document.documentElement.appendChild(root);
    return root;
  }

  const panel = makePanel();
  const body = $("#raf-body", panel);
  const status = $("#raf-status", panel);
  const resultsBox = $("#raf-results", panel);

  function setStatus(text, kind = "") {
    status.textContent = text;
    status.className = kind ? `raf-${kind}` : "";
  }

  async function renderStoredResults() {
    const stored = await getStorage([STORAGE.results]);
    const items = Array.isArray(stored[STORAGE.results]) ? stored[STORAGE.results] : [];
    const passed = items.filter(x => x.passed);
    const failed = items.filter(x => x.status === "parse_failed" || x.status === "fetch_failed");

    $("#raf-pass-count", panel).textContent = passed.length;
    $("#raf-scan-count", panel).textContent = items.length;
    $("#raf-fail-count", panel).textContent = failed.length;

    resultsBox.innerHTML = passed.length ? passed.map(x => `
      <article class="raf-card">
        <div class="raf-card-top"><strong>@${escapeHtml(x.username)}</strong><b>${Number(x.ratio).toFixed(2)}倍</b></div>
        <div class="raf-meta"><span>👥 ${formatNum(x.followers)}</span><span>🎞 ${formatNum(x.posts)}</span><span>▶ ${formatNum(x.views)}</span><span>📅 ${x.days}日前</span></div>
        <a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">リールを開く</a>
      </article>`).join("") : '<p class="raf-empty">条件一致はまだありません。</p>';
  }

  async function loadSettings() {
    const data = await getStorage([STORAGE.tags, STORAGE.limit]);
    $("#raf-tags", panel).value = data[STORAGE.tags] || "";
    $("#raf-limit", panel).value = String(data[STORAGE.limit] || 40);
    renderStoredResults();
  }

  async function startScan() {
    const tags = $("#raf-tags", panel).value
      .split(/[\s,、#]+/)
      .map(x => x.trim())
      .filter(Boolean);
    const uniqueTags = [...new Set(tags)];
    const limit = Number($("#raf-limit", panel).value) || 40;

    if (!uniqueTags.length) {
      setStatus("検索タグを入力してください", "error");
      return;
    }

    await setStorage({
      [STORAGE.tags]: uniqueTags.join(" "),
      [STORAGE.limit]: limit,
      [STORAGE.results]: [],
      [STORAGE.state]: {
        running: true,
        tags: uniqueTags,
        index: 0,
        limit,
        seen: [],
        profileCache: {}
      }
    });

    setStatus("検索ページへ移動します…", "running");
    location.href = `https://www.instagram.com/explore/tags/${encodeURIComponent(uniqueTags[0])}/`;
  }

  async function continueScanIfNeeded() {
    const data = await getStorage([STORAGE.state, STORAGE.results]);
    const state = data[STORAGE.state];
    if (!state?.running) return;

    $("#raf-stop", panel).hidden = false;
    $("#raf-start", panel).hidden = true;

    const tag = state.tags[state.index];
    if (!tag) {
      state.running = false;
      await setStorage({ [STORAGE.state]: state });
      setStatus("全タグの発掘が完了しました", "success");
      $("#raf-stop", panel).hidden = true;
      $("#raf-start", panel).hidden = false;
      renderStoredResults();
      return;
    }

    const wantedPath = `/explore/tags/${encodeURIComponent(tag)}/`;
    if (!location.pathname.startsWith(wantedPath)) {
      setStatus(`#${tag} へ移動中…`, "running");
      location.href = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
      return;
    }

    setStatus(`#${tag} のリールを読み込み中…`, "running");
    await sleep(1800);

    const links = await autoScrollCollect(state.limit, n => {
      setStatus(`#${tag} 候補 ${n}件を収集中…`, "running");
    });

    const seen = new Set(state.seen || []);
    const targets = links.filter(x => !seen.has(x));
    let allResults = Array.isArray(data[STORAGE.results]) ? data[STORAGE.results] : [];

    for (let i = 0; i < targets.length; i++) {
      const current = targets[i];
      setStatus(`#${tag} ${i + 1}/${targets.length} を判定中…`, "running");
      const item = await inspectReel(current, state.profileCache || {});
      allResults.push({ ...item, tag });
      seen.add(current);
      state.seen = [...seen];
      await setStorage({ [STORAGE.results]: allResults, [STORAGE.state]: state });
      if (i % 3 === 2) await renderStoredResults();
      await sleep(250);
    }

    await renderStoredResults();

    state.index += 1;
    await setStorage({ [STORAGE.state]: state, [STORAGE.results]: allResults });

    if (state.index >= state.tags.length) {
      state.running = false;
      await setStorage({ [STORAGE.state]: state });
      setStatus(`完了：${state.tags.length}タグを確認しました`, "success");
      $("#raf-stop", panel).hidden = true;
      $("#raf-start", panel).hidden = false;
      return;
    }

    const nextTag = state.tags[state.index];
    setStatus(`次：#${nextTag}`, "running");
    await sleep(700);
    location.href = `https://www.instagram.com/explore/tags/${encodeURIComponent(nextTag)}/`;
  }

  $("#raf-toggle", panel).addEventListener("click", () => {
    body.classList.toggle("raf-hidden");
  });

  $("#raf-close", panel).addEventListener("click", () => body.classList.add("raf-hidden"));
  $("#raf-start", panel).addEventListener("click", startScan);

  $("#raf-stop", panel).addEventListener("click", async () => {
    const data = await getStorage([STORAGE.state]);
    const state = data[STORAGE.state] || {};
    state.running = false;
    await setStorage({ [STORAGE.state]: state });
    setStatus("停止しました");
    $("#raf-stop", panel).hidden = true;
    $("#raf-start", panel).hidden = false;
  });

  $("#raf-copy-all", panel).addEventListener("click", async () => {
    const data = await getStorage([STORAGE.results]);
    const urls = (data[STORAGE.results] || []).filter(x => x.passed).map(x => x.url);
    if (!urls.length) return setStatus("コピーする合格URLがありません", "error");
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      setStatus(`${urls.length}件のURLをコピーしました`, "success");
    } catch {
      setStatus("コピーできませんでした", "error");
    }
  });

  $("#raf-clear", panel).addEventListener("click", async () => {
    await removeStorage([STORAGE.results, STORAGE.state]);
    setStatus("結果を消去しました");
    renderStoredResults();
  });

  loadSettings().then(() => setTimeout(continueScanIfNeeded, 700));
})();
