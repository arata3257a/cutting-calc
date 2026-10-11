package com.arata.conditionreelfinder;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {

    private static final int MIN_FOLLOWERS = 10_000;
    private static final int MAX_POSTS_EXCLUSIVE = 180;
    private static final int MIN_DAYS = 7;
    private static final int MAX_DAYS = 14;
    private static final double MIN_RATIO = 3.0;

    private static final String PREFS = "condition_reel_finder";
    private static final String PREF_RESULTS = "results";

    private final Handler handler = new Handler(Looper.getMainLooper());

    private WebView webView;
    private Spinner limitSpinner;
    private TextView statusView;
    private Button startButton;
    private Button stopButton;
    private Button resultsButton;

    private boolean running = false;
    private Stage stage = Stage.HOME;
    private boolean stageHandled = false;

    private final List<String> currentReels = new ArrayList<>();
    private final Set<String> processedReels = new HashSet<>();
    private int reelIndex = 0;
    private int scrollRound = 0;
    private int candidateLimit = 20;
    private int feedMode = 0;
    private int checkedCount = 0;

    private String currentReelUrl = "";
    private ReelMeta currentReel;

    private final List<ResultItem> results = new ArrayList<>();

    private enum Stage {
        HOME, FEED, REEL, PROFILE
    }

    private static class ReelMeta {
        String username = "";
        long views = 0;
        String datetime = "";
        long days = Long.MAX_VALUE;
    }

    private static class ResultItem {
        String username;
        String url;
        long followers;
        long posts;
        long views;
        long days;
        double ratio;

        JSONObject toJson() throws JSONException {
            JSONObject o = new JSONObject();
            o.put("username", username);
            o.put("url", url);
            o.put("followers", followers);
            o.put("posts", posts);
            o.put("views", views);
            o.put("days", days);
            o.put("ratio", ratio);
            return o;
        }

        static ResultItem fromJson(JSONObject o) {
            ResultItem r = new ResultItem();
            r.username = o.optString("username", "");
            r.url = o.optString("url", "");
            r.followers = o.optLong("followers", 0);
            r.posts = o.optLong("posts", 0);
            r.views = o.optLong("views", 0);
            r.days = o.optLong("days", 0);
            r.ratio = o.optDouble("ratio", 0);
            return r;
        }
    }

    private static final String JS_EXTRACT_REELS = """
        (function(){
          const urls = Array.from(document.querySelectorAll('a[href*="/reel/"]'))
            .map(a => {
              try {
                const u = new URL(a.href, location.origin);
                u.search = '';
                u.hash = '';
                return u.toString();
              } catch(e) { return ''; }
            })
            .filter(Boolean);
          return JSON.stringify(Array.from(new Set(urls)));
        })();
        """;

    private static final String JS_SCROLL = "window.scrollBy(0, Math.max(window.innerHeight * 3, 2600));";

    private static final String JS_PARSE_REEL = """
        (function(){
          const body = document.body?.innerText || '';
          const meta = [
            document.querySelector('meta[name="description"]')?.content || '',
            document.querySelector('meta[property="og:description"]')?.content || '',
            document.querySelector('meta[property="og:title"]')?.content || ''
          ].join('\\n');
          const raw = (body + '\\n' + meta).replace(/\\u00a0/g, ' ');

          const reserved = new Set(['explore','reels','reel','p','accounts','direct','stories','about','legal','privacy','developer','web']);
          let username = '';
          const scopes = [document.querySelector('article'), document];

          for (const scope of scopes) {
            if (!scope || username) continue;
            const anchors = Array.from(scope.querySelectorAll('a[href^="/"]'));
            for (const a of anchors) {
              const href = (a.getAttribute('href') || '').split('?')[0];
              const parts = href.split('/').filter(Boolean);
              if (parts.length !== 1) continue;
              const name = parts[0];
              if (reserved.has(name.toLowerCase())) continue;
              if (!/^[A-Za-z0-9._]+$/.test(name)) continue;
              username = name;
              break;
            }
          }

          if (!username) {
            const og = document.querySelector('meta[property="og:title"]')?.content || '';
            const m = og.match(/^@?([A-Za-z0-9._]+)\\s/);
            if (m) username = m[1];
          }

          let datetime = document.querySelector('time')?.getAttribute('datetime') || '';
          if (!datetime) {
            const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const s of ld) {
              try {
                const data = JSON.parse(s.textContent || '{}');
                const list = Array.isArray(data) ? data : [data];
                for (const item of list) {
                  if (item && (item.uploadDate || item.datePublished)) {
                    datetime = item.uploadDate || item.datePublished;
                    break;
                  }
                }
              } catch(e) {}
              if (datetime) break;
            }
          }

          function parseNum(v) {
            if (!v) return 0;
            let s = String(v).replace(/[\\s,，]/g,'')
              .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0))
              .replace('．','.');
            const m = s.match(/^([0-9]+(?:\\.[0-9]+)?)(万|[KkMmBb])?$/);
            if (!m) return Number(s) || 0;
            let n = Number(m[1]);
            const u = m[2];
            if (u === '万') n *= 10000;
            else if (u === 'K' || u === 'k') n *= 1000;
            else if (u === 'M' || u === 'm') n *= 1000000;
            else if (u === 'B' || u === 'b') n *= 1000000000;
            return Math.round(n);
          }

          let views = 0;
          const patterns = [
            /(?:再生数|再生|views?|plays?)\\s*[:：]?\\s*([0-9０-９.,．万KkMmBb]+)/i,
            /([0-9０-９.,．万KkMmBb]+)\\s*(?:回)?\\s*(?:再生|views?|plays?)/i
          ];

          for (const p of patterns) {
            const m = raw.match(p);
            if (m) {
              views = parseNum(m[1]);
              if (views) break;
            }
          }

          if (!views) {
            const labels = Array.from(document.querySelectorAll('[aria-label],[title]'))
              .map(n => (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('title') || ''))
              .join('\\n');
            for (const p of patterns) {
              const m = labels.match(p);
              if (m) {
                views = parseNum(m[1]);
                if (views) break;
              }
            }
          }

          if (!views) {
            const scripts = Array.from(document.scripts)
              .map(s => s.textContent || '')
              .filter(t => /play_count|video_play_count|view_count/.test(t));
            const scriptPatterns = [
              /\"play_count\"\\s*:\\s*([0-9]+)/i,
              /\"video_play_count\"\\s*:\\s*([0-9]+)/i,
              /\"view_count\"\\s*:\\s*([0-9]+)/i
            ];
            for (const text of scripts) {
              for (const p of scriptPatterns) {
                const m = text.match(p);
                if (m) {
                  const n = Number(m[1]);
                  if (n > views) views = n;
                }
              }
            }
          }

          return JSON.stringify({username, views, datetime});
        })();
        """;

    private static final String JS_PARSE_PROFILE = """
        (function(){
          const meta = document.querySelector('meta[name="description"]')?.content || '';
          const og = document.querySelector('meta[property="og:description"]')?.content || '';
          const header = document.querySelector('header')?.innerText || '';
          const body = (document.body?.innerText || '').slice(0, 7000);
          const raw = [meta, og, header, body].join('\\n').replace(/\\u00a0/g, ' ');

          function parseNum(v) {
            if (!v) return 0;
            let s = String(v).replace(/[\\s,，]/g,'')
              .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0))
              .replace('．','.');
            const m = s.match(/^([0-9]+(?:\\.[0-9]+)?)(万|[KkMmBb])?$/);
            if (!m) return Number(s) || 0;
            let n = Number(m[1]);
            const u = m[2];
            if (u === '万') n *= 10000;
            else if (u === 'K' || u === 'k') n *= 1000;
            else if (u === 'M' || u === 'm') n *= 1000000;
            else if (u === 'B' || u === 'b') n *= 1000000000;
            return Math.round(n);
          }

          function firstNumber(patterns) {
            for (const p of patterns) {
              const m = raw.match(p);
              if (m) {
                const n = parseNum(m[1]);
                if (n) return n;
              }
            }
            return 0;
          }

          const followers = firstNumber([
            /([0-9０-９.,．万KkMmBb]+)\\s*(?:Followers|フォロワー)/i,
            /(?:Followers|フォロワー)\\s*[:：]?\\s*([0-9０-９.,．万KkMmBb]+)/i
          ]);

          const posts = firstNumber([
            /([0-9０-９.,．万KkMmBb]+)\\s*(?:Posts|投稿)/i,
            /(?:Posts|投稿)\\s*[:：]?\\s*([0-9０-９.,．万KkMmBb]+)/i,
            /([0-9０-９.,．万KkMmBb]+)\\s*件?(?:の)?投稿/i
          ]);

          return JSON.stringify({followers, posts});
        })();
        """;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(17, 24, 39));

        loadResults();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(243, 244, 246));
        root.setPadding(dp(10), dp(10), dp(10), dp(10));

        TextView title = new TextView(this);
        title.setText("条件一致リール発掘");
        title.setTextSize(22);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(null, 1);
        root.addView(title, matchWrap());

        TextView rules = new TextView(this);
        rules.setText("1万人以上 / 180投稿未満 / 7〜14日前 / 再生3倍以上");
        rules.setTextSize(11);
        rules.setTextColor(Color.rgb(75, 85, 99));
        rules.setPadding(0, dp(3), 0, dp(5));
        root.addView(rules, matchWrap());

        TextView source = new TextView(this);
        source.setText("キーワードなし。Instagramの発見・おすすめから候補を選別します。");
        source.setTextSize(11);
        source.setTextColor(Color.rgb(75, 85, 99));
        source.setPadding(0, 0, 0, dp(8));
        root.addView(source, matchWrap());

        LinearLayout limitRow = new LinearLayout(this);
        limitRow.setOrientation(LinearLayout.HORIZONTAL);
        limitRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView limitLabel = new TextView(this);
        limitLabel.setText("確認する候補数");
        limitLabel.setTextSize(12);
        limitLabel.setTextColor(Color.rgb(55, 65, 81));
        limitRow.addView(limitLabel, new LinearLayout.LayoutParams(0, dp(48), 1f));

        limitSpinner = new Spinner(this);
        String[] limits = {"10件", "20件", "30件"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, limits);
        limitSpinner.setAdapter(adapter);
        limitSpinner.setSelection(1);
        limitRow.addView(limitSpinner, new LinearLayout.LayoutParams(dp(110), dp(48)));
        root.addView(limitRow, matchWrap());

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);

        startButton = makeButton("自動発掘スタート");
        stopButton = makeButton("停止");
        resultsButton = makeButton("結果 0件");

        buttonRow.addView(startButton, weighted());
        buttonRow.addView(stopButton, weighted());
        buttonRow.addView(resultsButton, weighted());
        root.addView(buttonRow, matchWrap());

        statusView = new TextView(this);
        statusView.setText("下のInstagramが表示されたらスタートしてください。Instagram側がログインを求めた場合はログインが必要です。");
        statusView.setTextSize(12);
        statusView.setTextColor(Color.rgb(55, 65, 81));
        statusView.setPadding(dp(8), dp(8), dp(8), dp(8));
        statusView.setBackgroundColor(Color.WHITE);
        root.addView(statusView, matchWrap());

        webView = new WebView(this);
        LinearLayout.LayoutParams webLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        webLp.topMargin = dp(8);
        root.addView(webView, webLp);

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                if (url != null && url.contains("/accounts/login")) {
                    if (running) {
                        running = false;
                        status("Instagram側からログインを求められました。ログイン後、もう一度スタートしてください。");
                    }
                    stage = Stage.HOME;
                    return;
                }

                if (!running || stageHandled) return;
                stageHandled = true;

                Stage expected = stage;
                handler.postDelayed(() -> {
                    if (!running || stage != expected) return;
                    if (expected == Stage.FEED) collectFeedReels();
                    else if (expected == Stage.REEL) parseReelPage();
                    else if (expected == Stage.PROFILE) parseProfilePage();
                }, expected == Stage.FEED ? 2400 : 1800);
            }
        });

        startButton.setOnClickListener(v -> startSearch());
        stopButton.setOnClickListener(v -> stopSearch("停止しました。"));
        resultsButton.setOnClickListener(v -> showResults());

        updateResultButton();
        webView.loadUrl("https://www.instagram.com/explore/");
    }

    private Button makeButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(11);
        b.setAllCaps(false);
        return b;
    }

    private LinearLayout.LayoutParams weighted() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
        lp.setMargins(dp(2), dp(3), dp(2), dp(5));
        return lp;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void startSearch() {
        String limitText = String.valueOf(limitSpinner.getSelectedItem());
        candidateLimit = limitText.startsWith("10") ? 10 : limitText.startsWith("30") ? 30 : 20;

        running = true;
        stageHandled = false;
        processedReels.clear();
        currentReels.clear();
        reelIndex = 0;
        scrollRound = 0;
        feedMode = 0;
        checkedCount = 0;
        status("発見・おすすめから候補リールを収集中…");
        load(Stage.FEED, "https://www.instagram.com/explore/");
    }

    private void stopSearch(String message) {
        running = false;
        stage = Stage.HOME;
        stageHandled = false;
        handler.removeCallbacksAndMessages(null);
        status(message);
    }

    private void collectFeedReels() {
        if (!running || stage != Stage.FEED) return;

        webView.evaluateJavascript(JS_EXTRACT_REELS, value -> {
            if (!running || stage != Stage.FEED) return;

            String decoded = decodeJsString(value);
            try {
                JSONArray arr = new JSONArray(decoded.isEmpty() ? "[]" : decoded);
                for (int i = 0; i < arr.length(); i++) {
                    String url = arr.optString(i, "");
                    if (url.isEmpty() || processedReels.contains(url) || currentReels.contains(url)) continue;
                    currentReels.add(url);
                    if (currentReels.size() >= candidateLimit) break;
                }
            } catch (JSONException ignored) {
            }

            status("候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");

            if (currentReels.size() >= candidateLimit || scrollRound >= 7) {
                if (currentReels.size() < candidateLimit && feedMode == 0) {
                    feedMode = 1;
                    scrollRound = 0;
                    status("発見で足りないため、リール画面から追加候補を収集中…");
                    load(Stage.FEED, "https://www.instagram.com/reels/");
                    return;
                }

                if (currentReels.isEmpty()) {
                    finishWithMessage("候補リールを取得できませんでした。Instagram画面の表示状態を確認してください。");
                } else {
                    reelIndex = 0;
                    processNextReel();
                }
                return;
            }

            scrollRound++;
            webView.evaluateJavascript(JS_SCROLL, null);
            handler.postDelayed(this::collectFeedReels, 1600);
        });
    }

    private void processNextReel() {
        if (!running) return;

        if (reelIndex >= currentReels.size()) {
            finishSearch();
            return;
        }

        currentReelUrl = currentReels.get(reelIndex++);
        if (!processedReels.add(currentReelUrl)) {
            processNextReel();
            return;
        }

        checkedCount++;
        status("候補 " + checkedCount + "/" + currentReels.size() + "件目を確認中…  条件一致 " + results.size() + "件");
        load(Stage.REEL, currentReelUrl);
    }

    private void parseReelPage() {
        if (!running || stage != Stage.REEL) return;

        webView.evaluateJavascript(JS_PARSE_REEL, value -> {
            if (!running || stage != Stage.REEL) return;

            String decoded = decodeJsString(value);
            try {
                JSONObject o = new JSONObject(decoded.isEmpty() ? "{}" : decoded);
                ReelMeta meta = new ReelMeta();
                meta.username = o.optString("username", "").trim();
                meta.views = o.optLong("views", 0);
                meta.datetime = o.optString("datetime", "").trim();
                meta.days = daysOld(meta.datetime);
                currentReel = meta;

                if (meta.username.isEmpty() || meta.views <= 0 || meta.datetime.isEmpty()) {
                    status("必要情報を取得できないため除外 → 次へ");
                    handler.postDelayed(this::processNextReel, 550);
                    return;
                }

                if (meta.days < MIN_DAYS) {
                    status("投稿日が新しすぎるため除外（" + meta.days + "日前）→ 次へ");
                    handler.postDelayed(this::processNextReel, 450);
                    return;
                }

                if (meta.days > MAX_DAYS) {
                    status("投稿日が古すぎるため除外（" + meta.days + "日前）→ 次へ");
                    handler.postDelayed(this::processNextReel, 450);
                    return;
                }

                load(Stage.PROFILE, "https://www.instagram.com/" + meta.username + "/");
            } catch (JSONException e) {
                status("リール情報の解析に失敗 → 次へ");
                handler.postDelayed(this::processNextReel, 550);
            }
        });
    }

    private void parseProfilePage() {
        if (!running || stage != Stage.PROFILE || currentReel == null) return;

        webView.evaluateJavascript(JS_PARSE_PROFILE, value -> {
            if (!running || stage != Stage.PROFILE) return;

            String decoded = decodeJsString(value);
            try {
                JSONObject o = new JSONObject(decoded.isEmpty() ? "{}" : decoded);
                long followers = o.optLong("followers", 0);
                long posts = o.optLong("posts", 0);

                if (followers <= 0 || posts <= 0) {
                    status("プロフィール情報を取得できないため除外 → 次へ");
                    handler.postDelayed(this::processNextReel, 550);
                    return;
                }

                double ratio = (double) currentReel.views / (double) followers;
                boolean pass = followers >= MIN_FOLLOWERS
                    && posts < MAX_POSTS_EXCLUSIVE
                    && currentReel.days >= MIN_DAYS
                    && currentReel.days <= MAX_DAYS
                    && ratio >= MIN_RATIO;

                if (pass) {
                    ResultItem item = new ResultItem();
                    item.username = currentReel.username;
                    item.url = currentReelUrl;
                    item.followers = followers;
                    item.posts = posts;
                    item.views = currentReel.views;
                    item.days = currentReel.days;
                    item.ratio = ratio;
                    addResult(item);
                    status("✅ 条件一致 " + String.format(Locale.US, "%.2f", ratio) + "倍 / " + currentReel.days + "日前 → 保存");
                } else {
                    status("条件外 → 次へ（" + formatNumber(followers) + "人 / " + posts + "投稿 / " + currentReel.days + "日前 / " + String.format(Locale.US, "%.2f", ratio) + "倍）");
                }

                handler.postDelayed(this::processNextReel, 600);
            } catch (JSONException e) {
                status("プロフィール解析に失敗 → 次へ");
                handler.postDelayed(this::processNextReel, 550);
            }
        });
    }

    private void load(Stage nextStage, String url) {
        if (!running && nextStage != Stage.HOME) return;
        stage = nextStage;
        stageHandled = false;
        webView.loadUrl(url);
    }

    private void finishSearch() {
        finishWithMessage("完了：" + checkedCount + "件確認 / 条件一致 " + results.size() + "件。『結果』からURLを確認できます。");
    }

    private void finishWithMessage(String message) {
        running = false;
        stage = Stage.HOME;
        stageHandled = false;
        status(message);
        updateResultButton();
    }

    private long daysOld(String iso) {
        if (iso == null || iso.isEmpty()) return Long.MAX_VALUE;

        try {
            LocalDate post = OffsetDateTime.parse(iso)
                .atZoneSameInstant(ZoneId.systemDefault())
                .toLocalDate();
            return ChronoUnit.DAYS.between(post, LocalDate.now());
        } catch (DateTimeParseException ignored) {
            try {
                if (iso.length() >= 10) {
                    LocalDate post = LocalDate.parse(iso.substring(0, 10));
                    return ChronoUnit.DAYS.between(post, LocalDate.now());
                }
            } catch (Exception ignoredAgain) {
            }
        }
        return Long.MAX_VALUE;
    }

    private String decodeJsString(String value) {
        if (value == null || value.equals("null")) return "";
        try {
            return new JSONArray("[" + value + "]").getString(0);
        } catch (JSONException e) {
            return value;
        }
    }

    private void status(String text) {
        runOnUiThread(() -> statusView.setText(text));
    }

    private String formatNumber(long n) {
        return String.format(Locale.JAPAN, "%,d", n);
    }

    private void addResult(ResultItem item) {
        for (int i = 0; i < results.size(); i++) {
            if (results.get(i).url.equals(item.url)) {
                results.set(i, item);
                saveResults();
                updateResultButton();
                return;
            }
        }

        results.add(0, item);
        results.sort((a, b) -> Double.compare(b.ratio, a.ratio));
        saveResults();
        updateResultButton();
    }

    private void updateResultButton() {
        if (resultsButton != null) {
            resultsButton.setText("結果 " + results.size() + "件");
        }
    }

    private void showResults() {
        if (results.isEmpty()) {
            Toast.makeText(this, "条件一致したリールはまだありません。", Toast.LENGTH_SHORT).show();
            return;
        }

        ScrollView scroll = new ScrollView(this);
        TextView text = new TextView(this);
        text.setText(buildResultsText());
        text.setTextSize(13);
        text.setTextColor(Color.rgb(17, 24, 39));
        text.setPadding(dp(16), dp(12), dp(16), dp(12));
        text.setTextIsSelectable(true);
        scroll.addView(text);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("条件一致 " + results.size() + "件")
            .setView(scroll)
            .setPositiveButton("閉じる", null)
            .setNeutralButton("URL一括コピー", (d, which) -> copyResultUrls())
            .setNegativeButton("結果を消去", null)
            .create();

        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                .setMessage("保存した結果をすべて消しますか？")
                .setPositiveButton("消去", (dd, w) -> {
                    results.clear();
                    saveResults();
                    updateResultButton();
                    dialog.dismiss();
                })
                .setNegativeButton("キャンセル", null)
                .show();
        }));

        dialog.show();
    }

    private String buildResultsText() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < results.size(); i++) {
            ResultItem r = results.get(i);
            sb.append(i + 1).append(". @").append(r.username).append("\n")
                .append(formatNumber(r.followers)).append("人 / ")
                .append(r.posts).append("投稿 / ")
                .append(r.days).append("日前 / ")
                .append(formatNumber(r.views)).append("再生 / ")
                .append(String.format(Locale.US, "%.2f", r.ratio)).append("倍\n")
                .append(r.url).append("\n\n");
        }
        return sb.toString();
    }

    private void copyResultUrls() {
        StringBuilder sb = new StringBuilder();
        for (ResultItem r : results) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(r.url);
        }

        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("reel urls", sb.toString()));
        Toast.makeText(this, "URLをコピーしました。", Toast.LENGTH_SHORT).show();
    }

    private void saveResults() {
        JSONArray arr = new JSONArray();
        for (ResultItem r : results) {
            try {
                arr.put(r.toJson());
            } catch (JSONException ignored) {
            }
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putString(PREF_RESULTS, arr.toString())
            .apply();
    }

    private void loadResults() {
        results.clear();
        String raw = getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(PREF_RESULTS, "[]");

        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) results.add(ResultItem.fromJson(o));
            }
        } catch (JSONException ignored) {
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack() && !running) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
