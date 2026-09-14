# 自由意志大政奉還

完全静的な自己統治インターフェースです。Webアプリ内部ではAI推論を行わず、入力・保存・構造化・表示・状態監査・ZIP入出力だけを担当します。

## 実装済み

- React + TypeScript + Vite
- IndexedDB自動保存 / 再開
- 簡易入力（心理質問60問）
- 詳細入力（14セクション + 心理質問150問）
- 自由意志の記入内容リセット
- 心理5件法の選択解除（選択済み項目を再選択）
- 入力補助用のChatGPT貼り付けプロンプト
- 自由意志ZIP import / export
- **手入力とは独立した「ChatGPT Memoryから大政奉還」依頼ZIP export**
- 大政奉還ZIP **import only**（サイト側からは変更・追記しない）
- JSON Schema検証（Ajv）
- audit-modelのstate/question参照整合性検証
- 基本方針表示 / レスポンシブ方針グラフ
- 状態監査（事前確率、tempered Bayesian update、期待情報利得、質問類似度を考慮した動的選択、最低探索数、停止条件）
- 主状態 + 副状態候補 + 上位候補分布表示
- 行動決定は主状態のみ、副状態は解釈補助
- 状態監査の「1問戻る」
- 状態監査履歴のローカル保存 / 日・週・月別ダッシュボード集計
- 主状態・副状態・状態遷移・最近30日の構成変化などの記述的傾向表示
- 現在の大政奉還 + 状態監査履歴をまとめたポータブルバックアップZIP import / export
- 異議申し立てを大政奉還本体と分離した独立下書きとして自動保存
- 複数の変更対象を同時記入できる異議申し立てフォーム
- 異議申し立て記入のリセット
- `objection.zip` export → ChatGPT再審査 → 新しい `taiseihoukan.zip` import
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

入力データはIndexedDB `jiyuu-ishi-taiseihoukan` に自動保存します。IndexedDBは端末内の作業保存領域であり、端末間同期の正本ではありません。外部DB、認証、LLM API、OpenAI API等は使用しません。

大政奉還を読み込んだ場合、可能な限り元の `taiseihoukan.zip` 自体をBlobとしてIndexedDBに保持します。状態監査履歴は別データとして蓄積し、バックアップ時に両者を束ねます。

「記入内容をリセット」は自由意志側の簡易入力・詳細入力・心理回答・進捗だけを初期化します。読み込み済みの大政奉還データと状態監査履歴は削除しません。

異議申し立ては `objectionDraft` として大政奉還本体から独立してIndexedDBへ自動保存します。異議申し立て側の「記入内容をリセット」はこの下書きだけを初期化し、現在有効な大政奉還には触れません。

## 自由意志の2経路

### A. 自分で入力する

簡易入力または詳細入力から `free-will.json` を作成し、ChatGPTへ渡します。

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

### B. ChatGPT Memoryから大政奉還する

**Aの入力内容とは混合しません。** サイト内の `free-will.json` やフォーム内容をZIPに入れず、ChatGPTが現在利用可能なMemory・会話文脈だけを情報源として人物情報を構造化し、そのまま `taiseihoukan.zip` を生成するよう依頼します。

`memory-taiseihoukan-request_YYYY-MM-DD.zip`

```text
memory-taiseihoukan-request/
├── manifest.json
├── README_FOR_CHATGPT.md
├── generation_prompt.md
└── schemas/
    ├── free-will.schema.json
    └── taiseihoukan.schema.json
```

サイト自身がChatGPT Memoryへアクセスする機能ではありません。ZIPを利用者自身がChatGPTへアップロードします。

## 大政奉還ZIP

`taiseihoukan.zip` はChatGPT等の外部分析が生成する**読み取り専用の規範データ**として扱います。サイトでは読み込みだけを行い、監査履歴や異議申し立てを追記して再出力しません。

```text
taiseihoukan/
├── manifest.json
├── policy.json
├── personal-model.json
├── audit-model.json
├── analysis.md
└── schemas/
    └── taiseihoukan.schema.json
```

旧形式のZIPに `audit-history.json` や `objections.json` が含まれる場合は互換読み込みしますが、運用データを大政奉還本体から分離した正規形へ内部的に正規化します。

## ポータブルバックアップ

状態監査履歴はIndexedDBへ自動保存されますが、端末・ブラウザを跨いでは自動同期されません。そのため、現在有効な大政奉還と監査履歴だけをまとめたバックアップZIPを用意します。

`taiseihoukan-backup_YYYY-MM-DD.zip`

```text
taiseihoukan-backup/
├── manifest.json
├── taiseihoukan.zip
├── audit-history.json
├── README.md
└── schemas/
    └── audit-history.schema.json
```

- 元の `taiseihoukan.zip` を保持している場合はそのBlobをそのまま格納
- SHA-256をmanifestへ記録し、復元時に整合性確認
- 自由意志フォームと異議申し立て下書きは含めない
- 別端末では「バックアップを読み込む」で大政奉還 + 監査履歴を復元

## 監査履歴ダッシュボード

状態監査履歴は以下の粒度で集計できます。

- 日ごと: 直近30日
- 週ごと: 直近12週
- 月ごと: 直近12か月
- 各期間の監査回数、最多主状態、平均主状態確率、平均質問数
- 主状態 / 副状態の出現構成
- 最頻状態、同一主状態の連続率、高信頼度判定率
- 直近30日とその前30日の状態構成差
- 監査間の主状態遷移
- 最近の監査一覧

この集計は記述的な観測専用です。履歴を次回監査のpriorへ自動反映しないため、過去の判定が自己強化的に次の判定を固定することを避けています。

## 異議申し立てZIP

異議申し立て画面では、目的・長期目標・中期目標・優先順位・制約・維持条件・変更条件・終了条件・状態監査モデル・その他を**一度に複数記入**できます。選択式で1項目ずつ登録する方式ではありません。

`objection_YYYY-MM-DD.zip`

```text
objection/
├── manifest.json
├── objection.json
├── README_FOR_CHATGPT.md
├── generation_prompt.md
├── current-taiseihoukan/
│   ├── policy.json
│   ├── personal-model.json
│   ├── audit-model.json
│   └── analysis.md
├── audit-history.json
└── schemas/
    ├── objection.schema.json
    └── taiseihoukan.schema.json
```

処理フローは以下です。

```text
現在の taiseihoukan
        +
独立した objectionDraft
        ↓
objection.zip
        ↓
ChatGPTで再審査
        ↓
新しい taiseihoukan.zip
        ↓
サイトへ読み込み、現在方針を置換
```

新しい大政奉還ZIPを正常に読み込むと、異議申し立て下書きは「処理済み」とみなして自動リセットします。旧形式の `taiseihoukan.zip` に `objections.json` が含まれていても読み込み互換性は維持しますが、その内容は新しい大政奉還本体へ取り込みません。

## 状態監査アルゴリズム v2

目的は、現在の状態パターンを判定して、あらかじめ定義された行動様式へ機械的にルーティングすることです。恒常的な人格診断には使いません。

1. stateごとのpriorを正規化
2. AI生成likelihoodをそのまま「校正済み確率」とみなさず、power temperingで1回答の影響を弱める
3. 未質問の各questionについて期待情報利得を計算
4. 既出質問と識別パターンが近すぎる質問に軽いペナルティを与え、同じ方向の確認だけに偏らないようにする
5. 回答ごとに事後分布を更新
6. **3問目以降、候補が十分に安定した時点で早期終了**
7. 主状態の確率50%以上、2位との差15ポイント以上、直近の順位安定、次質問後の1位維持率85%以上を採用条件とする
8. 絞り込みが続く場合は質問バンクを使い切るまで継続し、条件未達でも最上位候補を暫定判定として採用する
9. `判断できない` は分布を更新しないが質問済みとして扱う
10. 誤入力時は「1問戻る」で直前回答を取り消し、分布を最初から再計算

結果画面では、条件を満たした場合は「主状態」、満たさない場合は「暫定主状態」を行動決定に使います。暫定判定では信頼度を低く保ち、副状態候補は表示しません。副状態の推奨処理・回避処理は自動的には混合しません。優先順位は次の通りです。

1. 基本方針の制約・維持条件
2. 主状態の推奨処理・回避処理
3. 副状態は解釈補助のみ

これにより、主状態と副状態の行動指示が矛盾して利用者が再び判断を迫られることを避けます。

## サンプル

`examples/sample-taiseihoukan.zip` はUI・import・監査動作確認用です。実運用の人物分析結果ではありません。

## 仕様

`docs/SPEC.md` は初版仕様を保存しています。実運用後の変更点は `docs/IMPLEMENTATION_NOTES.md` の最新版（v1.3）を優先してください。
