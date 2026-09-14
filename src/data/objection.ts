import type { ObjectionDraft, ObjectionTargetKey } from '../types';

export const objectionTargetLabels: Array<{ key: ObjectionTargetKey; label: string; description: string }> = [
  { key: 'purpose', label: '目的', description: '方針全体が最終的に実現しようとしていることへの異議・変更案' },
  { key: 'longTermGoal', label: '長期目標', description: '1〜5年程度の中心目標への異議・変更案' },
  { key: 'midTermGoals', label: '中期目標', description: '主要段階・中間目標への異議・追加・削除案' },
  { key: 'priorities', label: '優先順位', description: '何を先に扱うか、何を後回しにするかへの異議' },
  { key: 'constraints', label: '制約', description: '破ってはいけない条件への異議・追加・解除案' },
  { key: 'maintenanceConditions', label: '維持条件', description: '維持すべき生活・環境条件への異議・変更案' },
  { key: 'changeConditions', label: '変更条件', description: '基本方針の再審査を認める条件への異議・変更案' },
  { key: 'endConditions', label: '終了条件', description: '大政奉還を完了とみなす条件への異議・変更案' },
  { key: 'auditModel', label: '状態監査モデル', description: '状態候補、質問、推奨処理・回避処理などへの異議' },
  { key: 'other', label: 'その他', description: '上記に分類しにくい異議・変更案' },
];

export function newObjectionDraft(): ObjectionDraft {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    targetChanges: {
      purpose: '',
      longTermGoal: '',
      midTermGoals: '',
      priorities: '',
      constraints: '',
      maintenanceConditions: '',
      changeConditions: '',
      endConditions: '',
      auditModel: '',
      other: '',
    },
    newFacts: '',
    premiseDifference: '',
    attemptedResponses: '',
    continuationProblem: '',
    additionalContext: '',
  };
}

export function normalizeObjectionDraft(value: Partial<ObjectionDraft> | null | undefined): ObjectionDraft {
  const base = newObjectionDraft();
  if (!value) return base;
  return {
    ...base,
    ...value,
    schemaVersion: '1.0.0',
    targetChanges: { ...base.targetChanges, ...(value.targetChanges ?? {}) },
    createdAt: value.createdAt || base.createdAt,
    updatedAt: value.updatedAt || base.updatedAt,
  };
}

export function hasObjectionContent(draft: ObjectionDraft): boolean {
  return Object.values(draft.targetChanges).some((x) => x.trim().length > 0)
    || [draft.newFacts, draft.premiseDifference, draft.attemptedResponses, draft.continuationProblem, draft.additionalContext].some((x) => x.trim().length > 0);
}

export function objectionTargetCount(draft: ObjectionDraft): number {
  return Object.values(draft.targetChanges).filter((x) => x.trim().length > 0).length;
}
