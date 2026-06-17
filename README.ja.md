# ChatVRM Agent (日本語)

> ブラウザで 3D キャラクターと会話できるフレームワーク — VRM アバターを読み込み、LLM 駆動のキャラクターと音声でチャットできます。

🌐 **言語**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## 概要

ChatVRM Agent は、ブラウザだけで 3D キャラクターとリアルタイムに会話できるアプリケーションです。VRM ファイルを読み込み、声を選んだら、アバターはあなたのマイクを聞き取り、LLM で返答を生成し、感情を込めた音声で読み上げ、それに合わせて表情と体を動かします。

モダンなグラスモーフィズム UI、プログレッシブディスクロージャー設定パネル、フルモバイル対応（ノッチ安全領域）、アクセシビリティ機能（ARIA ロール、フォーカス管理、モーション軽減サポート）を備えています。

## 機能

- 🎭 **VRM アバター対応** — `.vrm` ファイルを読み込むだけでブラウザに表示。カメラは全身を安定してフレーミング
- 🎤 **音声認識** — ブラウザの [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/ja/docs/Web/API/SpeechRecognition) を利用
- 🤖 **マルチ LLM** — 13 の組み込みチャットプロバイダー（OpenAI、Anthropic、OpenRouter、DeepSeek、Moonshot、Zhipu、Aliyun Bailian、Volcengine、Hunyuan、Qianfan、SiliconFlow、Ollama、Azure）+ カスタム HTTP エンドポイント
- 🗣️ **マルチ TTS** — 5 つの組み込み音声プロバイダー（Koeiromap、OpenAI TTS、ElevenLabs、Microsoft Edge TTS、カスタム HTTP）
- 👀 **表情・待機モーション** — まばたき・視線・リップシンクは [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) が担当
- 🛑 **ストリーム制御** — 停止ボタンが `AbortController` で LLM ストリームと TTS 再生キューを同時に中断
- 🌐 **国際化** — 英語 / 中国語 UI、日本語 README 翻訳
- 📱 **レスポンシブ & モバイル安全** — デスクトップ/タブレット/モバイルブレイクポイント、`env(safe-area-inset-*)` ノッチ処理、`viewport-fit=cover`
- ♿ **アクセシビリティ** — ダイアログの ARIA ロール、フォーカス管理、`prefers-reduced-motion` サポート、`backdrop-filter` の `@supports` フォールバック
- ⚙️ **実行時調整** — 設定パネルで声・口調・システムプロンプトをリアルタイムに変更

## 技術スタック

| レイヤ | 技術 |
| --- | --- |
| フレームワーク | Next.js 13 (Pages Router) |
| 言語 | TypeScript 5 |
| UI | React 18, Tailwind CSS, グラスモーフィズムデザインシステム |
| 3D | three.js, @pixiv/three-vrm |
| LLM | 13 プロバイダー、統一ストリーミングクライアント (`features/llm/`) |
| 音声合成 | 5 プロバイダー、統一合成クライアント (`features/tts/`) |
| 音声認識 | Web Speech API |

## クイックスタート

### 前提条件

- Node.js **16.14.2**（`package.json` の `engines` 参照）または互換の 16.x / 18.x
- npm
- 少なくとも1つの **LLM** プロバイダーの API キー（例: OpenAI、DeepSeek、Anthropic）
- 少なくとも1つの **TTS** プロバイダーの API キー（無料の Edge TTS を使わない場合）

### 1. クローン & インストール

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. 環境変数の設定（任意）

サンプルをコピーして値を入力。アプリ内の設定パネルでもキーを入力できます — 環境変数はデフォルト値としてのみ使用されます。

```bash
cp .env.example .env
```

`.env` を編集：

```env
# オプションのデフォルト LLM キー（アプリ内キーが空の時に使用）
OPEN_AI_KEY=sk-...
```

### 3. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで <http://localhost:3000> を開いてください。Web Speech API をフルに使うため、Chromium 系のブラウザ（Chrome / Edge）推奨です。

### 4. 本番ビルド

```bash
npm run build
npm run start
```

完全に静的な書き出し（API ルートなし、サーバーなし）：

```bash
npm run export
```

> ⚠️ 静的書き出しでは `/api/tts-edge` と `/api/chat` をサーバー側で呼び出せません。これらのルートを使うには、Node が動くホスト（Vercel、Railway、Fly.io、自前 VPS など）にデプロイしてください。

## 対応 LLM プロバイダー

LLM クライアント (`src/features/llm/`) は **OpenAI 互換** と **Anthropic ネイティブ** プロトコルに対応。**設定 → LLM プロバイダー** ドロップダウンで切り替え可能。

| プロバイダー | 地域 | プロトコル | デフォルトモデル | 備考 |
| --- | --- | --- | --- | --- |
| OpenAI | グローバル | OpenAI | `gpt-4o-mini` | ビジョン対応モデルをドロップダウンで表示 |
| Azure OpenAI | グローバル | OpenAI | *(デプロイメント名)* | カスタム baseURL 必須 |
| Anthropic (Claude) | グローバル | Anthropic | `claude-sonnet-4-5` | `x-api-key` + `anthropic-version` 使用 |
| OpenRouter | グローバル | OpenAI | `openai/gpt-4o-mini` | 1キーで500+モデル |
| DeepSeek | 中国 | OpenAI | `deepseek-chat` | `deepseek-reasoner` もあり |
| Moonshot (Kimi) | 中国 | OpenAI | `moonshot-v1-8k` | 8k/32k/128k コンテキスト |
| Zhipu AI (GLM) | 中国 | OpenAI | `glm-4.6` | `glm-4-flash` に無料枠 |
| Aliyun Bailian (Qwen) | 中国 | OpenAI | `qwen-plus` | baseURL 変更でリージョン切替 |
| Volcengine Ark (Doubao) | 中国 | OpenAI | `doubao-seed-1-6-250715` | Doubao、DeepSeek、コードモデル |
| Tencent Hunyuan | 中国 | OpenAI | `hunyuan-turbos-latest` | |
| Baidu Qianfan | 中国 | OpenAI | `deepseek-v3.2` | ERNIE + Qwen + DeepSeek |
| SiliconFlow | 中国 | OpenAI | `Qwen/Qwen3-8B` | Qwen3-8B に無料枠 |
| Ollama (ローカル) | ローカル | OpenAI | `qwen3:8b` | ローカルで `ollama serve` 実行 |

**カスタムプロバイダー** — "Custom" を選ぶか `customBaseURL: true` を設定して、任意の OpenAI 互換エンドポイント（vLLM、LiteLLM プロキシ、LM Studio、独自サーバーなど）を指定。

設定パネルには **接続テスト** ボタンがあり、最小の "ping" リクエストを送信してレスポンスを報告します。

## 対応 TTS プロバイダー

TTS クライアント (`src/features/tts/`) は 5 つのプロトコルに対応。**設定 → TTS プロバイダー** ドロップダウンで切り替え可能。

| プロバイダー | プロトコル | API キー | 音声 | コスト |
| --- | --- | --- | --- | --- |
| Koeiromap (Koemotion) | REST JSON → base64 mp3 | 任意 | 4 日本語プリセット | 無料（レート制限）/ 有料 |
| OpenAI TTS | REST → バイナリストリーム | 必須 | 6 標準音声 | 文字課金 |
| ElevenLabs | REST → バイナリストリーム | 必須 | 8 標準音声 | 無料枠 + 有料 |
| Microsoft Edge TTS | サーバープロキシ (`/api/tts-edge`) | **不要** | 8 ニューラル音声（日/英/中/韓） | 無料 |
| カスタム HTTP | REST → バイナリストリーム | 任意 | カスタム | あなたのコスト |

**カスタムプロバイダー** — エンドポイントに `{ text, voice, format, speed }` を POST し、生のオーディオバイトを返します。CosyVoice、GPT-SoVITS、LiteLLM TTS プロキシなどを組み込めます。

## スクリプト

| コマンド | 動作 |
| --- | --- |
| `npm run dev` | Next.js 開発サーバーをポート 3000 で起動（HMR 有効） |
| `npm run build` | 本番ビルドを生成 |
| `npm run start` | 本番ビルドを起動 |
| `npm run export` | 静的サイトを `out/` に書き出し |
| `npm run lint` | Next.js 設定で ESLint を実行 |
| `npm run typecheck` | `tsc --noEmit` を実行 |
| `npm test` | Vitest ユニットテストを実行 |

## API ルート

- `POST /api/chat` — OpenAI への旧サーバープロキシ。新クライアントはブラウザから直接 LLM を呼び出します。
- `POST /api/tts` — Koeiromap 無料エンドポイントへの旧サーバープロキシ。新クライアントはブラウザから直接 TTS を呼び出します。
- `POST /api/tts-edge` — Microsoft Edge TTS のサーバープロキシ。mp3 バイトストリームを返します。

## プライバシーとデータ

- 会話履歴は**ブラウザのメモリ内**にだけ保持されます。ページを再読み込みすると消去されます。
- API キーと設定は `localStorage` の `chatvrm:llm:v1` と `chatvrm:tts:v1` キーに保存されます。
- LLM と TTS の呼び出しは**ブラウザから直接**選択したプロバイダーに送信されます（Edge TTS を除く、`/api/tts-edge` プロキシを使用）。
- 音声はローカルで Web Speech API により認識され、認識テキストは選択した LLM と TTS プロバイダーに転送されます。
- このコードベースはテレメトリやアナリティクスを収集しません。

## コントリビュート

コントリビュート大歓迎！まず [CONTRIBUTING.md](./CONTRIBUTING.md) を読んで、[Code of Conduct](./CODE_OF_CONDUCT.md) に従ってください。

## セキュリティ

セキュリティ上の問題は**公開 issue に投稿しないでください**。報告手順は [SECURITY.md](./SECURITY.md) を参照してください。

## ライセンス

本プロジェクトは **MIT ライセンス** で公開しています — [LICENSE](./LICENSE) を参照。

## 謝辞

- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — VRM レンダリングライブラリ
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap 感情 TTS
- [OpenAI](https://openai.com/) — Chat Completions API + TTS
- [Anthropic](https://www.anthropic.com/) — Claude Messages API
- [ElevenLabs](https://elevenlabs.io/) — ニューラル TTS
- [Microsoft](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/) — Edge TTS ニューラル音声
- すべてのコントリビューターと、オープンソース VRM コミュニティ
