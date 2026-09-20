# AI 3D Maker v2

旧版の「1枚画像を深度で曲げる2.5D方式」をやめ、実際の3Dメッシュ生成へ切り替えた版です。

## 現在のv2.1
- 正面画像アップロード
- スマホ向け軽量トリミング
- AI切り抜きAPI接続
- 正面1枚からTRELLISで3D再構築
- 左/右/背面画像の任意追加
- 複数画像がある場合はTRELLISのmulti-image conditioningを使用
- ジョブ進捗ポーリング
- GLB結果保存
- PWA対応

## 重要な変更
4方向画像は必須ではありません。
TRELLISは1枚画像から直接3D生成できます。
追加の左右・背面画像がある場合だけmulti-image入力として使います。

## バックエンド
`backend/main.py` にFastAPI + TRELLIS接続を追加済みです。

- `GET /health`
- `POST /extract`
- `POST /reconstruct`
- `GET /jobs/:id`
- `GET /models/:file.glb`

`POST /multiview` は次段階で接続します。

## GPU
TRELLIS公式READMEではLinux環境とNVIDIA GPU 16GB以上が必要です。

## 次の開発
1. GPUサーバーへbackendを実配置
2. スマホからAPI接続
3. 実カード画像でTRELLIS生成テスト
4. 結果に応じて切り抜き改善
5. 必要なら多視点生成モデル追加
6. GLB軽量化 / STL / OBJ出力
