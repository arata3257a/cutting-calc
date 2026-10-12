from pathlib import Path

p = Path('instagram-condition-reel-finder-android/app/src/main/java/com/arata/conditionreelfinder/MainActivity.java')
s = p.read_text(encoding='utf-8')

def rep(old, new):
    global s
    if old not in s:
        raise SystemExit('missing snippet:\n' + old[:180])
    s = s.replace(old, new, 1)

rep(
'''    private TextView statusView;\n    private LinearLayout setupPanel;''',
'''    private TextView statusView;\n    private TextView currentInfoView;\n    private LinearLayout setupPanel;'''
)

rep(
'''        statusView.setBackgroundColor(Color.WHITE);\n        root.addView(statusView, matchWrap());\n\n        webView = new WebView(this);''',
'''        statusView.setBackgroundColor(Color.WHITE);\n        root.addView(statusView, matchWrap());\n\n        currentInfoView = new TextView(this);\n        currentInfoView.setText("再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");\n        currentInfoView.setTextSize(13);\n        currentInfoView.setTextColor(Color.rgb(17, 24, 39));\n        currentInfoView.setTypeface(null, 1);\n        currentInfoView.setPadding(dp(7), dp(7), dp(7), dp(7));\n        currentInfoView.setBackgroundColor(Color.rgb(229, 231, 235));\n        currentInfoView.setMaxLines(2);\n        root.addView(currentInfoView, matchWrap());\n\n        webView = new WebView(this);'''
)

rep(
'''        checkedCount = 0;\n        tagIndex = -1;\n        setSearchUi(true);''',
'''        checkedCount = 0;\n        tagIndex = -1;\n        setCurrentInfo("再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");\n        setSearchUi(true);'''
)

rep(
'''        checkedCount++;\n        status(currentSource + "：候補確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");\n        load(Stage.REEL, currentReelUrl);''',
'''        checkedCount++;\n        setCurrentInfo("解析中…  再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—");\n        status(currentSource + "：候補確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");\n        load(Stage.REEL, currentReelUrl);'''
)

rep(
'''                currentReel = meta;\n\n                if (meta.username.isEmpty() || meta.views <= 0 || meta.datetime.isEmpty()) {\n                    status("必要情報を取得できないため除外 → 次へ");''',
'''                currentReel = meta;\n\n                if (meta.views > 0) {\n                    String dayText = meta.days == Long.MAX_VALUE ? "不明" : meta.days + "日前";\n                    setCurrentInfo("再生数：" + formatNumber(meta.views) + "  /  フォロワー：取得中  /  投稿：取得中  /  倍率：計算中  /  投稿日：" + dayText);\n                } else {\n                    setCurrentInfo("再生数：取得できず  /  フォロワー：—  /  投稿：—  /  倍率：—  /  投稿日：—");\n                }\n\n                if (meta.username.isEmpty() || meta.views <= 0 || meta.datetime.isEmpty()) {\n                    status("必要情報を取得できないため除外 → 次へ");'''
)

rep(
'''                if (followers <= 0 || posts <= 0) {\n                    status("プロフィール情報を取得できないため除外 → 次へ");''',
'''                if (followers <= 0 || posts <= 0) {\n                    setCurrentInfo("再生数：" + formatNumber(currentReel.views) + "  /  フォロワー：取得できず  /  投稿：取得できず  /  倍率：—  /  投稿日：" + currentReel.days + "日前");\n                    status("プロフィール情報を取得できないため除外 → 次へ");'''
)

rep(
'''                boolean japanPass = currentReel.japanStrong\n                    || profileJapanStrong\n                    || (currentReel.japanese && profileJapanese);\n\n                if (!japanPass) {''',
'''                double ratio = (double) currentReel.views / (double) followers;\n                setCurrentInfo("再生数：" + formatNumber(currentReel.views)\n                    + "  /  フォロワー：" + formatNumber(followers)\n                    + "  /  投稿：" + posts\n                    + "  /  倍率：" + String.format(Locale.US, "%.2f", ratio) + "倍"\n                    + "  /  投稿日：" + currentReel.days + "日前");\n\n                boolean japanPass = currentReel.japanStrong\n                    || profileJapanStrong\n                    || (currentReel.japanese && profileJapanese);\n\n                if (!japanPass) {'''
)

rep(
'''                double ratio = (double) currentReel.views / (double) followers;\n                boolean pass = followers >= MIN_FOLLOWERS''',
'''                boolean pass = followers >= MIN_FOLLOWERS'''
)

rep(
'''    private void status(String text) {\n        runOnUiThread(() -> statusView.setText(text));\n    }\n\n    private String formatNumber(long n) {''',
'''    private void status(String text) {\n        runOnUiThread(() -> statusView.setText(text));\n    }\n\n    private void setCurrentInfo(String text) {\n        runOnUiThread(() -> {\n            if (currentInfoView != null) currentInfoView.setText(text);\n        });\n    }\n\n    private String formatNumber(long n) {'''
)

rep(
'''                .append(formatNumber(r.followers)).append("人 / ")\n                .append(r.posts).append("投稿 / ")\n                .append(r.days).append("日前 / ")\n                .append(formatNumber(r.views)).append("再生 / ")\n                .append(String.format(Locale.US, "%.2f", r.ratio)).append("倍\\n")''',
'''                .append("再生数：").append(formatNumber(r.views)).append("\\n")\n                .append("フォロワー：").append(formatNumber(r.followers)).append("人\\n")\n                .append("総投稿数：").append(r.posts).append("投稿\\n")\n                .append("投稿日：").append(r.days).append("日前\\n")\n                .append("倍率：").append(String.format(Locale.US, "%.2f", r.ratio)).append("倍\\n")'''
)

p.write_text(s, encoding='utf-8')

b = Path('instagram-condition-reel-finder-android/app/build.gradle.kts')
t = b.read_text(encoding='utf-8')
t = t.replace('versionCode = 3', 'versionCode = 4').replace('versionName = "1.2-search-modes"', 'versionName = "1.3-visible-metrics"')
b.write_text(t, encoding='utf-8')
print('patched')
