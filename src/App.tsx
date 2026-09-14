import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Notice, Panel } from './components/Common';
import { DetailedForm, FreeWillReview, QuickForm } from './components/FreeWillForms';
import { AuditRunner, ObjectionForm, PolicyView } from './components/Taiseihoukan';
import { loadAppState, saveAppState } from './lib/db';
import { exportFreeWillZip, exportTaiseihoukanZip, importFreeWillZip, importTaiseihoukanZip } from './lib/zip';
import type { AppState, AuditHistoryEntry, FreeWillData, Objection } from './types';

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

const defaultState: AppState = { initialized: false, freeWill: newFreeWill(), taiseihoukan: null, auditHistory: [] };

type Area = 'freewill' | 'taisei';
type FreeRoute = 'home' | 'quick' | 'detailed' | 'review';
type TaiseiRoute = 'home' | 'policy' | 'audit' | 'objection';

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [area, setArea] = useState<Area>('freewill');
  const [freeRoute, setFreeRoute] = useState<FreeRoute>('home');
  const [taiseiRoute, setTaiseiRoute] = useState<TaiseiRoute>('home');
  const [exportKind, setExportKind] = useState<'free' | 'memory' | 'taisei' | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const freeInputRef = useRef<HTMLInputElement>(null);
  const taiseiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAppState().then((stored) => {
      if (stored) {
        setState(stored);
        if (stored.taiseihoukan) setArea('taisei');
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
      const yes = state.taiseihoukan ? window.confirm('既存の大政奉還データを置き換えます。続行しますか？') : true;
      if (!yes) return;
      setState((s) => ({ ...s, initialized: true, taiseihoukan: data, auditHistory: [] }));
      setArea('taisei'); setTaiseiRoute('policy');
      setMessage({ tone: warnings.length ? 'warn' : 'info', text: warnings.length ? `読み込みました。警告: ${warnings.join(' / ')}` : '大政奉還ZIPを読み込みました。' });
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'ZIPの読み込みに失敗しました。' }); }
  };

  const doExport = async () => {
    try {
      if (exportKind === 'free') await exportFreeWillZip(state.freeWill, false);
      if (exportKind === 'memory') await exportFreeWillZip(state.freeWill, true);
      if (exportKind === 'taisei') await exportTaiseihoukanZip(state);
      setExportKind(null);
    } catch (e) { setMessage({ tone: 'error', text: e instanceof Error ? e.message : '書き出しに失敗しました。' }); setExportKind(null); }
  };

  const addAuditHistory = (entry: AuditHistoryEntry) => setState((s) => ({ ...s, auditHistory: [...s.auditHistory, entry] }));
  const addObjection = (objection: Objection) => setState((s) => s.taiseihoukan ? ({ ...s, taiseihoukan: { ...s.taiseihoukan, objections: [...s.taiseihoukan.objections, objection] } }) : s);

  const currentLongTerm = state.taiseihoukan?.policy.longTermGoal ?? '';
  const footerSave = saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '保存済み' : saveStatus === 'error' ? '保存エラー' : '';

  if (!loaded) return <div className="loading-screen">ローカルデータを確認中</div>;

  if (!state.initialized && !state.taiseihoukan) {
    return <div className="onboarding-shell">
      <main className="onboarding-card">
        <p className="eyebrow">STATIC SELF-GOVERNANCE INTERFACE</p>
        <h1>自由意志大政奉還</h1>
        <p>入力内容はこのブラウザ内に保存されます。AI推論はこのWebアプリ内では実行しません。</p>
        <div className="onboarding-actions">
          <Button variant="primary" onClick={() => { setState((s) => ({ ...s, initialized: true })); setFreeRoute('quick'); }}>自由意志を入力する</Button>
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
          <button onClick={() => setExportKind('memory')}>Memoryに入力を委ねるZIP</button>
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
        {area === 'freewill' && <FreeWillArea route={freeRoute} setRoute={setFreeRoute} data={state.freeWill} onChange={updateFreeWill} onImport={() => freeInputRef.current?.click()} onExport={() => setExportKind('free')} onMemory={() => setExportKind('memory')} />}
        {area === 'taisei' && <TaiseiArea route={taiseiRoute} setRoute={setTaiseiRoute} state={state} onImport={() => taiseiInputRef.current?.click()} onExport={() => setExportKind('taisei')} onAuditComplete={addAuditHistory} onObjection={addObjection} />}
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
      <p>このファイルには入力した個人情報・自分史・心理測定結果が含まれる可能性があります。</p>
      {exportKind === 'memory' && <Notice tone="warn">このZIPはChatGPT側でMemoryを参照して入力を補完するための依頼ファイルです。サイト自身がMemoryへアクセスすることはありません。</Notice>}
    </Modal>}
  </div>;
}

function FreeWillArea({ route, setRoute, data, onChange, onImport, onExport, onMemory }: { route: FreeRoute; setRoute: (r: FreeRoute) => void; data: FreeWillData; onChange: (d: FreeWillData) => void; onImport: () => void; onExport: () => void; onMemory: () => void }) {
  if (route === 'quick') return <QuickForm data={data} onChange={onChange} />;
  if (route === 'detailed') return <DetailedForm data={data} onChange={onChange} />;
  if (route === 'review') return <FreeWillReview data={data} />;
  return <div className="stack-lg">
    <Panel><p className="eyebrow">自由意志</p><h1>入力・構造化</h1><p>簡易入力と詳細入力は同一スキーマを使用します。途中でもZIPを書き出せます。</p><div className="action-row"><Button variant="primary" onClick={() => setRoute('quick')}>簡易入力</Button><Button onClick={() => setRoute('detailed')}>詳細入力</Button><Button onClick={() => setRoute('review')}>入力内容確認</Button></div></Panel>
    <div className="dashboard-grid">
      <Panel><h3>ZIP</h3><p>現在の入力途中データもそのまま書き出せます。</p><div className="action-row"><Button onClick={onImport}>読み込む</Button><Button onClick={onExport}>書き出す</Button></div></Panel>
      <Panel><h3>ChatGPT Memory補助</h3><p>手入力の代わりに、ChatGPTが利用可能なMemory・会話文脈から free-will.json を構成するための依頼ZIPを作ります。</p><Button onClick={onMemory}>Memory用ZIPを書き出す</Button></Panel>
    </div>
  </div>;
}

function TaiseiArea({ route, setRoute, state, onImport, onExport, onAuditComplete, onObjection }: { route: TaiseiRoute; setRoute: (r: TaiseiRoute) => void; state: AppState; onImport: () => void; onExport: () => void; onAuditComplete: (e: AuditHistoryEntry) => void; onObjection: (o: Objection) => void }) {
  const data = state.taiseihoukan;
  if (!data) return <div className="stack-lg"><Panel><p className="eyebrow">大政奉還</p><h1>分析結果を読み込む</h1><p>ChatGPT等の外部分析で生成した taiseihoukan.zip を読み込んでください。</p><Button variant="primary" onClick={onImport}>大政奉還を読み込む</Button></Panel></div>;
  if (route === 'policy') return <PolicyView data={data} />;
  if (route === 'audit') return <AuditRunner data={data} onComplete={onAuditComplete} />;
  if (route === 'objection') return <ObjectionForm existing={data.objections} onSubmit={onObjection} />;
  return <div className="stack-lg">
    <Panel><p className="eyebrow">大政奉還</p><h1>基本方針</h1><p className="lead">現在の長期目標：{data.policy.longTermGoal}</p><div className="action-row"><Button variant="primary" onClick={() => setRoute('audit')}>状態監査を開始</Button><Button onClick={() => setRoute('policy')}>基本方針</Button><Button onClick={() => setRoute('objection')}>異議申し立て</Button></div></Panel>
    <div className="dashboard-grid"><Panel><h3>状態監査履歴</h3><strong className="large-number">{state.auditHistory.length}</strong><p>履歴分析・グラフ化はMVPでは行いません。書き出しZIPには含まれます。</p></Panel><Panel><h3>再審査</h3><p>異議申し立てや監査履歴を含むZIPを外部分析へ再提出できます。</p><Button onClick={onExport}>大政奉還を書き出す</Button></Panel></div>
  </div>;
}
