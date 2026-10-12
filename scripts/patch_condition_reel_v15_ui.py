from pathlib import Path

p = Path('instagram-condition-reel-finder-android/app/src/main/java/com/arata/conditionreelfinder/MainActivity.java')
s = p.read_text(encoding='utf-8')

s = s.replace(
    '        source.setText("おすすめ検索 / #検索。#検索は複数タグをまとめて指定できます。");',
    '        source.setText("#検索を使う場合はタグを入力してスタート。おすすめ検索とは完全に分けています。");',
    1
)

start = s.find('        LinearLayout modeRow = new LinearLayout(this);')
end = s.find('        LinearLayout limitRow = new LinearLayout(this);', start)
if start < 0 or end < 0:
    raise SystemExit('mode UI block not found')

new_block = '''        TextView modeLabel = new TextView(this);
        modeLabel.setText("検索方法");
        modeLabel.setTextSize(12);
        modeLabel.setTextColor(Color.rgb(55, 65, 81));
        modeLabel.setPadding(0, dp(2), 0, dp(3));
        setupPanel.addView(modeLabel, matchWrap());

        // startSearch() の既存ロジックを保つため、内部状態は Spinner で保持する。
        // 画面では分かりやすい2ボタンとして見せる。
        modeSpinner = new Spinner(this);
        String[] modes = {"おすすめから探す", "#から探す"};
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, modes);
        modeSpinner.setAdapter(modeAdapter);
        modeSpinner.setSelection(1); // 初期状態は #検索

        TextView selectedMode = new TextView(this);
        selectedMode.setText("選択中：#検索");
        selectedMode.setTextSize(13);
        selectedMode.setTypeface(null, 1);
        selectedMode.setTextColor(Color.rgb(17, 24, 39));
        selectedMode.setPadding(0, 0, 0, dp(4));
        setupPanel.addView(selectedMode, matchWrap());

        LinearLayout modeButtonRow = new LinearLayout(this);
        modeButtonRow.setOrientation(LinearLayout.HORIZONTAL);
        Button hashtagModeButton = makeButton("#検索");
        Button recommendModeButton = makeButton("おすすめ検索");
        modeButtonRow.addView(hashtagModeButton, weighted());
        modeButtonRow.addView(recommendModeButton, weighted());
        setupPanel.addView(modeButtonRow, matchWrap());

        tagInput = new EditText(this);
        tagInput.setHint("例：#簡単ご飯   または   #おにぎり #弁当");
        tagInput.setSingleLine(true);
        tagInput.setInputType(InputType.TYPE_CLASS_TEXT);
        tagInput.setVisibility(View.VISIBLE);
        setupPanel.addView(tagInput, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));

        hashtagModeButton.setOnClickListener(v -> {
            modeSpinner.setSelection(1);
            tagInput.setVisibility(View.VISIBLE);
            selectedMode.setText("選択中：#検索");
            status("#検索モードです。タグを入力して検索スタートを押してください。");
        });

        recommendModeButton.setOnClickListener(v -> {
            modeSpinner.setSelection(0);
            tagInput.setVisibility(View.GONE);
            selectedMode.setText("選択中：おすすめ検索");
            status("おすすめ検索モードです。#タグは使いません。");
        });

'''

s = s[:start] + new_block + s[end:]

s = s.replace(
    '        statusView.setText("検索方法を選んでスタートしてください。最初は10件推奨です。");',
    '        statusView.setText("初期状態は #検索です。例：#簡単ご飯 を入力して検索スタート。");',
    1
)

s = s.replace(
    '        status(currentSource + " から候補を収集中…（" + (tagIndex + 1) + "/" + searchTags.size() + "）");',
    '        status("検索中：" + currentSource + "  /  段階1/3 候補を収集中（" + (tagIndex + 1) + "/" + searchTags.size() + "）");',
    1
)

p.write_text(s, encoding='utf-8')

# v1.5 は旧版と完全に別アプリIDにして、インストール競合を避ける。
gradle = Path('instagram-condition-reel-finder-android/app/build.gradle.kts')
g = gradle.read_text(encoding='utf-8')
g = g.replace('applicationId = "com.arata.conditionreelfinder.hashtag14fixed"', 'applicationId = "com.arata.conditionreelfinder.hashtag15clear"')
g = g.replace('versionCode = 7', 'versionCode = 8')
g = g.replace('versionName = "1.4.1-installfix"', 'versionName = "1.5-clear-search"')
gradle.write_text(g, encoding='utf-8')

manifest = Path('instagram-condition-reel-finder-android/app/src/main/AndroidManifest.xml')
m = manifest.read_text(encoding='utf-8')
m = m.replace('android:label="条件一致リール発掘 v1.4"', 'android:label="条件一致リール発掘 v1.5"')
manifest.write_text(m, encoding='utf-8')

print('Patched v1.5 clear search UI, version and app ID')
