import Ajv from 'ajv';
import JSZip from 'jszip';
import type { AppState, FreeWillData, TaiseihoukanData } from '../types';
import { freeWillSchema, taiseihoukanBundleSchema } from './schemas';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFreeWill = ajv.compile(freeWillSchema);
const validateTaisei = ajv.compile(taiseihoukanBundleSchema);

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

const README_FOR_CHATGPT = `# README_FOR_CHATGPT\n\nあなたは「自由意志大政奉還」の外部分析担当です。Webアプリ内ではAI推論を行いません。このZIPの人物情報を読み、最終的に taiseihoukan.zip を生成してください。\n\n## 目的\n自分史・心理測定・希望・制約・現在資源を複数ソースとして統合し、本人が長期的に進むための基本方針と状態監査モデルを生成します。単一尺度だけで人物を判断しないでください。\n\n## 必須ルール\n1. 入力された事実と推論を分離する。\n2. 過剰な人格断定をしない。矛盾は矛盾として保持する。\n3. 医学的・精神医学的診断名を新規に付与しない。\n4. 最上位の基本方針は複数案の提示だけで終わらせず、必要な不確実性を明示した上で1つ推奨する。\n5. 自己啓発的、宗教的、芝居がかった文章を避け、無機質・事務的・分析的に書く。\n6. 状態候補は18〜30（推奨24）、質問バンクは50〜80（推奨60）。状態は診断名にしない。\n7. 状態を分けるのは推奨処理が実質的に異なる場合に限る。\n8. audit-model.json の各質問は、各状態について5回答カテゴリの条件付き確率配列を持つ。配列順は [いいえ, あまり違う, どちらともいえない, ややそう, はい]。各配列の合計は概ね1.0にする。\n9. 監査結果の推奨処理・回避処理はそれぞれ最大3件を目安とする。\n10. 出力構造とフィールド名は同梱 schema を厳守する。\n\n## 出力\ntaiseihoukan/manifest.json, policy.json, personal-model.json, audit-model.json, objections.json, analysis.md, schemas/taiseihoukan.schema.json を含む taiseihoukan.zip を返してください。\n`;

const GENERATION_PROMPT = `# generation_prompt\n\n添付ZIPを展開し、README_FOR_CHATGPT.md と schemas/taiseihoukan.schema.json を最初に読んでください。free-will.json を一次資料として扱い、summary.md は索引用にのみ使ってください。\n\nanalysis.md では、(a) 確認できた事実、(b) 推論、(c) 不確実性、(d) 矛盾、(e) 基本方針をその形にした理由、(f) 状態監査モデルの設計理由を区別してください。\n\npolicy.json は目的1〜3文、長期目標1件、中期目標2〜5件、優先順位最大5件を基本とします。変更条件は「一時的な不快・失敗・比較」ではなく、前提条件の実質変化を中心に定義してください。\n`;

const MEMORY_AUTOFILL = `# MEMORY_AUTOFILL_INSTRUCTIONS\n\nこのZIPは、フォームを手入力する代わりに、ChatGPTのMemoryおよび現在アクセス可能な会話文脈から free-will.json を作成するための依頼です。\n\n## 手順\n1. 利用可能なMemory・会話文脈から、本人について確認できる事実を収集する。\n2. 推測で埋めない。直接根拠が弱い項目は空欄のままにするか、analysis.md 側で不確実性として扱う。\n3. センシティブ情報は、分析に必要かつ文脈上明示されている場合に限り使用する。\n4. free-will.json の構造に整理したうえで、README_FOR_CHATGPT.md に従って taiseihoukan.zip まで生成する。\n5. Memoryにアクセスできない場合は、その事実を明記して処理を停止し、架空の人物像を作らない。\n\nこのモードは「Memoryの内容が正しい」ことを保証しません。矛盾・古い情報・推定を区別してください。\n`;

export async function exportFreeWillZip(data: FreeWillData, memoryAssist = false) {
  const zip = new JSZip();
  const root = zip.folder('free-will')!;
  const files = [
    'free-will.json', 'summary.md', 'README_FOR_CHATGPT.md', 'generation_prompt.md',
    'schemas/free-will.schema.json', 'schemas/taiseihoukan.schema.json',
  ];
  if (memoryAssist) files.push('MEMORY_AUTOFILL_INSTRUCTIONS.md');
  const manifest = {
    format: 'free-will', schemaVersion: '1.0.0', createdAt: new Date().toISOString(), files,
    mode: memoryAssist ? 'memory-assisted' : data.mode,
  };
  const payload: FreeWillData = memoryAssist ? { ...data, mode: 'memory-assisted', updatedAt: new Date().toISOString() } : data;
  root.file('manifest.json', json(manifest));
  root.file('free-will.json', json(payload));
  root.file('summary.md', freeWillSummary(payload));
  root.file('README_FOR_CHATGPT.md', README_FOR_CHATGPT);
  root.file('generation_prompt.md', GENERATION_PROMPT);
  if (memoryAssist) root.file('MEMORY_AUTOFILL_INSTRUCTIONS.md', MEMORY_AUTOFILL);
  root.folder('schemas')!.file('free-will.schema.json', json(freeWillSchema));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, memoryAssist ? `free-will_memory-assist_${dateStamp()}.zip` : `free-will_${dateStamp()}.zip`);
}

function reassessmentReadme(state: AppState) {
  return `# README_FOR_REASSESSMENT\n\nこのZIPは現在の大政奉還データの再審査用です。異議申し立てが ${state.taiseihoukan?.objections.length ?? 0} 件、状態監査履歴が ${state.auditHistory.length} 件あります。\n\n既存方針を変更する場合、policy.json の changeConditions に該当する事実があるかを先に検討してください。単なる一時的感情や1回の失敗だけを根拠に変更しないでください。変更する場合は analysis.md に「変更前提」「新規事実」「変更しなかった代替案」を記載してください。\n`;
}

export async function exportTaiseihoukanZip(state: AppState) {
  if (!state.taiseihoukan) throw new Error('大政奉還データがありません');
  const zip = new JSZip();
  const root = zip.folder('taiseihoukan')!;
  const t = state.taiseihoukan;
  const files = ['policy.json', 'personal-model.json', 'audit-model.json', 'objections.json', 'analysis.md', 'audit-history.json', 'README_FOR_REASSESSMENT.md', 'schemas/taiseihoukan.schema.json'];
  root.file('manifest.json', json({ format: 'taiseihoukan', schemaVersion: '1.0.0', createdAt: new Date().toISOString(), files }));
  root.file('policy.json', json(t.policy));
  root.file('personal-model.json', json(t.personalModel));
  root.file('audit-model.json', json(t.auditModel));
  root.file('objections.json', json(t.objections));
  root.file('analysis.md', t.analysis || '# 分析\n');
  root.file('audit-history.json', json(state.auditHistory));
  root.file('README_FOR_REASSESSMENT.md', reassessmentReadme(state));
  root.folder('schemas')!.file('taiseihoukan.schema.json', json(taiseihoukanBundleSchema));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, `taiseihoukan_${dateStamp()}.zip`);
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
  if (manifest.format !== 'free-will') throw new Error(`manifest.json: format が free-will ではありません`);
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
  const required = ['policy.json', 'personal-model.json', 'audit-model.json', 'objections.json', 'analysis.md', 'schemas/taiseihoukan.schema.json'];
  assertRequiredFiles(zip, required);
  assertManifestFiles(manifest, required);
  if (manifest.format !== 'taiseihoukan') throw new Error('manifest.json: format が taiseihoukan ではありません');
  if (manifest.schemaVersion !== '1.0.0') throw new Error(`manifest.json: 未対応 schemaVersion ${String(manifest.schemaVersion)}`);
  const data: TaiseihoukanData = {
    manifest,
    policy: await readJson(zip, 'policy.json'),
    personalModel: await readJson(zip, 'personal-model.json'),
    auditModel: await readJson(zip, 'audit-model.json'),
    objections: await readJson(zip, 'objections.json'),
    analysis: await readText(zip, 'analysis.md'),
  };
  const bundle = { policy: data.policy, personalModel: data.personalModel, auditModel: data.auditModel, objections: data.objections };
  if (!validateTaisei(bundle)) throw new Error(ajvErrors('taiseihoukan: ', validateTaisei.errors));
  validateAuditIntegrity(data);
  const warnings: string[] = [];
  const sc = data.auditModel.states.length;
  const qc = data.auditModel.questions.length;
  if (sc < 18 || sc > 30) warnings.push(`状態数 ${sc}。仕様上の推奨は18〜30です。`);
  if (qc < 50 || qc > 80) warnings.push(`質問数 ${qc}。仕様上の推奨は50〜80です。`);
  return { data, warnings };
}
