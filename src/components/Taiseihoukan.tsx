import React, { useMemo, useState } from 'react';
import type { AuditAnswer, AuditHistoryEntry, Objection, TaiseihoukanData } from '../types';
import type { Distribution } from '../lib/audit';
import { chooseNextQuestion, confidenceFor, influentialAnswers, initialDistribution, rankedStates, shouldStop, updateDistribution } from '../lib/audit';
import { Button, Notice, Panel, ProgressBar } from './Common';

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

  const finalize = (finalDist = dist, finalAnswers = answers) => {
    const rankedFinal = rankedStates(finalDist);
    const [primaryId, probability] = rankedFinal[0] ?? ['', 0];
    const [secondaryId, secondaryProbability] = rankedFinal[1] ?? ['', 0];
    const entry: AuditHistoryEntry = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), answers: finalAnswers,
      primaryStateId: primaryId, probability, confidence: confidenceFor(finalDist), reasons: influentialAnswers(model, finalAnswers, finalDist),
      ...(secondaryProbability >= 0.2 && probability - secondaryProbability < 0.2 ? { secondaryStateId: secondaryId, secondaryProbability } : {}),
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
    const stop = shouldStop(model, newDist, newAsked, newAnswers.length);
    if (stop.stop) finalize(newDist, newAnswers);
  };

  const reset = () => { setDist(initialDistribution(model)); setAnswers([]); setFinished(false); };
  const latestPrimary = model.states.find((s) => s.id === ranked[0]?.[0]);
  const latestSecondary = model.states.find((s) => s.id === ranked[1]?.[0]);

  if (finished) {
    const primary = latestPrimary;
    const secondary = ranked[1]?.[1] >= 0.2 && (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0) < 0.2 ? latestSecondary : null;
    return <div className="stack-lg">
      <Panel><p className="eyebrow">判定</p><h2>{primary?.label ?? '判定不能'}</h2><p className="audit-prob">{Math.round((ranked[0]?.[1] ?? 0) * 100)}%</p>{secondary && <p>副次状態: {secondary.label} {Math.round((ranked[1]?.[1] ?? 0) * 100)}%</p>}<p>信頼度: {confidenceFor(dist) === 'high' ? '高' : confidenceFor(dist) === 'medium' ? '中' : '低'}</p></Panel>
      <div className="audit-result-grid">
        <Panel><h3>根拠</h3><ul>{influentialAnswers(model, answers, dist).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        <Panel><h3>推奨処理</h3><ul>{primary?.recommendedActions.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        <Panel><h3>回避処理</h3><ul>{primary?.avoidActions.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul></Panel>
        {primary?.reauditConditions?.length ? <Panel><h3>再監査条件</h3><ul>{primary.reauditConditions.map((x, i) => <li key={i}>{x}</li>)}</ul></Panel> : null}
      </div>
      <Button onClick={reset}>再監査</Button>
    </div>;
  }

  return <div className="audit-shell">
    <Panel>
      <div className="section-heading"><div><h2>状態監査</h2><p>回答に応じ、候補分布を更新して次の質問を動的に選択します。</p></div><span className="status-chip">最大12問</span></div>
      <ProgressBar value={answers.length} max={12} label={`${answers.length} / 12`} />
    </Panel>
    {next ? <Panel className="audit-question-panel">
      <p className="eyebrow">QUESTION {answers.length + 1}</p>
      <h3>{next.question.text}</h3>
      <p className="muted">次質問の情報利得: {next.informationGain.toFixed(3)} bits</p>
      <div className="audit-answer-grid">{answerOptions.map((o) => <Button key={String(o.value)} variant={o.value === null ? 'quiet' : 'default'} onClick={() => answer(o.value)}>{o.label}</Button>)}</div>
    </Panel> : <Notice tone="warn">未質問の質問候補がありません。現在分布で判定します。<div><Button onClick={() => finalize()}>判定を表示</Button></div></Notice>}
  </div>;
}

export function ObjectionForm({ onSubmit, existing }: { onSubmit: (o: Objection) => void; existing: Objection[] }) {
  const empty = { target: '目的', reason: '', newFacts: '', premiseDifference: '', attemptedResponses: '', continuationProblem: '' };
  const [form, setForm] = useState(empty);
  const fields: Array<[keyof typeof empty, string]> = [
    ['reason', '変更理由'], ['newFacts', '新たに発生した事実'], ['premiseDifference', '当初前提との相違'], ['attemptedResponses', '既に試した対応'], ['continuationProblem', '現行方針を継続した場合の問題'],
  ];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...form });
    setForm(empty);
  };
  return <div className="stack-lg">
    <Notice tone="info">この画面では基本方針を直接変更しません。異議を記録し、大政奉還ZIPを書き出して外部で再審査してください。</Notice>
    <Panel><h2>異議申し立て</h2><form onSubmit={submit} className="form-stack">
      <div className="field"><label>変更対象</label><select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>{['目的','長期目標','中期目標','優先順位','制約','維持条件','その他'].map((x) => <option key={x}>{x}</option>)}</select></div>
      {fields.map(([key, label]) => <div className="field" key={key}><label>{label}</label><textarea rows={4} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
      <div><Button variant="primary" type="submit">異議を記録</Button></div>
    </form></Panel>
    {existing.length > 0 && <Panel><h3>記録済み</h3><div className="objection-list">{existing.slice().reverse().map((o) => <article key={o.id}><strong>{o.target}</strong><time>{new Date(o.createdAt).toLocaleString('ja-JP')}</time><p>{o.reason || '変更理由の記載なし'}</p></article>)}</div></Panel>}
  </div>;
}
