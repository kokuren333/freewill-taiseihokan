import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, Notice, Panel } from './components/Common';
import { DetailedForm, FreeWillReview, QuickForm } from './components/FreeWillForms';
import { AuditRunner, ObjectionForm, PolicyView } from './components/Taiseihoukan';
import { newObjectionDraft, normalizeObjectionDraft } from './data/objection';
import { loadAppState, saveAppState } from './lib/db';
import { exportFreeWillZip, exportMemoryTaiseihoukanRequestZip, exportObjectionZip, exportTaiseihoukanZip, importFreeWillZip, importTaiseihoukanZip } from './lib/zip';
import type { AppState, AuditHistoryEntry, FreeWillData, ObjectionDraft, ObjectionTargetKey, TaiseihoukanData } from './types';

function newFreeWill(): FreeWillData {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0', mode: 'quick', createdAt: now, updatedAt: now,
    profile: {}, lifeHistory: {},
    psychometrics: { questionSetVersion: '1.0.0', responses: {}, consistency: 'insufficient', scores: {} },
    preferences: {}, goals: {}, constraints: {},
    meta: { completedSections: [], skippedSections: [] },
  };
}

const defaultState: AppState = { initialized: false, freeWill: newFreeWill(), taiseihoukan: null, auditHistory: [], objectionDraft: newObjectionDraft() };

const legacyTargetMap: Record<string, ObjectionTargetKey> = {
  '目的': 'purpose', '長期目標': 'longTermGoal', '中期目標': 'midTermGoals', '優先順位': 'priorities', '制約': 'constraints', '維持条件': 'maintenanceConditions', '変更条件': 'changeConditions', '終了条件': 'endConditions', '状態監査モデル': 'auditModel', 'その他': 'other',
};

function stripLegacyObjections(value: TaiseihoukanData | (TaiseihoukanData & { objections?: unknown[] }) | null): TaiseihoukanData | null {
  if (!value) return null;
  return { manifest: value.manifest, policy: value.policy, personalModel: value.personalModel, auditModel: value.auditModel, analysis: value.analysis };
}

function migrateStoredState(stored: AppState): AppState {
  const raw = stored as AppState & { objectionDraft?: ObjectionDraft; taiseihoukan?: (TaiseihoukanData & { objections?: Array<Record<string, unknown>> }) | null };
  let draft = normalizeObjectionDraft(raw.objectionDraft);
  const legacy = raw.taiseihoukan?.objections;
  if (!raw.objectionDraft && Array.isArray(legacy) && legacy.length) {
    const targetChanges = { ...draft.targetChanges };
    const extras: string[] = [];
    for (const item of legacy) {
      const key = legacyTargetMap[String(item.target ?? 'その他')] ?? 'other';
      const block = [
        item.reason ? `変更理由: ${String(item.reason)}` : '',
        item.newFacts ? `新たな事実: ${String(item.newFacts)}` : '',
        item.premiseDifference ? `当初前提との差: ${String(item.premiseDifference)}` : '',
        item.attemptedResponses ? `試した対応: ${String(item.attemptedResponses)}` : '',
        item.continuationProblem ? `継続時の問題: ${String(item.continuationProblem)}` : '',
      ].filter(Boolean).join('\n');
      if (block) targetChanges[key] = [targetChanges[key], block].filter(Boolean).join('\n\n');
      extras.push(`旧形式から移行: ${String(item.target ?? 'その他')}`);
    }
    draft = { ...draft, targetChanges, additionalContext: extras.join('\n'), updatedAt: new Date().toISOString() };
  }
  return {
    initialized: Boolean(raw.initialized),
    freeWill: raw.freeWill ?? newFreeWill(),
    taiseihoukan: stripLegacyObjections(raw.taiseihoukan ?? null),
    auditHistory: Array.isArray(raw.auditHistory) ? raw.auditHistory : [],
    objectionDraft: draft,
  };
}

type Area = 'freewill' | 'taisei';
type FreeRoute = 'home' | 'quick' | 'detailed' | 'review';
type TaiseiRoute = 'home' | 'policy' | 'audit' | 'objection';
type ExportKind = 'free' | 'memory' | 'taisei' | 'objection';

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [area, setArea] = useState<Area>('freewill');
  const [freeRoute, setFreeRoute] = useState<FreeRoute>('home');
  const [taiseiRoute, setTaiseiRoute] = useState<TaiseiRoute>('home');
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const [resetFreeWillOpen, setResetFreeWillOpen] = useState(false);
  const [resetObjectionOpen, setResetObjectionOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const freeInputRef = useRef<HTMLInputElement>(null);
  const taiseiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAppState().then((stored) => {
      if (stored) {
        const migrated = migrateStoredState(stored);
        setState(migrated);
        if (migrated.taiseihoukan) setArea('taisei');
      }
    }).catch(() => setMessage({ tone: 'error', text: 'ブラウザ保存データの読み込みに失敗しました。' })).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveStatus('saving');
    const id = window.setTimeout(() => {
      saveAppState(state).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'));
    }, 450);
    return () => window.clearTimeout(id);
  }, [state, loaded]);

  const updateFreeWill = (freeWill: FreeWillData) => setState((s) => ({ ...s, initialized: true, freeWill }));
  const updateObjectionDraft = (objectionDraft: ObjectionDraft) => setState((s) => ({ ...s, objectionDraft }));

  const onFreeImport = async (file: File) => {
    try {
      const data = await importFreeWillZip(file);
      const yes = window.confirm('既存の自由意志データを置き換えます。続行しますか？');
      if (!yes) return;
      setState((s) => ({ ...s, initialized: true, freeWill: data }));
      setArea('freewill'); setFreeRoute('review');
      setMessage({ tone: 'info', text: '自由意志ZIPを読み込みました。' });
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'ZIPの読み込みに失敗しました。' }); }
  };

  const onTaiseiImport = async (file: File) => {
    try {
      const { data, warnings } = await importTaiseihoukanZip(file);
      const yes = state.taiseihoukan ? window.confirm('既存の大政奉還データを置き換えます。現在の異議申し立て下書きも解消済みとしてリセットします。続行しますか？') : true;
      if (!yes) return;
      setState((s) => ({ ...s, initialized: true, taiseihoukan: data, auditHistory: [], objectionDraft: newObjectionDraft() }));
      setArea('taisei'); setTaiseiRoute('policy');
      const base = '大政奉還ZIPを読み込みました。異議申し立て下書きはリセットしました。';
      setMessage({ tone: warnings.length ? 'warn' : 'info', text: warnings.length ? `${base} 警告: ${warnings.join(' / ')}` : base });
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'ZIPの読み込みに失敗しました。' }); }
  };

  const doExport = async () => {
    try {
      if (exportKind === 'free') await exportFreeWillZip(state.freeWill);
      if (exportKind === 'memory') await exportMemoryTaiseihoukanRequestZip();
      if (exportKind === 'taisei') await exportTaiseihoukanZip(state);
      if (exportKind === 'objection') await exportObjectionZip(state);
      setExportKind(null);
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : '書き出しに失敗しました。' }); setExportKind(null); }
  };

  const addAuditHistory = (entry: AuditHistoryEntry) => setState((s) => ({ ...s, auditHistory: [...s.auditHistory, entry] }));

  const resetFreeWill = () => {
    setState((s) => ({ ...s, initialized: true, freeWill: newFreeWill() }));
    setFreeRoute('home');
    setResetFreeWillOpen(false);
    setMessage({ tone: 'info', text: '自由意志の記入内容をリセットしました。大政奉還データは変更していません。' });
  };

  const resetObjection = () => {
    setState((s) => ({ ...s, objectionDraft: newObjectionDraft() }));
    setResetObjectionOpen(false);
    setMessage({ tone: 'info', text: '異議申し立ての記入内容をリセットしました。現在の大政奉還データは変更していません。' });
  };

  const exportMemoryFromOnboarding = async () => {
    const ok = window.confirm('このZIPには現在のフォーム入力を含めません。ChatGPTが利用可能なMemory・会話文脈だけを情報源として大政奉還を依頼します。書き出しますか？');
    if (!ok) return;
    try { await exportMemoryTaiseihoukanRequestZip(); }
    catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : '書き出しに失敗しました。' }); }
  };

  const footerSave = saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '保存済み' : saveStatus === 'error' ? '保存エラー' : '';

  if (!loaded) return <div className="loading-screen">ローカルデータを確認中</div>;

  if (!state.initialized && !state.taiseihoukan) {
    return <div className="onboarding-shell">
      <main className="onboarding-card">
        <p className="eyebrow">STATIC SELF-GOVERNANCE INTERFACE</p>
        <h1>自由意志大政奉還</h1>
        <p>入力内容はこのブラウザ内に保存されます。AI推論はこのWebアプリ内では実行しません。</p>
        <div className="onboarding-actions">
          <Button variant="primary" onClick={() => { setState((s) => ({ ...s, initialized: true })); setFreeRoute('quick'); }}>自分で自由意志を入力する</Button>
          <Button onClick={exportMemoryFromOnboarding}>ChatGPT Memoryから大政奉還する</Button>
          <Button onClick={() => freeInputRef.current?.click()}>自由意志を読み込む</Button>
          <Button onClick={() => taiseiInputRef.current?.click()}>大政奉還を読み込む</Button>
        </div>
        <p className="privacy-note">このサイトは入力内容を外部サーバへ自動送信しません。ChatGPTへ送信する場合は、書き出したZIPを利用者自身がアップロードしてください。</p>
      </main>
      <input ref={freeInputRef} hidden type="file" accept=".zip,application/zip" onChange={(e) => e.target.files?.[0] && onFreeImport(e.target.files[0])} />
      <input ref={taiseiInputRef} hidden type="file" accept=".zip,application/zip" onChange={(e) => e.target.files?.[0] && onTaiseiImport(e.target.files[0])} />
    </div>;
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand" onClick={() => area === 'freewill' ? setFreeRoute('home') : setTaiseiRoute('home')} role="button" tabIndex={0}><span>自由意志</span><strong>大政奉還</strong></div>
      <nav className="top-tabs" aria-label="トップレベルメニュー">
        <button className={area === 'freewill' ? 'active' : ''} onClick={() => setArea('freewill')}>自由意志</button>
        <button className={area === 'taisei' ? 'active' : ''} onClick={() => setArea('taisei')}>大政奉還</button>
      </nav>
      <div className={`save-indicator ${saveStatus}`}>{footerSave}</div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        {area === 'freewill' ? <>
          <p className="sidebar-label">自由意志</p>
          <button className={freeRoute === 'quick' ? 'active' : ''} onClick={() => setFreeRoute('quick')}>簡易入力</button>
          <button className={freeRoute === 'detailed' ? 'active' : ''} onClick={() => setFreeRoute('detailed')}>詳細入力</button>
          <button className={freeRoute === 'review' ? 'active' : ''} onClick={() => setFreeRoute('review')}>入力内容確認</button>
          <hr />
          <button onClick={() => freeInputRef.current?.click()}>自由意志を読み込む</button>
          <button onClick={() => setExportKind('free')}>自由意志を書き出す</button>
          <button onClick={() => setExportKind('memory')}>ChatGPT Memoryから大政奉還する</button>
          <button className="danger-link" onClick={() => setResetFreeWillOpen(true)}>記入内容をリセット</button>
        </> : <>
          <p className="sidebar-label">大政奉還</p>
          <button className={taiseiRoute === 'policy' ? 'active' : ''} onClick={() => setTaiseiRoute('policy')} disabled={!state.taiseihoukan}>基本方針</button>
          <button className={taiseiRoute === 'audit' ? 'active' : ''} onClick={() => setTaiseiRoute('audit')} disabled={!state.taiseihoukan}>状態監査</button>
          <button className={taiseiRoute === 'objection' ? 'active' : ''} onClick={() => setTaiseiRoute('objection')} disabled={!state.taiseihoukan}>異議申し立て</button>
          <hr />
          <button onClick={() => taiseiInputRef.current?.click()}>大政奉還を読み込む</button>
          <button onClick={() => setExportKind('taisei')} disabled={!state.taiseihoukan}>大政奉還を書き出す</button>
        </>}
      </aside>

      <main className="content">
        {area === 'freewill' ? <nav className="mobile-route-nav" aria-label="自由意志モバイルメニュー">
          <button onClick={() => setFreeRoute('home')}>トップ</button><button onClick={() => setFreeRoute('quick')}>簡易</button><button onClick={() => setFreeRoute('detailed')}>詳細</button><button onClick={() => setFreeRoute('review')}>確認</button><button onClick={() => freeInputRef.current?.click()}>読込</button><button onClick={() => setExportKind('free')}>書出</button>
        </nav> : <nav className="mobile-route-nav compact" aria-label="大政奉還モバイル管理">
          <button onClick={() => setTaiseiRoute('home')}>トップ</button><button onClick={() => taiseiInputRef.current?.click()}>読込</button><button disabled={!state.taiseihoukan} onClick={() => setExportKind('taisei')}>書出</button>
        </nav>}
        {message && <Notice tone={message.tone}>{message.text}<button className="notice-close" aria-label="閉じる" onClick={() => setMessage(null)}>×</button></Notice>}
        {area === 'freewill' && <FreeWillArea route={freeRoute} setRoute={setFreeRoute} data={state.freeWill} onChange={updateFreeWill} onImport={() => freeInputRef.current?.click()} onExport={() => setExportKind('free')} onMemory={() => setExportKind('memory')} onReset={() => setResetFreeWillOpen(true)} />}
        {area === 'taisei' && <TaiseiArea route={taiseiRoute} setRoute={setTaiseiRoute} state={state} onImport={() => taiseiInputRef.current?.click()} onExport={() => setExportKind('taisei')} onAuditComplete={addAuditHistory} onObjectionChange={updateObjectionDraft} onObjectionExport={() => setExportKind('objection')} onObjectionReset={() => setResetObjectionOpen(true)} />}
      </main>
    </div>

    {state.taiseihoukan && <nav className="mobile-bottom-nav" aria-label="大政奉還モバイルナビ">
      <button className={area === 'taisei' && taiseiRoute === 'policy' ? 'active' : ''} onClick={() => { setArea('taisei'); setTaiseiRoute('policy'); }}>基本方針</button>
      <button className={area === 'taisei' && taiseiRoute === 'audit' ? 'active' : ''} onClick={() => { setArea('taisei'); setTaiseiRoute('audit'); }}>状態監査</button>
      <button className={area === 'taisei' && taiseiRoute === 'objection' ? 'active' : ''} onClick={() => { setArea('taisei'); setTaiseiRoute('objection'); }}>異議申し立て</button>
    </nav>}

    <input ref={freeInputRef} hidden type="file" accept=".zip,application/zip" onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) onFreeImport(f); }} />
    <input ref={taiseiInputRef} hidden type="file" accept=".zip,application/zip" onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) onTaiseiImport(f); }} />

    {exportKind && <Modal title="書き出し確認" onClose={() => setExportKind(null)} footer={<><Button onClick={() => setExportKind(null)}>キャンセル</Button><Button variant="primary" onClick={doExport}>書き出す</Button></>}>
      {exportKind === 'memory' ? <>
        <p>このZIPには現在のフォーム入力・free-will.jsonを含めません。</p>
        <Notice tone="warn">ChatGPTが利用可能なMemory・会話文脈だけを情報源として自由意志を構成し、そのまま大政奉還を行うための依頼ZIPです。サイト自身がChatGPT Memoryへアクセスすることはありません。</Notice>
      </> : exportKind === 'objection' ? <>
        <p>現在の大政奉還のスナップショットと、別管理されている異議申し立て下書きを <code>objection.zip</code> にまとめます。</p>
        <Notice tone="info">この書き出しでは現在の大政奉還を変更しません。ZIPをChatGPTへ渡し、返された新しい <code>taiseihoukan.zip</code> を読み込んだ時点で置き換えます。</Notice>
      </> : exportKind === 'taisei' ? <>
        <p>現在の大政奉還データと状態監査履歴を書き出します。</p>
        <Notice tone="info">異議申し立て下書きは大政奉還ZIPには含まれません。</Notice>
      </> : <p>このファイルには入力した個人情報・自分史・心理測定結果が含まれる可能性があります。</p>}
    </Modal>}

    {resetFreeWillOpen && <Modal title="自由意志の記入内容をリセット" onClose={() => setResetFreeWillOpen(false)} footer={<><Button onClick={() => setResetFreeWillOpen(false)}>キャンセル</Button><Button variant="danger" onClick={resetFreeWill}>リセットする</Button></>}>
      <p>簡易入力・詳細入力・心理測定回答・完了状態をすべて空に戻します。この操作は自動保存されます。</p>
      <Notice tone="warn">読み込み済みの大政奉還データと状態監査履歴は削除しません。</Notice>
    </Modal>}

    {resetObjectionOpen && <Modal title="異議申し立ての記入内容をリセット" onClose={() => setResetObjectionOpen(false)} footer={<><Button onClick={() => setResetObjectionOpen(false)}>キャンセル</Button><Button variant="danger" onClick={resetObjection}>リセットする</Button></>}>
      <p>変更対象ごとの記入内容と、再審査のための共通情報をすべて空に戻します。</p>
      <Notice tone="warn">現在の大政奉還データと状態監査履歴は変更しません。</Notice>
    </Modal>}
  </div>;
}

function FreeWillArea({ route, setRoute, data, onChange, onImport, onExport, onMemory, onReset }: { route: FreeRoute; setRoute: (r: FreeRoute) => void; data: FreeWillData; onChange: (d: FreeWillData) => void; onImport: () => void; onExport: () => void; onMemory: () => void; onReset: () => void }) {
  if (route === 'quick') return <QuickForm data={data} onChange={onChange} />;
  if (route === 'detailed') return <DetailedForm data={data} onChange={onChange} />;
  if (route === 'review') return <FreeWillReview data={data} />;
  return <div className="stack-lg">
    <Panel><p className="eyebrow">自由意志</p><h1>自由意志の取得方法</h1><p>手入力とChatGPT Memoryは独立した2つの経路です。Memory経路に現在のフォーム入力は混合しません。</p></Panel>
    <div className="dashboard-grid">
      <Panel><h3>方法A：自分で入力する</h3><p>簡易入力または詳細入力から自由意志データを作成します。両者は同一スキーマで、途中でもZIPを書き出せます。</p><div className="action-row"><Button variant="primary" onClick={() => setRoute('quick')}>簡易入力</Button><Button onClick={() => setRoute('detailed')}>詳細入力</Button><Button onClick={() => setRoute('review')}>入力内容確認</Button></div><div className="action-row"><Button onClick={onImport}>自由意志を読み込む</Button><Button onClick={onExport}>自由意志を書き出す</Button><Button variant="danger" onClick={onReset}>記入内容をリセット</Button></div></Panel>
      <Panel><h3>方法B：ChatGPT Memoryから大政奉還する</h3><p>サイト内の記入内容を使わず、ChatGPTが利用可能なMemory・会話文脈だけから自由意志を構成し、そのまま大政奉還ZIPを生成させる依頼ZIPを書き出します。</p><Notice tone="info">この経路では free-will.json をサイトから同梱しません。手入力データとの混合は行いません。</Notice><div className="action-row"><Button onClick={onMemory}>ChatGPT Memoryから大政奉還する</Button></div></Panel>
    </div>
  </div>;
}

function TaiseiArea({ route, setRoute, state, onImport, onExport, onAuditComplete, onObjectionChange, onObjectionExport, onObjectionReset }: { route: TaiseiRoute; setRoute: (r: TaiseiRoute) => void; state: AppState; onImport: () => void; onExport: () => void; onAuditComplete: (e: AuditHistoryEntry) => void; onObjectionChange: (draft: ObjectionDraft) => void; onObjectionExport: () => void; onObjectionReset: () => void }) {
  const data = state.taiseihoukan;
  if (!data) return <div className="stack-lg"><Panel><p className="eyebrow">大政奉還</p><h1>分析結果を読み込む</h1><p>ChatGPT等の外部分析で生成した taiseihoukan.zip を読み込んでください。</p><Button variant="primary" onClick={onImport}>大政奉還を読み込む</Button></Panel></div>;
  if (route === 'policy') return <PolicyView data={data} />;
  if (route === 'audit') return <AuditRunner data={data} onComplete={onAuditComplete} />;
  if (route === 'objection') return <ObjectionForm draft={state.objectionDraft} onChange={onObjectionChange} onExport={onObjectionExport} onReset={onObjectionReset} />;
  return <div className="stack-lg">
    <Panel><p className="eyebrow">大政奉還</p><h1>基本方針</h1><p className="lead">現在の長期目標：{data.policy.longTermGoal}</p><div className="action-row"><Button variant="primary" onClick={() => setRoute('audit')}>状態監査を開始</Button><Button onClick={() => setRoute('policy')}>基本方針</Button><Button onClick={() => setRoute('objection')}>異議申し立て</Button></div></Panel>
    <div className="dashboard-grid"><Panel><h3>状態監査履歴</h3><strong className="large-number">{state.auditHistory.length}</strong><p>履歴分析・グラフ化はMVPでは行いません。大政奉還の書き出しと異議申し立てZIPの補助資料に含まれます。</p></Panel><Panel><h3>再審査</h3><p>基本方針への異議は大政奉還本体へ追記せず、独立した異議申し立て状態として作成します。</p><div className="action-row"><Button variant="primary" onClick={() => setRoute('objection')}>異議申し立てを作成</Button><Button onClick={onExport}>現在の大政奉還を書き出す</Button></div></Panel></div>
  </div>;
}
