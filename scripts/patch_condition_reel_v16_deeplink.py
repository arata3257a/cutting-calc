from pathlib import Path

p = Path('instagram-condition-reel-finder-android/app/src/main/java/com/arata/conditionreelfinder/MainActivity.java')
s = p.read_text(encoding='utf-8')

if 'import android.net.Uri;' not in s:
    s = s.replace('import android.graphics.Color;\n', 'import android.graphics.Color;\nimport android.net.Uri;\n', 1)
if 'import android.webkit.WebResourceRequest;' not in s:
    s = s.replace('import android.webkit.CookieManager;\n', 'import android.webkit.CookieManager;\nimport android.webkit.WebResourceRequest;\n', 1)

needle = '''        webView.setWebViewClient(new WebViewClient() {\n            @Override\n            public void onPageFinished(WebView view, String url) {\n'''
replacement = '''        webView.setWebViewClient(new WebViewClient() {\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n                String url = request != null && request.getUrl() != null ? request.getUrl().toString() : \"\";\n                return handleInstagramDeepLink(view, url);\n            }\n\n            @Override\n            @SuppressWarnings(\"deprecation\")\n            public boolean shouldOverrideUrlLoading(WebView view, String url) {\n                return handleInstagramDeepLink(view, url);\n            }\n\n            @Override\n            public void onPageFinished(WebView view, String url) {\n'''
if needle not in s:
    raise SystemExit('WebViewClient insertion point not found')
s = s.replace(needle, replacement, 1)

needle2 = '''    private Button makeButton(String text) {\n'''
helper = '''    private boolean handleInstagramDeepLink(WebView view, String url) {\n        if (url == null || !url.startsWith(\"instagram://\")) return false;\n\n        String webUrl = normalizeReelUrl(url);\n        if (!webUrl.isEmpty()) {\n            if (running && stage == Stage.REEL) currentReelUrl = webUrl;\n            status(\"Instagram専用リンクをWeb用に変換して解析を続行中…\");\n            view.loadUrl(webUrl);\n            return true;\n        }\n\n        if (running && stage == Stage.REEL) {\n            stageHandled = true;\n            status(\"このInstagramリンクは解析できないため次の候補へ進みます。\");\n            handler.postDelayed(this::processNextReel, 350);\n        }\n        return true;\n    }\n\n    private String normalizeReelUrl(String url) {\n        if (url == null || url.isEmpty()) return \"\";\n        if (!url.startsWith(\"instagram://\")) return url;\n        try {\n            Uri uri = Uri.parse(url);\n            String shortcode = uri.getQueryParameter(\"shortcode\");\n            if (shortcode != null && shortcode.matches(\"[A-Za-z0-9_-]+\")) {\n                return \"https://www.instagram.com/reel/\" + shortcode + \"/\";\n            }\n        } catch (Exception ignored) {}\n        return \"\";\n    }\n\n    private Button makeButton(String text) {\n'''
if needle2 not in s:
    raise SystemExit('helper insertion point not found')
s = s.replace(needle2, helper, 1)

needle3 = '''        currentReelUrl = currentReels.get(reelIndex++);\n        if (!processedReels.add(currentReelUrl)) {\n'''
replacement3 = '''        currentReelUrl = normalizeReelUrl(currentReels.get(reelIndex++));\n        if (currentReelUrl.isEmpty()) {\n            status(currentSource + \"：解析できないリンクを除外 → 次へ\");\n            handler.postDelayed(this::processNextReel, 250);\n            return;\n        }\n        if (!processedReels.add(currentReelUrl)) {\n'''
if needle3 not in s:
    raise SystemExit('currentReelUrl insertion point not found')
s = s.replace(needle3, replacement3, 1)

p.write_text(s, encoding='utf-8')

# Version bump: keep the same v1.5 applicationId so this installs as an update.
g = Path('instagram-condition-reel-finder-android/app/build.gradle.kts')
gs = g.read_text(encoding='utf-8')
gs = gs.replace('versionCode = 8', 'versionCode = 9', 1)
gs = gs.replace('versionName = "1.5-clear-search"', 'versionName = "1.6-deeplink-fix"', 1)
g.write_text(gs, encoding='utf-8')

m = Path('instagram-condition-reel-finder-android/app/src/main/AndroidManifest.xml')
ms = m.read_text(encoding='utf-8')
ms = ms.replace('android:label="条件一致リール発掘 v1.5"', 'android:label="条件一致リール発掘 v1.6"', 1)
m.write_text(ms, encoding='utf-8')

print('Patched v1.6 deep-link conversion + version bump')
