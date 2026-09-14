import React, { useMemo, useState } from 'react';
import type { AuditAnswer, AuditHistoryEntry, ObjectionDraft, TaiseihoukanData } from '../types';
import type { Distribution } from '../lib/audit';
import { AUDIT_MAX_QUESTIONS, AUDIT_MIN_QUESTIONS, AUDIT_TARGET_QUESTIONS, chooseNextQuestion, confidenceFor, distributionAfterAnswers, influentialAnswers, initialDistribution, rankedStates, secondaryCandidate, shouldStop, updateDistribution } from '../lib/audit';
import { Button, Notice, Panel, ProgressBar } from './Common';
import { objectionTargetCount, objectionTargetLabels } from '../data/objection';

export function PolicyGraph({ data }: { data: TaiseihoukanData }) {
  const p = data.policy;
  return <div className="policy-graph" aria-label="基本方針グラフ">
    <div className="graph-root"><span>目的</span><strong>{p.purpose}</strong></div>
    <div className="graph-branches">
      <div className="graph-branch graph-wide"><span>長期目標</span><strong>{p.longTermGoal}</strong><div className="graph-children">{p.midTermGoals.map((x, i) => <div key={i}><span>中期目標 {i + 1}</span>{x}</div>)}</div></div>
      <div className="graph-branch"><span>優先順位</span>{p.priorities.slice(0, 5).map((x, i) => <div key={i}>{i + 1}. {x}</div>)}</div>
      <div className="graph-branch"><span>制約</span>{p.constraints.slice(0, 4).map((x, i) => <div key={i}>{x}</div>)}</div>
      <div className="graph-branch"><span>維持条件</span>{p.maintenanceConditions.slice(0, 4).map((x, i) => <div key={i}>{x}</div>)}</div>
      <div className="graph-branch"><span>変更条件</span>{p.changeConditions.slice(0, 4).map((x, i) => <div key={i}>{x}</div>)}</div>
      <div className="graph-branch"><span>終了条件</span>{p.endConditions.slice(0, 4).map((x, i) => <div key={i}>{x}</div>)}</div>
    </div>
  </div>;
}

function ListBlock({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  return <details className="policy-block" open><summary>{title}</summary>{ordered ? <ol>{items.map((x, i) => <li key={i}>{x}</li>)}</ol> : <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>}</details>;
}

export function PolicyView({ data }: { data: TaiseihoukanData }) {
  const p = data.policy;
  return <div className="stack-lg">
    <Panel><div className="section-heading"><div><h2>基本方針</h2><p>外部分析で生成された方針を表示します。この画面から直接変更はできません。</p></div></div><PolicyGraph data={data} /></Panel>
    <div className="policy-grid">
      <Panel><h3>目的</h3><p className="policy-text">{p.purpose}</p></Panel>
      <Panel><h3>長期目標</h3><p className="policy-text">{p.longTermGoal}</p></Panel>
      <Panel><ListBlock title="中期目標" items={p.midTermGoals} /><ListBlock title="優先順位" items={p.priorities} ordered /></Panel>
      <Panel><ListBlock title="制約" items={p.constraints} /><ListBlock title="維持条件" items={p.maintenanceConditions} /></Panel>
      <Panel><ListBlock title="変更条件" items={p.changeConditions} /><ListBlock title="終了条件" items={p.endConditions} /></Panel>
    </div>
  </div>;
}

const answerOptions = [
  { value: 4, label: 'はい' }, { value: 3, label: 'ややそう' }, { value: 2, label: 'どちらともいえない' },
  { value: 1, label: 'あまり違う' }, { value: 0, label: 'いいえ' }, { value: null, label: '判断できない' },
] as const;

export function AuditRunner({ data, onComplete }: { data: TaiseihoukanData; onComplete: (entry: AuditHistoryEntry) => void }) {
  const model = data.auditModel;
  const [dist, setDist] = useState<Distribution>(() => initialDistribution(model));
  const [answers, setAnswers] = useState<AuditAnswer[]>([]);
  const [finished, setFinished] = useState(false);
  const askedIds = useMemo(() => new Set(answers.map((a) => a.questionId)), [answers]);
  const next = chooseNextQuestion(model, dist, askedIds);
  const ranked = rankedStates(dist);
  const informativeCount = answers.filter((a) => a.value !== null).length;

  const finalize = (finalDist = dist, finalAnswers = answers) => {
    const rankedFinal = rankedStates(finalDist);
    const [primaryId, probability] = rankedFinal[0] ?? ['', 0];
    const secondary = secondaryCandidate(finalDist);
    const finalInformativeCount = finalAnswers.filter((a) => a.value !== null).length;
    const primaryState = model.states.find((state) => state.id === primaryId);
    const secondaryState = secondary ? model.states.find((state) => state.id === secondary.secondaryId) : undefined;
    const entry: AuditHistoryEntry = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), answers: finalAnswers,
      primaryStateId: primaryId,
      primaryStateLabel: primaryState?.label,
      probability,
      confidence: confidenceFor(finalDist, finalInformativeCount),
      reasons: influentialAnswers(model, finalAnswers, finalDist),
      taiseihoukanRevision: String(data.manifest.createdAt ?? data.manifest.schemaVersion ?? 'unknown'),
      ...(secondary ? { secondaryStateId: secondary.secondaryId, secondaryStateLabel: secondaryState?.label, secondaryProbability: secondary.secondaryProbability } : {}),
    };
    setFinished(true);
    onComplete(entry);
  };

  const answer = (value: number | null) => {
    if (!next) return finalize();
    const newAnswers = [...answers, { questionId: next.question.id, value }];
    const newDist = updateDistribution(dist, next.question, value);
    const newAsked = new Set(newAnswers.map((a) => a.questionId));
    setAnswers(newAnswers);
    setDist(newDist);
    const stop = shouldStop(model, newDist, newAsked, newAnswers);
    if (stop.stop) finalize(newDist, newAnswers);
  };

  const undoLast = () => {
    if (!answers.length) return;
    const newAnswers = answers.slice(0, -1);
    setAnswers(newAnswers);
    setDist(distributionAfterAnswers(model, newAnswers));
    setFinished(false);
  };

  const reset = () => { setDist(initialDistribution(model)); setAnswers([]); setFinished(false); };
  const latestPrimary = model.states.find((s) => s.id === ranked[0]?.[0]);
  const secondaryInfo = secondaryCandidate(dist);
  const latestSecondary = secondaryInfo ? model.states.find((s) => s.id === secondaryInfo.secondaryId) : null;
  const confidence = confidenceFor(dist, informativeCount);

  if (finished) {
    const primary = latestPrimary;
    const topThree = ranked.slice(0, 3).map(([id, probability]) => ({ state: model.states.find((s) => s.id === id), probability })).filter((x) => x.state);
    return <div className="stack-lg">
      <Notice tone="info"><strong>決定規則:</strong> 基本方針の制約・維持条件を最優先し、その範囲内で主状態の推奨処理を採用します。副状態は解釈補助であり、主状態の行動を追加・上書きしません。</Notice>
      <Panel>
        <p className="eyebrow">主状態 / ACTION ROUTE</p>
        <h2>{primary?.label ?? '判定不能'}</h2>
        <p className="audit-prob">{Math.round((ranked[0]?.[1] ?? 0) * 100)}%</p>
        <p>信頼度: {confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低'}</p>
        <p className="muted">{answers.length}問を探索（有効回答 {informativeCount}）。推奨処理はこの主状態のみから決定します。</p>
      </Panel>
      <div className="audit-result-grid">
        <Panel><h3>推奨処理</h3><ul>{primary?.recommendedActions.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        <Panel><h3>回避処理</h3><ul>{primary?.avoidActions.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        <Panel><h3>副状態候補</h3>{latestSecondary && secondaryInfo ? <><strong>{latestSecondary.label} {Math.round(secondaryInfo.secondaryProbability * 100)}%</strong>{latestSecondary.description && <p>{latestSecondary.description}</p>}<p className="muted">副状態の recommendedActions / avoidActions は自動適用しません。主状態との矛盾を避けるための仕様です。</p></> : <p className="muted">行動決定に影響させるほど明瞭な副状態候補はありません。</p>}</Panel>
        <Panel><h3>候補分布</h3><ol className="audit-ranking">{topThree.map((x, i) => <li key={x.state!.id}><span>{i === 0 ? '主' : i === 1 ? '次' : '候補'}: {x.state!.label}</span><strong>{Math.round(x.probability * 100)}%</strong></li>)}</ol></Panel>
        <Panel><h3>根拠</h3><ul>{influentialAnswers(model, answers, dist).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        {primary?.reauditConditions?.length ? <Panel><h3>再監査条件</h3><ul>{primary.reauditConditions.map((x, i) => <li key={i}>{x}</li>)}</ul></Panel> : null}
      </div>
      <div className="action-row"><Button onClick={reset}>再監査</Button></div>
    </div>;
  }

  return <div className="audit-shell">
    <Panel>
      <div className="section-heading"><div><h2>状態監査</h2><p>現在の状態パターンを探索し、事前に定義された行動様式へルーティングします。1〜3回答だけで確定せず、複数方向から確認します。</p></div><span className="status-chip">通常 {AUDIT_TARGET_QUESTIONS}〜{AUDIT_MAX_QUESTIONS}問</span></div>
      <ProgressBar value={answers.length} max={AUDIT_MAX_QUESTIONS} label={`${answers.length} / ${AUDIT_MAX_QUESTIONS}`} />
      <p className="muted">最低探索数 {AUDIT_MIN_QUESTIONS}問。AI推論は実行せず、読み込まれた状態モデルと回答だけで次質問を選択します。</p>
    </Panel>
    {next ? <Panel className="audit-question-panel">
      <p className="eyebrow">QUESTION {answers.length + 1}</p>
      <h3>{next.question.text}</h3>
      <p className="muted">質問選択スコア: {next.selectionScore.toFixed(3)} / 情報利得: {next.informationGain.toFixed(3)} bits</p>
      <div className="audit-answer-grid">{answerOptions.map((o) => <Button key={String(o.value)} variant={o.value === null ? 'quiet' : 'default'} onClick={() => answer(o.value)}>{o.label}</Button>)}</div>
      {answers.length > 0 && <div className="audit-question-actions"><Button variant="quiet" onClick={undoLast}>1問戻る</Button><span className="muted">誤入力した場合、直前の回答を取り消して分布を再計算できます。</span></div>}
    </Panel> : <Notice tone="warn">未質問の質問候補がありません。現在分布で判定します。<div><Button onClick={() => finalize()}>判定を表示</Button></div></Notice>}
  </div>;
}

export function ObjectionForm({ draft, onChange, onExport, onReset }: { draft: ObjectionDraft; onChange: (draft: ObjectionDraft) => void; onExport: () => void; onReset: () => void }) {
  const updateTarget = (key: keyof ObjectionDraft['targetChanges'], value: string) => {
    onChange({ ...draft, updatedAt: new Date().toISOString(), targetChanges: { ...draft.targetChanges, [key]: value } });
  };
  const updateField = (key: 'newFacts' | 'premiseDifference' | 'attemptedResponses' | 'continuationProblem' | 'additionalContext', value: string) => {
    onChange({ ...draft, updatedAt: new Date().toISOString(), [key]: value });
  };
  const activeTargets = objectionTargetCount(draft);

  return <div className="stack-lg">
    <Notice tone="info"><strong>独立データ:</strong> ここで記入した異議は現在の大政奉還データへ追記されません。別の異議申し立て状態として自動保存され、<code>objection.zip</code> にだけ含まれます。ChatGPTへ渡した後は、新しい <code>taiseihoukan.zip</code> を読み込んで現在方針を置き換えます。</Notice>

    <Panel>
      <div className="section-heading">
        <div><h2>異議申し立て</h2><p>変更したい対象を複数同時に記入できます。該当しない項目は空欄のままで構いません。</p></div>
        <span className="status-chip">記入対象 {activeTargets} / {objectionTargetLabels.length}</span>
      </div>
      <div className="objection-target-grid">
        {objectionTargetLabels.map((item) => <div className="field objection-target" key={item.key}>
          <label htmlFor={`objection-${item.key}`}>{item.label}</label>
          <p className="field-help">{item.description}</p>
          <textarea id={`objection-${item.key}`} rows={4} value={draft.targetChanges[item.key]} onChange={(e) => updateTarget(item.key, e.target.value)} placeholder={`${item.label}について変更したい内容・異議がある場合のみ記入`} />
        </div>)}
      </div>
    </Panel>

    <Panel>
      <h3>再審査のための共通情報</h3>
      <p className="muted">複数の変更対象に共通する根拠をまとめて記入します。これらも任意です。</p>
      <div className="form-stack">
        <div className="field"><label htmlFor="objection-new-facts">新たに発生した事実</label><textarea id="objection-new-facts" rows={4} value={draft.newFacts} onChange={(e) => updateField('newFacts', e.target.value)} /></div>
        <div className="field"><label htmlFor="objection-premise">当初前提との相違</label><textarea id="objection-premise" rows={4} value={draft.premiseDifference} onChange={(e) => updateField('premiseDifference', e.target.value)} /></div>
        <div className="field"><label htmlFor="objection-attempted">既に試した対応</label><textarea id="objection-attempted" rows={4} value={draft.attemptedResponses} onChange={(e) => updateField('attemptedResponses', e.target.value)} /></div>
        <div className="field"><label htmlFor="objection-continuation">現行方針を継続した場合の問題</label><textarea id="objection-continuation" rows={4} value={draft.continuationProblem} onChange={(e) => updateField('continuationProblem', e.target.value)} /></div>
        <div className="field"><label htmlFor="objection-context">その他の補足</label><textarea id="objection-context" rows={4} value={draft.additionalContext} onChange={(e) => updateField('additionalContext', e.target.value)} /></div>
      </div>
    </Panel>

    <Panel>
      <h3>提出</h3>
      <p>異議申し立てZIPには、現在有効な大政奉還のスナップショット、現在の異議、状態監査履歴、再審査指示を同梱します。現在の大政奉還本体は変更しません。</p>
      <div className="action-row"><Button variant="primary" onClick={onExport}>異議申し立てZIPを書き出す</Button><Button variant="danger" onClick={onReset}>記入内容をリセット</Button></div>
      <p className="muted">最終更新: {new Date(draft.updatedAt).toLocaleString('ja-JP')}</p>
    </Panel>
  </div>;
}
