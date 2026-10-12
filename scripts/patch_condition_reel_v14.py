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
          const matches = html.match(re) || [];
          matches.forEach(add);

          return JSON.stringify(Array.from(found));
        })();
        """;
'''

if old not in s:
    raise SystemExit('JS_EXTRACT_REELS block not found')
s = s.replace(old, new, 1)

old2 = '''        status(currentSource + "：候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");
'''
new2 = '''        status(currentSource + "：段階1/3 候補 " + currentReels.size() + "/" + candidateLimit + "件を収集中…");
            setCurrentInfo("段階1/3：候補URLを収集中  " + currentReels.size() + "/" + candidateLimit
                + "件  /  再生数は候補投稿を開いた後に表示します");
'''
if old2 not in s:
    raise SystemExit('collection status block not found')
s = s.replace(old2, new2, 1)

old3 = '''        setCurrentInfo("解析中…  再生数：—  /  フォロワー：—  /  投稿：—  /  倍率：—");
        status(currentSource + "：候補確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");
'''
new3 = '''        setCurrentInfo("段階2/3：投稿解析中  /  再生数：取得中  /  投稿日：取得中");
        status(currentSource + "：段階2/3 候補投稿を確認中 " + reelIndex + "/" + currentReels.size() + "  合格 " + results.size() + "件");
'''
if old3 not in s:
    raise SystemExit('reel stage block not found')
s = s.replace(old3, new3, 1)

old4 = '''                load(Stage.PROFILE, "https://www.instagram.com/" + meta.username + "/");
'''
new4 = '''                setCurrentInfo("段階3/3：プロフィール解析中  /  再生数：" + formatNumber(meta.views)
                    + "  /  投稿日：" + meta.days + "日前  /  フォロワー：取得中  /  投稿：取得中");
                status(currentSource + "：段階3/3 プロフィール情報を確認中…");
                load(Stage.PROFILE, "https://www.instagram.com/" + meta.username + "/");
'''
if old4 not in s:
    raise SystemExit('profile transition block not found')
s = s.replace(old4, new4, 1)

old5 = '''          if (!views) {
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
'''
new5 = '''          if (!views) {
            const scripts = Array.from(document.scripts)
              .map(s => s.textContent || '')
              .filter(t => /play_count|video_play_count|view_count|playCount|videoPlayCount|viewCount/.test(t));
            const scriptPatterns = [
              /"play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"video_play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"view_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"playCount"[\\s]*:[\\s]*([0-9]+)/i,
              /"videoPlayCount"[\\s]*:[\\s]*([0-9]+)/i,
              /"viewCount"[\\s]*:[\\s]*([0-9]+)/i
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

          if (!views) {
            const htmlJson = (document.documentElement?.innerHTML || '').replace(/&quot;/g, '"');
            const htmlPatterns = [
              /"play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"video_play_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"view_count"[\\s]*:[\\s]*([0-9]+)/i,
              /"playCount"[\\s]*:[\\s]*([0-9]+)/i,
              /"videoPlayCount"[\\s]*:[\\s]*([0-9]+)/i,
              /"viewCount"[\\s]*:[\\s]*([0-9]+)/i
            ];
            for (const p of htmlPatterns) {
              const m = htmlJson.match(p);
              if (m) {
                const n = Number(m[1]);
                if (n > 0) { views = n; break; }
              }
            }
          }
'''
if old5 not in s:
    raise SystemExit('view extraction block not found')
s = s.replace(old5, new5, 1)

p.write_text(s, encoding='utf-8')
print('Patched MainActivity.java for v1.4')
