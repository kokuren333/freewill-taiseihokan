# 自由意志大政奉還

完全静的な自己統治インターフェースです。Webアプリ内部ではAI推論を行わず、入力・保存・構造化・表示・状態監査・ZIP入出力だけを担当します。

## 実装済み

- React + TypeScript + Vite
- IndexedDB自動保存 / 再開
- 簡易入力（心理質問60問）
- 詳細入力（14セクション + 心理質問150問）
- 入力補助用のChatGPT貼り付けプロンプト
- 自由意志ZIP import / export
- ChatGPT Memoryに入力補完を依頼するZIP export
- 大政奉還ZIP import / export
- JSON Schema検証（Ajv）
- audit-modelのstate/question参照整合性検証
- 基本方針表示 / レスポンシブ方針グラフ
- 状態監査（事前確率、ベイズ更新、期待情報利得、動的質問選択、停止条件）
- 複合状態表示
- 状態監査履歴のローカル保存 / ZIP同梱
- 異議申し立て記録 / 再審査ZIP
- PC / スマートフォンUI
- reduced-motion / focus state / semantic HTML
- GitHub Pages workflow

## 起動

```bash
npm install
npm run dev
```

本番ビルド:

```bash
npm run build
npm run preview
```

`vite.config.ts` の `base: './'` により、GitHub Pagesのサブパス配信でも相対パスで動作します。

## データ保存

入力データはIndexedDB `jiyuu-ishi-taiseihoukan` に保存します。外部DB、認証、LLM API、OpenAI API等は使用しません。

## ZIP

### 自由意志

`free-will_YYYY-MM-DD.zip`

```text
free-will/
├── manifest.json
├── free-will.json
├── summary.md
├── README_FOR_CHATGPT.md
├── generation_prompt.md
└── schemas/
    ├── free-will.schema.json
    └── taiseihoukan.schema.json
```

Memory補助版には `MEMORY_AUTOFILL_INSTRUCTIONS.md` を追加します。サイト自身がChatGPT Memoryへアクセスする機能ではなく、利用者がZIPをChatGPTへアップロードした後にMemory利用を依頼するための形式です。

### 大政奉還

`taiseihoukan_YYYY-MM-DD.zip`

```text
taiseihoukan/
├── manifest.json
├── policy.json
├── personal-model.json
├── audit-model.json
├── objections.json
├── analysis.md
├── audit-history.json
├── README_FOR_REASSESSMENT.md
└── schemas/
    └── taiseihoukan.schema.json
```

## 状態監査アルゴリズム

1. stateごとのpriorを正規化
2. 未質問の各questionについて期待情報利得を計算
3. 最大のquestionを提示
4. 回答に対して `P(answer | state)` で事後分布を更新
5. 次のいずれかで停止
   - 1位 >= 0.75 かつ2位との差 >= 0.20（最低3問後）
   - 12問
   - 追加質問の情報利得 < 0.02（最低4問後）
6. 1位と2位が近い場合は複合状態として表示

`判断できない` は分布を更新せず、質問済みとして次の質問へ進みます。

## サンプル

`examples/sample-taiseihoukan.zip` はUI・import・監査動作確認用です。実運用の人物分析結果ではありません。

## 仕様

`docs/SPEC.md` に今回の実装指示書を同梱しています。
