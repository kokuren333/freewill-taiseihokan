import Ajv from 'ajv';
import JSZip from 'jszip';
import type { AppState, FreeWillData, ObjectionDraft, TaiseihoukanData } from '../types';
import { freeWillSchema, objectionSchema, taiseihoukanBundleSchema } from './schemas';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFreeWill = ajv.compile(freeWillSchema);
const validateTaisei = ajv.compile(taiseihoukanBundleSchema);
const validateObjection = ajv.compile(objectionSchema);

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2) + '\n';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function freeWillSummary(data: FreeWillData) {
  const profileLines = Object.entries(data.profile).filter(([, v]) => v.trim()).map(([k, v]) => `- ${k}: ${v}`);
  const prefLines = Object.entries(data.preferences).filter(([, v]) => v.trim()).map(([k, v]) => `- ${k}: ${v}`);
  const completed = data.meta.completedSections.length;
  const answered = Object.values(data.psychometrics.responses).filter((v) => typeof v === 'number').length;
  return `# 自由意志データ要約\n\n- schemaVersion: ${data.schemaVersion}\n- mode: ${data.mode}\n- updatedAt: ${data.updatedAt}\n- 詳細セクション完了: ${completed} / 14\n- 心理質問回答数: ${answered}\n- 回答一貫性: ${data.psychometrics.consistency}\n\n## 基礎情報\n${profileLines.join('\n') || '- 記載なし'}\n\n## 希望・制約等\n${prefLines.join('\n') || '- 記載なし'}\n`;
}

const README_FOR_CHATGPT = `# README_FOR_CHATGPT\n\nあなたは「自由意志大政奉還」の外部分析担当です。Webアプリ内ではAI推論を行いません。このZIPの人物情報を読み、最終的に taiseihoukan.zip を生成してください。\n\n## 目的\n自分史・心理測定・希望・制約・現在資源を複数ソースとして統合し、本人が長期的に進むための基本方針と状態監査モデルを生成します。単一尺度だけで人物を判断しないでください。\n\n## 必須ルール\n1. 入力された事実と推論を分離する。\n2. 過剰な人格断定をしない。矛盾は矛盾として保持する。\n3. 医学的・精神医学的診断名を新規に付与しない。\n4. 最上位の基本方針は複数案の提示だけで終わらせず、必要な不確実性を明示した上で1つ推奨する。\n5. 自己啓発的、宗教的、芝居がかった文章を避け、無機質・事務的・分析的に書く。\n6. 状態候補は18〜30（推奨24）、質問バンクは50〜80（推奨60）。状態は診断名にしない。\n7. 状態監査の目的は、現在の精神・認知・行動上の状態パターンを判定し、意思力やその場の迷いに依存せず、事前に定義した行動様式へルーティングすること。恒常的な人格診断ではなく「今の状態」を問う。\n8. 状態を分けるのは推奨処理が実質的に異なる場合に限る。各状態の推奨処理は、他状態と混ぜなくても実行可能な具体的処理にする。\n9. 質問は状態名をそのまま尋ねず、観察可能な行動・思考・身体感覚・環境変化を複数方向から確認する。ほぼ同義の質問の量産を避ける。\n10. audit-model.json の各質問は、各状態について5回答カテゴリの条件付き確率配列を持つ。配列順は [いいえ, あまり違う, どちらともいえない, ややそう, はい]。各配列の合計は概ね1.0にする。過度に極端な確率を濫用しない。\n11. 監査結果の推奨処理・回避処理はそれぞれ最大3件を目安とする。主状態の処理だけで行動を決定できるようにする。副状態は解釈補助として扱われ、主状態を上書きしない。\n12. 出力構造とフィールド名は同梱 schema を厳守する。\n13. 異議申し立ては大政奉還データ本体へ蓄積しない。異議は別ZIPで扱うため、taiseihoukan.zip に objection history を含めない。\n\n## 出力\ntaiseihoukan/manifest.json, policy.json, personal-model.json, audit-model.json, analysis.md, schemas/taiseihoukan.schema.json を含む taiseihoukan.zip を返してください。\n`;

const GENERATION_PROMPT = `# generation_prompt\n\n添付ZIPを展開し、README_FOR_CHATGPT.md と schemas/taiseihoukan.schema.json を最初に読んでください。free-will.json を一次資料として扱い、summary.md は索引用にのみ使ってください。\n\nanalysis.md では、(a) 確認できた事実、(b) 推論、(c) 不確実性、(d) 矛盾、(e) 基本方針をその形にした理由、(f) 状態監査モデルの設計理由を区別してください。\n\npolicy.json は目的1〜3文、長期目標1件、中期目標2〜5件、優先順位最大5件を基本とします。変更条件は「一時的な不快・失敗・比較」ではなく、前提条件の実質変化を中心に定義してください。\n`;

const MEMORY_TAISEIHOUKAN_README = `# README_FOR_CHATGPT\n\nこれは「ChatGPT Memoryから大政奉還する」経路の依頼ZIPです。サイト内で記入された自由意志データは一切含まれていません。\n\n## 情報源の制約\n1. ChatGPTで現在利用可能なMemory、およびこのチャットで利用可能な過去会話由来の文脈だけを人物情報の情報源としてください。\n2. サイト内フォームの入力を推測・復元したり、存在すると仮定したりしないでください。\n3. Memoryに存在しない項目は推測で埋めず「不明」として扱ってください。\n4. Memoryの記述同士が矛盾する、古い可能性がある、確度が低い場合はその不確実性を明示してください。\n5. 医学的・精神医学的診断名を新規に付与しないでください。\n\n## 処理\nまず schemas/free-will.schema.json を内部の整理用スキーマとして使い、Memory由来の情報だけから free-will 相当の人物情報を構造化してください。その後、その構造化結果だけを材料として基本方針と状態監査モデルを生成してください。\n\n状態監査の目的は「今の状態パターンを判定し、意思力に頼らず事前定義された行動様式へルーティングすること」です。状態は18〜30、質問バンクは50〜80を目安とし、質問文に状態名を直接書かず、観察可能な行動・思考・身体感覚・環境変化から識別してください。推奨処理・回避処理は状態ごとに最大3件程度とし、主状態だけで実行方針が決まるようにしてください。\n\n## 最終出力\n最終的には taiseihoukan.zip を返してください。必須構成は次の通りです。\n\ntaiseihoukan/\n├── manifest.json\n├── policy.json\n├── personal-model.json\n├── audit-model.json\n├── analysis.md\n└── schemas/\n    └── taiseihoukan.schema.json\n\n異議申し立て履歴や objections.json は大政奉還本体へ含めないでください。異議申し立ては別の objection.zip で扱います。\n\nanalysis.md には、Memoryから確認できた事実、推論、不確実性、矛盾、基本方針の理由、状態監査モデルの設計理由を分離して記載してください。\n\nMemoryへアクセスできない場合や、人物情報がほぼ得られない場合は、架空の内容で補完せずその旨を伝えて処理を停止してください。\n`;

const MEMORY_TAISEIHOUKAN_PROMPT = `# generation_prompt\n\nこのZIPは手入力データの補完用ではありません。「手入力ルート」と「ChatGPT Memoryルート」は独立しています。\n\nREADME_FOR_CHATGPT.md を読み、ChatGPTで現在利用可能なMemory・過去会話文脈だけを情報源として人物情報を構造化し、そのまま taiseihoukan.zip を生成してください。現在のWebフォームに何が入力されているかは参照できないものとして扱い、推測で混合しないでください。\n`;

const OBJECTION_README = `# README_FOR_CHATGPT — 異議申し立て再審査\n\nこのZIPは、現在の大政奉還そのものを書き換えたデータではありません。現在の大政奉還を基準状態として保持したまま、別管理された「異議申し立て」を再審査するための依頼です。\n\n## 入力\n- objection.json: 利用者が現在提出している異議。複数の変更対象を同時に含み得ます。\n- current-taiseihoukan/: 現在有効な基本方針・人物モデル・状態監査モデル・分析。\n- audit-history.json: サイト内に保存されている状態監査履歴。補助資料であり、単独で方針変更を正当化しません。\n\n## 再審査ルール\n1. 異議を自動承認しない。新規事実、当初前提との差、既に試した対応、継続時の問題を分離して評価する。\n2. current-taiseihoukan/policy.json の changeConditions を確認する。ただし、changeConditions自体への異議や、当初想定されていない重大な前提変化がある場合は機械的な拒否条件にしない。\n3. 一時的な感情、単発の失敗、比較による焦りだけで基本方針を反転させない。\n4. 複数の変更対象が同時に提出されている場合は、項目ごとに採用・不採用・部分採用を判断し、相互依存があればまとめて整合させる。\n5. 変更不要な項目は可能な限り維持する。変更が他項目へ波及する場合だけ連動変更し、その理由を analysis.md に書く。\n6. 状態監査モデルを変更する場合も、状態18〜30、質問50〜80、現在状態から事前定義行動へのルーティング、主状態優先・副状態は解釈補助という原則を維持する。\n7. 事実と推論と不確実性を区別し、過剰な人格断定や新規の医学的診断を行わない。\n8. 異議申し立てそのものを新しい大政奉還データへ履歴として埋め込まない。\n\n## 最終出力\n再審査後は、現在の大政奉還を置き換える**新しい taiseihoukan.zip**を返してください。objection.zipを返すのではありません。\n\n必須構成:\n\ntaiseihoukan/\n├── manifest.json\n├── policy.json\n├── personal-model.json\n├── audit-model.json\n├── analysis.md\n└── schemas/\n    └── taiseihoukan.schema.json\n\nanalysis.md には少なくとも「異議の各項目に対する判断」「採用した変更」「採用しなかった変更と理由」「変更による波及」「残る不確実性」を記載してください。\n`;

const OBJECTION_PROMPT = `# generation_prompt\n\nREADME_FOR_CHATGPT.md を最初に読み、objection.json と current-taiseihoukan/ の現在状態を比較して再審査してください。異議申し立ては複数対象を一度に含むため、空欄でない targetChanges をすべて検討してください。\n\n再審査後は objection.json を更新するのではなく、置換用の新しい taiseihoukan.zip を生成してください。異議履歴は新しい大政奉還本体へ混入させないでください。\n`;

export async function exportFreeWillZip(data: FreeWillData) {
  const zip = new JSZip();
  const root = zip.folder('free-will')!;
  const files = [
    'free-will.json', 'summary.md', 'README_FOR_CHATGPT.md', 'generation_prompt.md',
    'schemas/free-will.schema.json', 'schemas/taiseihoukan.schema.json',
  ];
  const manifest = {
    format: 'free-will', schemaVersion: '1.0.0', createdAt: new Date().toISOString(), files,
    mode: data.mode,
  };
  root.file('manifest.json', json(manifest));
  root.file('free-will.json', json(data));
  root.file('summary.md', freeWillSummary(data));
  root.file('README_FOR_CHATGPT.md', README_FOR_CHATGPT);
  root.file('generation_prompt.md', GENERATION_PROMPT);
  root.folder('schemas')!.file('free-will.schema.json', json(freeWillSchema));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, `free-will_${dateStamp()}.zip`);
}

export async function exportMemoryTaiseihoukanRequestZip() {
  const zip = new JSZip();
  const root = zip.folder('memory-taiseihoukan-request')!;
  const files = [
    'README_FOR_CHATGPT.md', 'generation_prompt.md',
    'schemas/free-will.schema.json', 'schemas/taiseihoukan.schema.json',
  ];
  root.file('manifest.json', json({
    format: 'memory-taiseihoukan-request',
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    sourceMode: 'chatgpt-memory-only',
    includesFormData: false,
    files,
  }));
  root.file('README_FOR_CHATGPT.md', MEMORY_TAISEIHOUKAN_README);
  root.file('generation_prompt.md', MEMORY_TAISEIHOUKAN_PROMPT);
  root.folder('schemas')!.file('free-will.schema.json', json(freeWillSchema));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, `memory-taiseihoukan-request_${dateStamp()}.zip`);
}

export async function exportTaiseihoukanZip(state: AppState) {
  if (!state.taiseihoukan) throw new Error('大政奉還データがありません');
  const zip = new JSZip();
  const root = zip.folder('taiseihoukan')!;
  const t = state.taiseihoukan;
  const files = ['policy.json', 'personal-model.json', 'audit-model.json', 'analysis.md', 'audit-history.json', 'schemas/taiseihoukan.schema.json'];
  root.file('manifest.json', json({ format: 'taiseihoukan', schemaVersion: '1.0.0', createdAt: new Date().toISOString(), files }));
  root.file('policy.json', json(t.policy));
  root.file('personal-model.json', json(t.personalModel));
  root.file('audit-model.json', json(t.auditModel));
  root.file('analysis.md', t.analysis || '# 分析\n');
  root.file('audit-history.json', json(state.auditHistory));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, `taiseihoukan_${dateStamp()}.zip`);
}

function objectionHasContent(draft: ObjectionDraft) {
  return Object.values(draft.targetChanges).some((x) => x.trim())
    || [draft.newFacts, draft.premiseDifference, draft.attemptedResponses, draft.continuationProblem, draft.additionalContext].some((x) => x.trim());
}

export async function exportObjectionZip(state: AppState) {
  if (!state.taiseihoukan) throw new Error('再審査対象の大政奉還データがありません');
  if (!objectionHasContent(state.objectionDraft)) throw new Error('異議申し立てが未記入です');
  if (!validateObjection(state.objectionDraft)) throw new Error(ajvErrors('objection.json: ', validateObjection.errors));

  const zip = new JSZip();
  const root = zip.folder('objection')!;
  const t = state.taiseihoukan;
  const files = [
    'objection.json',
    'README_FOR_CHATGPT.md',
    'generation_prompt.md',
    'current-taiseihoukan/policy.json',
    'current-taiseihoukan/personal-model.json',
    'current-taiseihoukan/audit-model.json',
    'current-taiseihoukan/analysis.md',
    'audit-history.json',
    'schemas/objection.schema.json',
    'schemas/taiseihoukan.schema.json',
  ];
  root.file('manifest.json', json({
    format: 'objection',
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    purpose: 'request-taiseihoukan-reassessment',
    expectedOutput: 'taiseihoukan.zip',
    files,
  }));
  root.file('objection.json', json(state.objectionDraft));
  root.file('README_FOR_CHATGPT.md', OBJECTION_README);
  root.file('generation_prompt.md', OBJECTION_PROMPT);
  const current = root.folder('current-taiseihoukan')!;
  current.file('policy.json', json(t.policy));
  current.file('personal-model.json', json(t.personalModel));
  current.file('audit-model.json', json(t.auditModel));
  current.file('analysis.md', t.analysis || '# 分析\n');
  root.file('audit-history.json', json(state.auditHistory));
  root.folder('schemas')!.file('objection.schema.json', json(objectionSchema));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, `objection_${dateStamp()}.zip`);
}

function findFile(zip: JSZip, suffix: string) {
  const key = Object.keys(zip.files).find((name) => !zip.files[name].dir && (name === suffix || name.endsWith(`/${suffix}`)));
  return key ? zip.files[key] : null;
}

function assertRequiredFiles(zip: JSZip, required: string[]) {
  for (const path of required) {
    if (!findFile(zip, path)) throw new Error(`必須ファイルがありません: ${path}`);
  }
}

function assertManifestFiles(manifest: any, required: string[]) {
  if (!Array.isArray(manifest.files)) throw new Error('manifest.json: files がありません');
  const listed = new Set(manifest.files.map((x: unknown) => String(x)));
  for (const path of required) {
    if (!listed.has(path)) throw new Error(`manifest.json: files に ${path} がありません`);
  }
}

async function readJson(zip: JSZip, suffix: string) {
  const file = findFile(zip, suffix);
  if (!file) throw new Error(`必須ファイルがありません: ${suffix}`);
  const text = await file.async('string');
  try { return JSON.parse(text); } catch { throw new Error(`${suffix}: JSONを解析できません`); }
}

async function readText(zip: JSZip, suffix: string, optional = false) {
  const file = findFile(zip, suffix);
  if (!file) {
    if (optional) return '';
    throw new Error(`必須ファイルがありません: ${suffix}`);
  }
  return file.async('string');
}

function ajvErrors(prefix: string, errors: typeof validateFreeWill.errors) {
  return (errors ?? []).map((e) => `${prefix}${e.instancePath || '/'} ${e.message ?? 'invalid'}`).join('\n');
}

export async function importFreeWillZip(file: File): Promise<FreeWillData> {
  const zip = await JSZip.loadAsync(file);
  const manifest = await readJson(zip, 'manifest.json');
  const required = ['free-will.json', 'summary.md', 'README_FOR_CHATGPT.md', 'generation_prompt.md', 'schemas/free-will.schema.json', 'schemas/taiseihoukan.schema.json'];
  assertRequiredFiles(zip, required);
  assertManifestFiles(manifest, required);
  if (manifest.format !== 'free-will') throw new Error('manifest.json: format が free-will ではありません');
  if (manifest.schemaVersion !== '1.0.0') throw new Error(`manifest.json: 未対応 schemaVersion ${String(manifest.schemaVersion)}`);
  const data = await readJson(zip, 'free-will.json');
  if (!validateFreeWill(data)) throw new Error(ajvErrors('free-will.json: ', validateFreeWill.errors));
  return data as FreeWillData;
}

function validateAuditIntegrity(data: TaiseihoukanData) {
  const stateIds = data.auditModel.states.map((s) => s.id);
  const uniqueStates = new Set(stateIds);
  if (uniqueStates.size !== stateIds.length) throw new Error('audit-model.json: state id が重複しています');
  const qIds = data.auditModel.questions.map((q) => q.id);
  if (new Set(qIds).size !== qIds.length) throw new Error('audit-model.json: question id が重複しています');
  for (const q of data.auditModel.questions) {
    for (const stateId of stateIds) {
      const probs = q.likelihoods[stateId];
      if (!probs) throw new Error(`audit-model.json: question "${q.id}" に state "${stateId}" の likelihood がありません`);
      if (probs.length !== 5) throw new Error(`audit-model.json: question "${q.id}" / state "${stateId}" の likelihood は5要素必要です`);
      const sum = probs.reduce((a, b) => a + b, 0);
      if (sum <= 0) throw new Error(`audit-model.json: question "${q.id}" / state "${stateId}" の likelihood 合計が0です`);
    }
    for (const ref of Object.keys(q.likelihoods)) {
      if (!uniqueStates.has(ref)) throw new Error(`audit-model.json: unknown state id "${ref}"`);
    }
  }
}

export async function importTaiseihoukanZip(file: File): Promise<{ data: TaiseihoukanData; warnings: string[] }> {
  const zip = await JSZip.loadAsync(file);
  const manifest = await readJson(zip, 'manifest.json');
  const required = ['policy.json', 'personal-model.json', 'audit-model.json', 'analysis.md', 'schemas/taiseihoukan.schema.json'];
  assertRequiredFiles(zip, required);
  assertManifestFiles(manifest, required);
  if (manifest.format !== 'taiseihoukan') throw new Error('manifest.json: format が taiseihoukan ではありません');
  if (manifest.schemaVersion !== '1.0.0') throw new Error(`manifest.json: 未対応 schemaVersion ${String(manifest.schemaVersion)}`);
  const data: TaiseihoukanData = {
    manifest,
    policy: await readJson(zip, 'policy.json'),
    personalModel: await readJson(zip, 'personal-model.json'),
    auditModel: await readJson(zip, 'audit-model.json'),
    analysis: await readText(zip, 'analysis.md'),
  };
  const bundle = { policy: data.policy, personalModel: data.personalModel, auditModel: data.auditModel };
  if (!validateTaisei(bundle)) throw new Error(ajvErrors('taiseihoukan: ', validateTaisei.errors));
  validateAuditIntegrity(data);
  const warnings: string[] = [];
  if (findFile(zip, 'objections.json')) warnings.push('旧形式の objections.json は読み込みましたが、大政奉還本体には取り込みません。異議申し立ては独立データとして扱います。');
  const sc = data.auditModel.states.length;
  const qc = data.auditModel.questions.length;
  if (sc < 18 || sc > 30) warnings.push(`状態数 ${sc}。仕様上の推奨は18〜30です。`);
  if (qc < 50 || qc > 80) warnings.push(`質問数 ${qc}。仕様上の推奨は50〜80です。`);
  return { data, warnings };
}
