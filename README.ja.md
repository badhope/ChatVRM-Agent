# ChatVRM Agent (日本語)

> ブラウザで 3D キャラクターと会話できるデモアプリ — VRM アバターを読み込み、LLM 駆動のキャラクターと音声でチャットできます。
> [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM) のフォークです。

🌐 **言語**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## 概要

ChatVRM Agent は、ブラウザだけで 3D キャラクターとリアルタイムに会話できるデモです。VRM ファイルを読み込み、声を選んだら、アバターはあなたのマイクを聞き取り、LLM で返答を生成し、感情を込めた音声で読み上げ、それに合わせて表情と体を動かします。

このリポジトリは Pixiv 原本の英語優先フォークです。ドキュメントは英語が主で、中国語版と日本語版へはワンクリックで切り替えられます。

> 元リポジトリは 2024-07-18 時点のコードでアーカイブされています。今後の ChatVRM への変更を行いたい場合は、フォークして開発してください。
> 関連プロジェクトとして [local-chat-vrm](https://github.com/pixiv/local-chat-vrm) もあります（ブラウザ完結の英語版）。

## 機能

- 🎭 **VRM アバター対応** — `.vrm` ファイルを読み込むだけでブラウザに表示
- 🎤 **音声認識** — ブラウザの [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/ja/docs/Web/API/SpeechRecognition) を利用
- 🤖 **LLM 返答生成** — [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) を使用
- 🗣️ **感情 TTS** — [Koeiromap (Koemotion / rinna)](https://koemotion.rinna.co.jp/) で日本語の表情豊かな音声合成
- 👀 **表情・待機モーション** — まばたき・視線・リップシンクは [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) が担当
- ⚙️ **実行時調整** — 設定パネルで声・口調・システムプロンプトをリアルタイムに変更

## 技術スタック

| レイヤ | 技術 |
| --- | --- |
| フレームワーク | Next.js 13 (Pages Router) |
| 言語 | TypeScript 5 |
| UI | React 18, Tailwind CSS |
| 3D | three.js, @pixiv/three-vrm |
| LLM | OpenAI Chat Completions API |
| 音声合成 | Koeiromap (rinna) |
| 音声認識 | Web Speech API |

## クイックスタート

### 前提条件

- Node.js **16.14.2**（`package.json` の `engines` 参照）または互換の 16.x / 18.x
- npm
- **OpenAI API キー**（chat モデルが利用できるもの。例: `gpt-4o-mini`、`gpt-4o`、`gpt-3.5-turbo`）

### 1. クローン & インストール

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. 環境変数の設定

サンプルをコピーして値を入力：

```bash
cp .env.example .env
```

`.env` を編集：

```env
# /api/chat で使う OpenAI API キー
OPEN_AI_KEY=sk-...
```

> 💡 アプリ内の設定パネルに直接貼り付けることもできます。そのセッションでのみ使われ、ディスクには保存されません。

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

> ⚠️ 静的書き出しでは `/api/chat` と `/api/tts` をサーバー側で呼び出せません。これらのルートを使うには、Node が動くホスト（Vercel、Railway、Fly.io、自前 VPS など）にデプロイしてください。

## 設定項目

設定は起動時に環境変数から読み込まれ、実行時はアプリ内の設定パネルで変更できます。完全な一覧は [`.env.example`](./.env.example) を参照。

| 変数 | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `OPEN_AI_KEY` | サーバーでは必須 | — | OpenAI API キー。未設定時は UI で入力した値にフォールバック。 |

## ディレクトリ構成

```
ChatVRM-Agent/
├── .github/
│   ├── workflows/          # CI (next build)
│   ├── ISSUE_TEMPLATE/     # 不具合・機能要望テンプレート
│   └── PULL_REQUEST_TEMPLATE.md
├── public/                 # 静的アセット（既定 VRM、アイドルアニメ、OGP 画像）
├── src/
│   ├── components/         # React UI（チャットログ、設定、メニュー、VRM ビューア…）
│   ├── features/
│   │   ├── chat/           # OpenAI クライアント
│   │   ├── emoteController/  # まばたき・視線・表情
│   │   ├── koeiromap/      # TTS クライアント
│   │   ├── lipSync/        # 音声解析による口パク
│   │   ├── messages/       # メッセージストア・TTS オーケストレーション
│   │   └── vrmViewer/      # three.js + three-vrm ラッパー
│   ├── lib/                # VRM / VRMA ローダーとヘルパー
│   ├── pages/
│   │   ├── api/            # /api/chat, /api/tts
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   ├── styles/             # globals.css
│   └── utils/              # ヘルパー
├── .editorconfig
├── .env.example
├── .eslintrc.json
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                 # MIT（pixiv/ChatVRM 由来）
├── README.md               # 英語版メインドキュメント
├── README.zh.md
├── README.ja.md            # あなたがここを読んでいます
├── SECURITY.md
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── watch.json
```

## スクリプト

| コマンド | 動作 |
| --- | --- |
| `npm run dev` | Next.js 開発サーバーをポート 3000 で起動（HMR 有効） |
| `npm run build` | 本番ビルドを生成 |
| `npm run start` | 本番ビルドを起動 |
| `npm run export` | 静的サイトを `out/` に書き出し |
| `npm run lint` | Next.js 設定で ESLint を実行 |

## API ルート

- `POST /api/chat` — OpenAI への Chat Completion リクエストをプロキシ。Body: `{ apiKey?: string, messages: ChatMessage[] }`。未指定なら `process.env.OPEN_AI_KEY` を使用。
- `POST /api/tts` — Koeiromap で日本語音声を合成。Body: `{ text: string, speakerX: number, speakerY: number }`。

## プライバシーとデータ

- 会話履歴は**ブラウザのメモリ内**にだけ保持されます。ページを再読み込みすると消去されます。
- 音声はローカルで Web Speech API により認識され、認識テキストは OpenAI（または設定された LLM）と Koeiromap に送信されます。
- このコードベースはテレメトリやアナリティクスを収集しません。
- サードパーティのデータ取り扱いについては [OpenAI のデータ利用ポリシー](https://openai.com/policies/api-data-usage-policies) および [Koeiromap の利用規約](https://koemotion.rinna.co.jp/) を確認してください。

## コントリビュート

コントリビュート大歓迎！まず [CONTRIBUTING.md](./CONTRIBUTING.md) を読んで、[Code of Conduct](./CODE_OF_CONDUCT.md) に従ってください。不具合・機能要望は [`.github/ISSUE_TEMPLATE/`](./.github) のテンプレートから提出してください。

## セキュリティ

セキュリティ上の問題は**公開 issue に投稿しないでください**。報告手順は [SECURITY.md](./SECURITY.md) を参照してください。

## ライセンス

本プロジェクトは **MIT ライセンス** で公開しています — [LICENSE](./LICENSE) を参照。元作者は [pixiv](https://github.com/pixiv/ChatVRM)、本フォークは [@badhope](https://github.com/badhope) が保守しています。

## 謝辞

- [pixiv](https://github.com/pixiv) — 元の ChatVRM プロジェクトと [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap 感情 TTS
- [OpenAI](https://openai.com/) — Chat Completions API
- すべてのコントリビューターと、オープンソース VRM コミュニティ
