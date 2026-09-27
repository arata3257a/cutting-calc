# Instagram Reel Search

Instagramのハッシュタグからリール候補URLを無料で探すスマホ向けWebアプリです。

## 自動検索
Meta公式 Instagram Graph API v25.0 を使います。

1. Instagram User ID と Access Token を初回設定
2. #ハッシュタグを入力
3. ig_hashtag_search でHashtag IDを取得
4. recent_media と top_media から候補投稿を取得
5. permalink が /reel/ の投稿だけ残す
6. 投稿日が14日以内の候補だけ残す
7. 7日以内を優先して④にURL表示

## 元の判定条件
- フォロワー: 10,000人以上
- 総投稿数: 180投稿未満
- 1投稿の再生数: 投稿者フォロワー数の3倍以上
- 投稿日: 14日以内
- 優先: 7日以内

## 重要な制約
Meta公式のHashtag Searchでは、第三者のハッシュタグ投稿結果から投稿者のusername、followers_count、media_count、そのリール1本の再生数を取得できません。

そのため自動検索では
- リールURL
- 投稿日
- ハッシュタグ
を自動取得し、3倍条件は「未判定」と表示します。

④の候補を開いて必要な数値を確認したら「③へ送る」で手動判定できます。

## Meta側で必要なもの
- Instagram Business または Creator アカウント
- Instagram Graph APIが使えるMetaアプリ
- instagram_basic を含む適切な権限
- Hashtag Searchを利用できるアクセス権
- IG User ID
- Access Token

API利用自体に従量課金はありませんが、Meta側のアプリ設定・権限条件を満たす必要があります。
