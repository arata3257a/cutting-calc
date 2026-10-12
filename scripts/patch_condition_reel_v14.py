from pathlib import Path

p = Path('instagram-condition-reel-finder-android/app/src/main/java/com/arata/conditionreelfinder/MainActivity.java')
s = p.read_text(encoding='utf-8')

old = '''    private static final String JS_EXTRACT_REELS = """
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
'''
new = '''    private static final String JS_EXTRACT_REELS = """
        (function(){
          const found = new Set();
          function add(raw) {
            if (!raw) return;
            try {
              const u = new URL(raw, location.origin);
              if (u.hostname !== 'www.instagram.com' && u.hostname !== 'instagram.com') return;
              if (!new RegExp('^/(reel|p)/[A-Za-z0-9_-]+/?$').test(u.pathname)) return;
              u.search = '';
              u.hash = '';
              found.add(u.toString());
            } catch(e) {}
          }
          Array.from(document.querySelectorAll('a[href], [data-href]')).forEach(n => {
            add(n.getAttribute('href'));
            add(n.getAttribute('data-href'));
          });
          const html = document.documentElement?.innerHTML || '';
          const re = new RegExp('/(?:reel|p)/[A-Za-z0-9_-]+/?', 'g');
          (html.match(re) || []).forEach(add);
          return JSON.stringify(Array.from(found));
        })();
        """;
'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('JS_EXTRACT_REELS block not found')

pairs = [
('''            status(currentSource + "：候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");\n''',
 '''            status(currentSource + "：段階1/3 候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");\n            setCurrentInfo("段階1/3：候補URLを収集中  " + currentReels.size() + "/" + candidateLimit\n                + "件  /  再生数は候補投稿を開いた後に表示します");\n'''),
('''        setCurrentInfo("解析中…  再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—");\n        status(currentSource + "：候補確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");\n''',
 '''        setCurrentInfo("段階2/3：投稿解析中  /  再生数：取得中  /  投稿日：取得中");\n        status(currentSource + "：段階2/3 候補投稿を確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");\n'''),
('''                load(Stage.PROFILE, "https://www.instagram.com/" + meta.username + "/");\n''',
 '''                setCurrentInfo("段階3/3：プロフィール解析中  /  再生数：" + formatNumber(meta.views)\n                    + "  /  投稿日：" + meta.days + "日前  /  フォロワー：取得中  /  投稿：取得中");\n                status(currentSource + "：段階3/3 プロフィール情報を確認中…");\n                load(Stage.PROFILE, "https://www.instagram.com/" + meta.username + "/");\n''')
]
for old_text, new_text in pairs:
    if old_text in s:
        s = s.replace(old_text, new_text, 1)

p.write_text(s, encoding='utf-8')
print('Patched MainActivity.java for v1.4 hashtag discovery')
