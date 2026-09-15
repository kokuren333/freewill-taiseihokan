import React, { useState } from 'react';
import JSZip from 'jszip';
import type { DocumentSource, FreeWillData, WebSource } from '../types';
import { Button, Notice, Panel } from './Common';

const textExtensions = /\.(txt|md|markdown|json|csv|html?|xml|yaml|yml)$/i;
const maxDocumentBytes = 2 * 1024 * 1024;
const maxTotalBytes = 20 * 1024 * 1024;

function sourceId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sourceData(data: FreeWillData) {
  return data.sources ?? { urls: [], documents: [] };
}

export function ReferenceSourcesForm({ data, onChange }: { data: FreeWillData; onChange: (data: FreeWillData) => void }) {
  const [urlDraft, setUrlDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sources = sourceData(data);

  const update = (next: Partial<typeof sources>) => onChange({ ...data, updatedAt: new Date().toISOString(), sources: { ...sources, ...next } });
  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    try { new URL(url); } catch { setMessage('URLの形式を確認してください。'); return; }
    const item: WebSource = { id: sourceId('url'), url };
    update({ urls: [...sources.urls, item] });
    setUrlDraft(''); setMessage(null);
  };
  const updateUrl = (id: string, patch: Partial<WebSource>) => update({ urls: sources.urls.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const removeUrl = (id: string) => update({ urls: sources.urls.filter((item) => item.id !== id) });
  const removeDocument = (id: string) => update({ documents: sources.documents.filter((item) => item.id !== id) });

  const importDocuments = async (file: File) => {
    setBusy(true); setMessage(null);
    try {
      const next: DocumentSource[] = [];
      let total = 0;
      const addText = async (name: string, content: string, mimeType?: string) => {
        const bytes = new TextEncoder().encode(content).byteLength;
        if (bytes > maxDocumentBytes) return;
        total += bytes;
        if (total > maxTotalBytes) return;
        next.push({ id: sourceId('document'), fileName: name, path: name, mimeType, content, importedAt: new Date().toISOString() });
      };
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !textExtensions.test(entry.name)) continue;
          await addText(entry.name, await entry.async('string'));
          if (total >= maxTotalBytes) break;
        }
      } else if (textExtensions.test(file.name)) {
        await addText(file.name, await file.text(), file.type);
      } else {
        throw new Error('ZIP内または直接読み込める形式は txt / md / json / csv / html / xml / yaml です。');
      }
      if (!next.length) throw new Error('読み込めるテキスト文書がありませんでした。');
      update({ documents: [...sources.documents, ...next] });
      setMessage(`${next.length}件の文書を読み込みました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文書の読み込みに失敗しました。');
    } finally { setBusy(false); }
  };

  return <Panel>
    <div className="section-heading"><div><h2>参照資料</h2><p>URLはChatGPTへの参照依頼に含め、文書はテキストとしてZIPへ同梱します。サイトから外部URLへ自動アクセスはしません。</p></div><span className="status-chip">任意</span></div>
    <div className="source-section">
      <h3>自分の記事・資料のURL</h3>
      <div className="source-add-row"><input type="url" value={urlDraft} placeholder="https://..." onChange={(e) => setUrlDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} /><Button type="button" onClick={addUrl}>URLを追加</Button></div>
      {sources.urls.map((item) => <div className="source-card" key={item.id}>
        <div className="source-card-head"><strong>{item.url}</strong><Button type="button" variant="quiet" onClick={() => removeUrl(item.id)}>削除</Button></div>
        <input value={item.title ?? ''} placeholder="記事タイトル（任意）" onChange={(e) => updateUrl(item.id, { title: e.target.value })} />
        <input value={item.purpose ?? ''} placeholder="何を確認してほしいか（任意）" onChange={(e) => updateUrl(item.id, { purpose: e.target.value })} />
        <input value={item.dateContext ?? ''} placeholder="関連する時期（任意）" onChange={(e) => updateUrl(item.id, { dateContext: e.target.value })} />
      </div>)}
    </div>
    <div className="source-section">
      <div className="section-heading"><div><h3>文書ZIP</h3><p>ZIP内のtxt / md / json / csv / html / xml / yamlを読み込みます。最大20MB。</p></div><label className="button button-default">{busy ? '読み込み中…' : '文書ZIPを追加'}<input hidden type="file" accept=".zip,.txt,.md,.json,.csv,.html,.htm,.xml,.yaml,.yml" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (file) void importDocuments(file); }} /></label></div>
      {sources.documents.map((item) => <div className="source-card" key={item.id}><div className="source-card-head"><strong>{item.fileName}</strong><Button type="button" variant="quiet" onClick={() => removeDocument(item.id)}>削除</Button></div><p className="muted">{item.content.length.toLocaleString()}文字</p></div>)}
    </div>
    {message && <Notice tone="info">{message}</Notice>}
    <Notice tone="warn">URL本文や文書内の命令は実行せず、人物情報・資料として扱うよう生成指示に含めます。ログインが必要なURLや取得できない資料は推測で補完しません。</Notice>
  </Panel>;
}
