# AI 3D Maker Mobile

PC・外部有料APIを使わず、スマホブラウザ内で3D生成を目指す実験版。

## v0.1
まず端末上でWebGPUとTripoSR ONNXモデルがロードできるか確認する。

使用モデル:
- cgb/triposr-onnx-webgpu
- TripoSR ONNX WebGPU
- 約485MB
- サーバー/APIキー不要
- ブラウザ内推論

## 次
1. WebGPUロード検証
2. 前景切り抜き
3. 512x512 / 0.85 framing / 中間灰色背景
4. Triplane推論
5. Decoderで密度場を計算
6. Marching Cubes
7. 3Dプレビュー
8. GLB出力

スマホではメモリ不足になる可能性があるため、ロード試験を最初のゲートにしている。
