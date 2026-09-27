# Instagram Reel Search

個人利用向けの自動Instagramリール発掘アプリです。

## 処理
1. #ハッシュタグを入力
2. ApifyのInstagram Reel Scraperでリールを取得
3. 投稿日14日以内に限定
4. 投稿者usernameを抽出
5. Instagram Profile Scraperでfollowers / posts_countを取得
6. リール1本のviews ÷ followers を計算
7. 条件一致だけを表示

## 初期条件
- followers >= 10,000
- posts_count < 180
- views / followers >= 3
- 投稿日14日以内
- 7日以内を優先

## Apify
- Reel Scraper: zaver.api/instagram-reel-scraper
- Profile Scraper: zaver.api/instagram-profile-scraper
- 無料プランの月$5クレジットを使用可能
- 1タグ最大取得数をアプリ側で制限可能
- APIトークンはGitHubには保存しない
- 「端末に保存」を選んだ場合のみlocalStorageへ保存

## 料金目安
Reel Scraper: $0.99 / 1,000 reels
Profile Scraper: $1.49 / 1,000 profiles

30件/タグで、30件すべてが別アカウントなら最大目安は約$0.07/タグです。
