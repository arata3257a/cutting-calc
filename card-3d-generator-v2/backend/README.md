# AI 3D Maker v2 Backend

GPU側でTRELLISを動かすFastAPIバックエンドです。

## 役割
- `GET /health`
- `POST /extract` : rembgで背景除去
- `POST /reconstruct` : 正面1枚または複数方向画像から3D生成
- `GET /jobs/:id` : 進捗取得
- `GET /models/:file.glb` : 完成GLB

`POST /multiview` は次段階で接続します。
TRELLIS自体は正面1枚から直接3D化できるため、v2では先にそこを動かす方針です。

## TRELLIS
公式:
https://github.com/microsoft/TRELLIS

公式READMEではLinux + NVIDIA GPU 16GB以上が必要です。
TRELLIS-image-largeを標準ターゲットにしています。

## セットアップ概略

1. TRELLIS公式手順で環境を作る
2. TRELLIS環境内でAPI依存を追加

```bash
pip install -r requirements-api.txt
```

3. TRELLISの場所を指定

```bash
export TRELLIS_REPO_PATH=/path/to/TRELLIS
export TRELLIS_MODEL=microsoft/TRELLIS-image-large
```

4. 起動

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## フロントとの接続
AI 3D Maker v2の「AI API接続設定」に

```
https://あなたのGPUサーバー
```

を入れます。

ローカルPCで試す場合は同一LANやトンネル経由でスマホから到達できるURLが必要です。
