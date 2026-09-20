# AI 3D Maker v2

旧版の「1枚画像を深度で曲げる2.5D方式」をやめ、完全3D向けに作り直したフロントエンドです。

## 現在のv2.0
- 正面画像アップロード
- スマホ向け軽量トリミング
- AI切り抜きAPI接続口
- 正面/左/右/背面の4方向管理
- 手動で左右/背面画像を追加
- 4方向ターンテーブルプレビュー
- 多視点生成API接続口
- 3D再構築API接続口
- ジョブ進捗ポーリング
- GLB結果保存
- PWA対応

## 方針
完全3Dはスマホ内で無理に生成せず、GPUバックエンド側で処理します。
フロントは軽く保ちます。

## API契約

### GET /health
200を返せば接続OK。

### POST /extract
入力:
```json
{"image":"data:image/jpeg;base64,..."}
```
出力:
```json
{"image":"data:image/png;base64,..."}
```

### POST /multiview
入力:
```json
{"front":"data:image/jpeg;base64,..."}
```
出力:
```json
{"left":"...","right":"...","back":"..."}
```

### POST /reconstruct
入力:
```json
{"front":"...","left":"...","right":"...","back":"..."}
```
出力:
```json
{"jobId":"abc123"}
```

### GET /jobs/:id
処理中:
```json
{"status":"running","progress":55}
```

完了:
```json
{"status":"completed","progress":100,"resultUrl":"https://.../model.glb"}
```

## 次の開発
1. GPUバックエンド選定
2. キャラクター抽出モデル接続
3. 多視点生成モデル接続
4. 3D再構築モデル接続
5. GLB軽量化
6. STL/OBJ出力
