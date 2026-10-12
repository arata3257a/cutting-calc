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
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {

    private static final int MIN_FOLLOWERS = 10_000;
    private static final int MAX_POSTS_EXCLUSIVE = 180;
    private static final int MIN_DAYS = 7;
    private static final int MAX_DAYS = 14;
    private static final double MIN_RATIO = 3.0;

    private static final String PREFS = "condition_reel_finder_japan_v4";
    private static final String PREF_RESULTS = "results";

    private final Handler handler = new Handler(Looper.getMainLooper());

    private WebView webView;
    private Spinner modeSpinner;
    private Spinner limitSpinner;
    private EditText tagInput;
    private TextView statusView;
    private TextView currentInfoView;
    private LinearLayout setupPanel;
    private Button startButton;
    private Button stopButton;
    private Button resultsButton;

    private boolean running = false;
    private boolean stageHandled = false;
    private boolean hashtagMode = false;
    private Stage stage = Stage.HOME;

    private final List<String> currentReels = new ArrayList<>();
    private final Set<String> processedReels = new HashSet<>();
    private final List<ResultItem> results = new ArrayList<>();
    private final List<String> searchTags = new ArrayList<>();

    private int reelIndex = 0;
    private int scrollRound = 0;
    private int candidateLimit = 20;
    private int feedMode = 0;
    private int checkedCount = 0;
    private int tagIndex = -1;

    private String currentReelUrl = "";
    private String currentSource = "おすすめ";
    private ReelMeta currentReel;

    private enum Stage { HOME, FEED, REEL, PROFILE }

    private static class ReelMeta {
        String username = "";
        long views = 0;
        String datetime = "";
        long days = Long.MAX_VALUE;
        boolean japanese = false;
        boolean japanStrong = false;
    }

    private static class ResultItem {
        String source = "";
        String username = "";
        String url = "";
        long followers = 0;
        long posts = 0;
        long views = 0;
        long days = 0;
        double ratio = 0;

        JSONObject toJson() throws JSONException {
            JSONObject o = new JSONObject();
            o.put("source", source);
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
            r.source = o.optString("source", "");
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

    private static final String JS_SCROLL =
        "window.scrollBy(0, Math.max(window.innerHeight * 3, 2600));";

    private static final String JS_PARSE_REEL = """
        (function(){
          const body = document.body?.innerText || '';
          const article = document.querySelector('article')?.innerText || '';
          const desc = document.querySelector('meta[name="description"]')?.content || '';
          const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
          const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
          const raw = [body, desc, ogDesc, ogTitle].join('\\n').replace(/\\u00a0/g, ' ');

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
            const m = ogTitle.match(/^@?([A-Za-z0-9._]+)[ ]/);
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
            const m = s.match(/^([0-9]+(?:[.][0-9]+)?)(万|[KkMmBb])?$/);
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
            /(?:再生数|再生|views?|plays?)[\\s:：]*([0-9０-９.,．万KkMmBb]+)/i,
            /([0-9０-９.,．万KkMmBb]+)[\\s]*(?:回)?[\\s]*(?:再生|views?|plays?)/i
          ];
          for (const p of patterns) {
            const m = raw.match(p);
            if (m) { views = parseNum(m[1]); if (views) break; }
          }

          if (!views) {
            const labels = Array.from(document.querySelectorAll('[aria-label],[title]'))
              .map(n => (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('title') || ''))
              .join('\\n');
            for (const p of patterns) {
              const m = labels.match(p);
              if (m) { views = parseNum(m[1]); if (views) break; }
            }
          }

          if (!views) {
            const scripts = Array.from(document.scripts)
              .map(s => s.textContent || '')
              .filter(t => /play_count|video_play_count|view_count/.test(t));
            const scriptPatterns = [
              /"play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"video_play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"view_count"[\\s]*:[\\s]*([0-9]+)/i
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

          const signalText = [desc, ogDesc, article]
            .join(' ')
            .replace(/フォロー中|フォロー|いいね|コメント|シェア|保存|再生数|再生|音源|翻訳を見る|件/g, ' ')
            .replace(/Followers?|Following|Likes?|Comments?|Views?|Plays?/gi, ' ');

          const japanStrong = /(日本|Japan|東京|Tokyo|大阪|Osaka|京都|Kyoto|北海道|Hokkaido|沖縄|Okinawa|福岡|Fukuoka|埼玉|Saitama|千葉|Chiba|神奈川|Kanagawa|横浜|Yokohama|愛知|Aichi|名古屋|Nagoya|兵庫|Hyogo|神戸|Kobe|静岡|Shizuoka|広島|Hiroshima|宮城|Miyagi|仙台|Sendai|新潟|Niigata|長野|Nagano|群馬|Gunma|栃木|Tochigi|茨城|Ibaraki|岐阜|Gifu|三重|Mie|滋賀|Shiga|奈良|Nara|和歌山|Wakayama|岡山|Okayama|山口|Yamaguchi|香川|Kagawa|愛媛|Ehime|熊本|Kumamoto|鹿児島|Kagoshima)/i.test(signalText);
          const japanese = /[ぁ-んァ-ヶー]/.test(signalText);

          return JSON.stringify({username, views, datetime, japanese, japanStrong});
        })();
        """;

    private static final String JS_PARSE_PROFILE = """
        (function(){
          const meta = document.querySelector('meta[name="description"]')?.content || '';
          const og = document.querySelector('meta[property="og:description"]')?.content || '';
          const header = document.querySelector('header')?.innerText || '';
          const raw = [meta, og, header].join('\\n').replace(/\\u00a0/g, ' ');

          function parseNum(v) {
            if (!v) return 0;
            let s = String(v).replace(/[\\s,，]/g,'')
              .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0))
              .replace('．','.');
            const m = s.match(/^([0-9]+(?:[.][0-9]+)?)(万|[KkMmBb])?$/);
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
            /([0-9０-９.,．万KkMmBb]+)[\\s]*(?:Followers|フォロワー)/i,
            /(?:Followers|フォロワー)[\\s:：]*([0-9０-９.,．万KkMmBb]+)/i
          ]);

          const posts = firstNumber([
            /([0-9０-９.,．万KkMmBb]+)[\\s]*(?:Posts|投稿)/i,
            /(?:Posts|投稿)[\\s:：]*([0-9０-９.,．万KkMmBb]+)/i,
            /([0-9０-９.,．万KkMmBb]+)[\\s]*件?(?:の)?投稿/i
          ]);

          const signalText = [meta, og, header]
            .join(' ')
            .replace(/フォロワー|フォロー中|フォロー|投稿|メッセージ|連絡先|プロアカウント|件/g, ' ')
            .replace(/Followers?|Following|Posts?|Message|Contact/gi, ' ')
            .replace(/[0-9０-９.,．万KkMmBb]+/g, ' ');

          const japanStrong = /(日本|Japan|東京|Tokyo|大阪|Osaka|京都|Kyoto|北海道|Hokkaido|沖縄|Okinawa|福岡|Fukuoka|埼玉|Saitama|千葉|Chiba|神奈川|Kanagawa|横浜|Yokohama|愛知|Aichi|名古屋|Nagoya|兵庫|Hyogo|神戸|Kobe|静岡|Shizuoka|広島|Hiroshima|宮城|Miyagi|仙台|Sendai|新潟|Niigata|長野|Nagano|群馬|Gunma|栃木|Tochigi|茨城|Ibaraki|岐阜|Gifu|三重|Mie|滋賀|Shiga|奈良|Nara|和歌山|Wakayama|岡山|Okayama|山口|Yamaguchi|香川|Kagawa|愛媛|Ehime|熊本|Kumamoto|鹿児島|Kagoshima)/i.test(signalText);
          const japanese = /[ぁ-んァ-ヶー]/.test(signalText);

          return JSON.stringify({followers, posts, japanese, japanStrong});
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
        root.setPadding(dp(6), dp(6), dp(6), dp(6));

        setupPanel = new LinearLayout(this);
        setupPanel.setOrientation(LinearLayout.VERTICAL);
        root.addView(setupPanel, matchWrap());

        TextView title = new TextView(this);
        title.setText("日本候補リール発掘");
        title.setTextSize(20);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(null, 1);
        setupPanel.addView(title, matchWrap());

        TextView rules = new TextView(this);
        rules.setText("日本候補 / 1万人以上 / 180投稿未満 / 7〜14日前 / 再生3倍以上");
        rules.setTextSize(11);
        rules.setTextColor(Color.rgb(75, 85, 99));
        rules.setPadding(0, dp(2), 0, dp(3));
        setupPanel.addView(rules, matchWrap());

        TextView source = new TextView(this);
        source.setText("おすすめ検索 / #検索。#検索は複数タグをまとめて指定できます。");
        source.setTextSize(11);
        source.setTextColor(Color.rgb(75, 85, 99));
        source.setPadding(0, 0, 0, dp(4));
        setupPanel.addView(source, matchWrap());

        LinearLayout modeRow = new LinearLayout(this);
        modeRow.setOrientation(LinearLayout.HORIZONTAL);
        modeRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView modeLabel = new TextView(this);
        modeLabel.setText("検索方法");
        modeLabel.setTextSize(12);
        modeLabel.setTextColor(Color.rgb(55, 65, 81));
        modeRow.addView(modeLabel, new LinearLayout.LayoutParams(0, dp(42), 1f));

        modeSpinner = new Spinner(this);
        String[] modes = {"おすすめから探す", "#から探す"};
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, modes);
        modeSpinner.setAdapter(modeAdapter);
        modeRow.addView(modeSpinner, new LinearLayout.LayoutParams(dp(170), dp(42)));
        setupPanel.addView(modeRow, matchWrap());

        tagInput = new EditText(this);
        tagInput.setHint("#おにぎり #弁当 #料理");
        tagInput.setSingleLine(true);
        tagInput.setInputType(InputType.TYPE_CLASS_TEXT);
        tagInput.setVisibility(View.GONE);
        setupPanel.addView(tagInput, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));

        modeSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                tagInput.setVisibility(position == 1 ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        LinearLayout limitRow = new LinearLayout(this);
        limitRow.setOrientation(LinearLayout.HORIZONTAL);
        limitRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView limitLabel = new TextView(this);
        limitLabel.setText("確認する候補数（#は各タグ）");
        limitLabel.setTextSize(12);
        limitLabel.setTextColor(Color.rgb(55, 65, 81));
        limitRow.addView(limitLabel, new LinearLayout.LayoutParams(0, dp(42), 1f));

        limitSpinner = new Spinner(this);
        String[] limits = {"10件", "20件", "30件"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, limits);
        limitSpinner.setAdapter(adapter);
        limitSpinner.setSelection(0);
        limitRow.addView(limitSpinner, new LinearLayout.LayoutParams(dp(105), dp(42)));
        setupPanel.addView(limitRow, matchWrap());

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        startButton = makeButton("検索スタート");
        stopButton = makeButton("停止");
        resultsButton = makeButton("結果 0件");
        buttonRow.addView(startButton, weighted());
        buttonRow.addView(stopButton, weighted());
        buttonRow.addView(resultsButton, weighted());
        root.addView(buttonRow, matchWrap());

        statusView = new TextView(this);
        statusView.setText("検索方法を選んでスタートしてください。最初は10件推奨です。");
        statusView.setTextSize(12);
        statusView.setTextColor(Color.rgb(55, 65, 81));
        statusView.setPadding(dp(7), dp(6), dp(7), dp(6));
        statusView.setMaxLines(2);
        statusView.setBackgroundColor(Color.WHITE);
        root.addView(statusView, matchWrap());

        currentInfoView = new TextView(this);
        currentInfoView.setText("再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");
        currentInfoView.setTextSize(13);
        currentInfoView.setTextColor(Color.rgb(17, 24, 39));
        currentInfoView.setTypeface(null, 1);
        currentInfoView.setPadding(dp(7), dp(7), dp(7), dp(7));
        currentInfoView.setBackgroundColor(Color.rgb(229, 231, 235));
        currentInfoView.setMaxLines(2);
        root.addView(currentInfoView, matchWrap());

        webView = new WebView(this);
        LinearLayout.LayoutParams webLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        webLp.topMargin = dp(4);
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
                        setSearchUi(false);
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
        setSearchUi(false);
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
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        lp.setMargins(dp(2), dp(2), dp(2), dp(3));
        return lp;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void setSearchUi(boolean searching) {
        if (setupPanel != null) setupPanel.setVisibility(searching ? View.GONE : View.VISIBLE);
        if (startButton != null) startButton.setVisibility(searching ? View.GONE : View.VISIBLE);
        if (stopButton != null) stopButton.setVisibility(searching ? View.VISIBLE : View.GONE);
    }

    private void startSearch() {
        String limitText = String.valueOf(limitSpinner.getSelectedItem());
        candidateLimit = limitText.startsWith("10") ? 10 : limitText.startsWith("30") ? 30 : 20;
        hashtagMode = modeSpinner.getSelectedItemPosition() == 1;

        searchTags.clear();
        if (hashtagMode) {
            String raw = tagInput.getText().toString().trim();
            Set<String> unique = new LinkedHashSet<>();
            for (String part : raw.split("[\\s,、]+")) {
                String tag = part.trim().replaceFirst("^#+", "");
                if (!tag.isEmpty()) unique.add(tag);
            }
            searchTags.addAll(unique);
            if (searchTags.isEmpty()) {
                Toast.makeText(this, "#検索するタグを入力してください。", Toast.LENGTH_SHORT).show();
                return;
            }
        }

        running = true;
        stageHandled = false;
        processedReels.clear();
        currentReels.clear();
        reelIndex = 0;
        scrollRound = 0;
        feedMode = 0;
        checkedCount = 0;
        tagIndex = -1;
        setCurrentInfo("再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");
        setSearchUi(true);

        if (hashtagMode) {
            startNextTag();
        } else {
            currentSource = "おすすめ";
            status("おすすめから日本候補を収集中…");
            load(Stage.FEED, "https://www.instagram.com/explore/");
        }
    }

    private void startNextTag() {
        if (!running) return;
        tagIndex++;
        if (tagIndex >= searchTags.size()) {
            finishSearch();
            return;
        }

        String tag = searchTags.get(tagIndex);
        currentSource = "#" + tag;
        currentReels.clear();
        reelIndex = 0;
        scrollRound = 0;
        feedMode = 0;
        status(currentSource + " から候補を収集中…（" + (tagIndex + 1) + "/" + searchTags.size() + "）");
        String encoded = URLEncoder.encode(tag, StandardCharsets.UTF_8).replace("+", "%20");
        load(Stage.FEED, "https://www.instagram.com/explore/tags/" + encoded + "/");
    }

    private void stopSearch(String message) {
        running = false;
        stage = Stage.HOME;
        stageHandled = false;
        handler.removeCallbacksAndMessages(null);
        setSearchUi(false);
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
            } catch (JSONException ignored) {}

            status(currentSource + "：候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");
            if (currentReels.size() >= candidateLimit || scrollRound >= 7) {
                if (!hashtagMode && currentReels.size() < candidateLimit && feedMode == 0) {
                    feedMode = 1;
                    scrollRound = 0;
                    status("発見で足りないためリール画面から追加収集中…");
                    load(Stage.FEED, "https://www.instagram.com/reels/");
                    return;
                }

                if (currentReels.isEmpty()) {
                    if (hashtagMode) {
                        status(currentSource + "：候補リールを取得できませんでした。次の#へ進みます。");
                        handler.postDelayed(this::startNextTag, 800);
                    } else {
                        finishWithMessage("候補リールを取得できませんでした。Instagram画面を確認してください。");
                    }
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
            if (hashtagMode) startNextTag();
            else finishSearch();
            return;
        }

        currentReelUrl = currentReels.get(reelIndex++);
        if (!processedReels.add(currentReelUrl)) {
            processNextReel();
            return;
        }

        checkedCount++;
        setCurrentInfo("解析中…  再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—");
        status(currentSource + "：候補確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");
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
                meta.japanese = o.optBoolean("japanese", false);
                meta.japanStrong = o.optBoolean("japanStrong", false);
                currentReel = meta;

                if (meta.views > 0) {
                    String dayText = meta.days == Long.MAX_VALUE ? "不明" : meta.days + "日前";
                    setCurrentInfo("再生数：" + formatNumber(meta.views) + "  /  フォロワー：取得中  /  投稿：取得中  /  倍率：計算中  /  投稿日：" + dayText);
                } else {
                    setCurrentInfo("再生数：取得できず  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");
                }

                if (meta.username.isEmpty() || meta.views <= 0 || meta.datetime.isEmpty()) {
                    status("必要情報を取得できないため除外 → 次へ");
                    handler.postDelayed(this::processNextReel, 550);
                    return;
                }
                if (meta.days < MIN_DAYS || meta.days > MAX_DAYS) {
                    status("投稿日が7〜14日前ではないため除外（" + meta.days + "日前）→ 次へ");
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
                boolean profileJapanese = o.optBoolean("japanese", false);
                boolean profileJapanStrong = o.optBoolean("japanStrong", false);

                if (followers <= 0 || posts <= 0) {
                    setCurrentInfo("再生数：" + formatNumber(currentReel.views) + "  /  フォロワー：取得できず  /  投稿：取得できず  /  倍率：—  /  投稿日：" + currentReel.days + "日前");
                    status("プロフィール情報を取得できないため除外 → 次へ");
                    handler.postDelayed(this::processNextReel, 550);
                    return;
                }

                double ratio = (double) currentReel.views / (double) followers;
                setCurrentInfo("再生数：" + formatNumber(currentReel.views)
                    + "  /  フォロワー：" + formatNumber(followers)
                    + "  /  投稿：" + posts
                    + "  /  倍率：" + String.format(Locale.US, "%.2f", ratio) + "倍"
                    + "  /  投稿日：" + currentReel.days + "日前");

                boolean japanPass = currentReel.japanStrong
                    || profileJapanStrong
                    || (currentReel.japanese && profileJapanese);

                if (!japanPass) {
                    status("日本候補判定が取れないため除外 → 次へ");
                    handler.postDelayed(this::processNextReel, 500);
                    return;
                }

                boolean pass = followers >= MIN_FOLLOWERS
                    && posts < MAX_POSTS_EXCLUSIVE
                    && currentReel.days >= MIN_DAYS
                    && currentReel.days <= MAX_DAYS
                    && ratio >= MIN_RATIO;

                if (pass) {
                    ResultItem item = new ResultItem();
                    item.source = currentSource;
                    item.username = currentReel.username;
                    item.url = currentReelUrl;
                    item.followers = followers;
                    item.posts = posts;
                    item.views = currentReel.views;
                    item.days = currentReel.days;
                    item.ratio = ratio;
                    addResult(item);
                    status("🇯🇵条件一致 " + currentSource + " / " + String.format(Locale.US, "%.2f", ratio) + "倍 → 保存");
                } else {
                    status("日本候補だが条件外 → 次へ（" + formatNumber(followers) + "人 / " + posts + "投稿 / " + currentReel.days + "日前 / " + String.format(Locale.US, "%.2f", ratio) + "倍）");
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
        String modeText = hashtagMode ? "#検索" : "おすすめ検索";
        finishWithMessage("完了：" + modeText + " / " + checkedCount + "件確認 / 日本候補＋条件一致 " + results.size() + "件。");
    }

    private void finishWithMessage(String message) {
        running = false;
        stage = Stage.HOME;
        stageHandled = false;
        setSearchUi(false);
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
            } catch (Exception ignoredAgain) {}
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

    private void setCurrentInfo(String text) {
        runOnUiThread(() -> {
            if (currentInfoView != null) currentInfoView.setText(text);
        });
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
        if (resultsButton != null) resultsButton.setText("結果 " + results.size() + "件");
    }

    private void showResults() {
        if (results.isEmpty()) {
            Toast.makeText(this, "日本候補＋条件一致したリールはまだありません。", Toast.LENGTH_SHORT).show();
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
            .setTitle("🇯🇵候補 条件一致 " + results.size() + "件")
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
            sb.append(i + 1).append(". 🇯🇵候補 @").append(r.username).append("\n")
                .append("検索元：").append(r.source.isEmpty() ? "不明" : r.source).append("\n")
                .append("再生数：").append(formatNumber(r.views)).append("\n")
                .append("フォロワー：").append(formatNumber(r.followers)).append("人\n")
                .append("総投稿数：").append(r.posts).append("投稿\n")
                .append("投稿日：").append(r.days).append("日前\n")
                .append("倍率：").append(String.format(Locale.US, "%.2f", r.ratio)).append("倍\n")
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
            try { arr.put(r.toJson()); } catch (JSONException ignored) {}
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit().putString(PREF_RESULTS, arr.toString()).apply();
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
        } catch (JSONException ignored) {}
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack() && !running) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
