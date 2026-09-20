# AI 3D Maker v2.2 無料ローカル版

外部の有料3D APIは使いません。

スマホは操作画面だけを担当し、3D生成は自分のPCで **TripoSR** を実行します。

## 費用
- 外部API利用料: 0円
- TripoSR: オープンソース
- 生成処理: 自分のPC

インターネットは初回セットアップ・モデル取得などに使います。

## TripoSR
公式:
https://github.com/VAST-AI-Research/TripoSR

公式のrun.pyはCUDAが無い場合CPUへフォールバックします。
GPU利用時の標準設定は単一画像で約6GB VRAMが目安と公式READMEに記載されています。

## 起動の考え方

1. PCにTripoSRをセットアップ
2. このbackendをPCで起動
3. スマホとPCを同じWi-Fiに接続
4. スマホで `http://PCのIP:8000/` を開く
5. 画像を選んで3D生成
6. GLBを保存

GitHub Pages版は確認用です。
実生成時はPCが配信する画面をスマホで直接開く方が、HTTPS/HTTPの制約を避けられます。

## backend API
- `GET /health`
- `POST /extract`
- `POST /reconstruct`
- `GET /jobs/:id`
- `GET /models/:file.glb`

## 環境変数
- `TRIPOSR_PATH`: TripoSRフォルダー
- `TRIPOSR_DEVICE`: 既定 `cuda:0`
- `TRIPOSR_MC_RESOLUTION`: 既定 `192`
- `PORT`: 既定 `8000`
