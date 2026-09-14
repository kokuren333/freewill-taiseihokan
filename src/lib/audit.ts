import type { AuditAnswer, AuditModel, AuditQuestion } from '../types';

export type Distribution = Record<string, number>;

const EPS = 1e-12;

// audit-model.json の likelihood は個人向けにAI生成されたヒューリスティック値であり、
// 実測で十分に校正された確率とは限らない。1回答で事後確率が過度に尖らないよう、
// 条件付き確率を tempering してから利用する。
const EVIDENCE_POWER = 0.68;
const NOVELTY_WEIGHT = 0.30;
const TIE_BREAK_WEIGHT = 0.08;

export const AUDIT_MIN_QUESTIONS = 8;
export const AUDIT_TARGET_QUESTIONS = 10;
export const AUDIT_MAX_QUESTIONS = 12;

export function normalize(dist: Distribution): Distribution {
  const total = Object.values(dist).reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) {
    const keys = Object.keys(dist);
    return Object.fromEntries(keys.map((k) => [k, 1 / Math.max(keys.length, 1)]));
  }
  return Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, Math.max(0, v) / total]));
}

export function initialDistribution(model: AuditModel): Distribution {
  return normalize(Object.fromEntries(model.states.map((s) => [s.id, s.prior])));
}

export function entropy(dist: Distribution): number {
  return -Object.values(dist).reduce((acc, p) => p > 0 ? acc + p * Math.log2(p) : acc, 0);
}

function temperedWeights(question: AuditQuestion, stateId: string): number[] {
  const weights = question.likelihoods[stateId] ?? [1, 1, 1, 1, 1];
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const raw = weights.map((w) => Math.max(w, EPS) / total);
  const tempered = raw.map((p) => Math.pow(p, EVIDENCE_POWER));
  const temperedTotal = tempered.reduce((a, b) => a + b, 0) || 1;
  return tempered.map((p) => p / temperedTotal);
}

function conditional(question: AuditQuestion, stateId: string, answerIndex: number): number {
  return temperedWeights(question, stateId)[answerIndex] ?? EPS;
}

function answerProbability(question: AuditQuestion, dist: Distribution, answerIndex: number): number {
  return Object.entries(dist).reduce((sum, [stateId, pState]) => sum + pState * conditional(question, stateId, answerIndex), 0);
}

export function updateDistribution(dist: Distribution, question: AuditQuestion, answerIndex: number | null): Distribution {
  if (answerIndex === null) return dist;
  const posterior: Distribution = {};
  for (const [stateId, pState] of Object.entries(dist)) {
    posterior[stateId] = pState * conditional(question, stateId, answerIndex);
  }
  return normalize(posterior);
}

export function distributionAfterAnswers(model: AuditModel, answers: AuditAnswer[]): Distribution {
  let dist = initialDistribution(model);
  for (const answer of answers) {
    const question = model.questions.find((q) => q.id === answer.questionId);
    if (question) dist = updateDistribution(dist, question, answer.value);
  }
  return dist;
}

export function expectedInformationGain(question: AuditQuestion, dist: Distribution): number {
  const before = entropy(dist);
  let expectedAfter = 0;
  for (let answerIndex = 0; answerIndex < 5; answerIndex += 1) {
    const pAnswer = answerProbability(question, dist, answerIndex);
    if (pAnswer <= EPS) continue;
    const posterior = updateDistribution(dist, question, answerIndex);
    expectedAfter += pAnswer * entropy(posterior);
  }
  return Math.max(0, before - expectedAfter);
}

function questionFingerprint(model: AuditModel, question: AuditQuestion): number[] {
  return model.states.map((state) => {
    const probs = temperedWeights(question, state.id);
    return probs.reduce((sum, p, index) => sum + p * index, 0);
  });
}

function correlationSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = a.reduce((x, y) => x + y, 0) / a.length;
  const meanB = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  if (denom <= EPS) return 0;
  return Math.min(1, Math.abs(num / denom));
}

function noveltyFor(model: AuditModel, question: AuditQuestion, askedIds: Set<string>): number {
  if (!askedIds.size) return 1;
  const fingerprint = questionFingerprint(model, question);
  let maxSimilarity = 0;
  for (const askedId of askedIds) {
    const asked = model.questions.find((q) => q.id === askedId);
    if (!asked) continue;
    maxSimilarity = Math.max(maxSimilarity, correlationSimilarity(fingerprint, questionFingerprint(model, asked)));
  }
  return Math.max(0, 1 - maxSimilarity);
}

function pairwiseDiscrimination(question: AuditQuestion, stateA: string, stateB: string): number {
  const a = temperedWeights(question, stateA);
  const b = temperedWeights(question, stateB);
  // total variation distance: 0=識別不能, 1=完全分離
  return 0.5 * a.reduce((sum, p, index) => sum + Math.abs(p - (b[index] ?? 0)), 0);
}

export function chooseNextQuestion(model: AuditModel, dist: Distribution, askedIds: Set<string>) {
  const candidates = model.questions.filter((q) => !askedIds.has(q.id));
  if (!candidates.length) return null;
  const leaders = rankedStates(dist).slice(0, 2);
  const leaderA = leaders[0]?.[0];
  const leaderB = leaders[1]?.[0];
  const leaderMass = (leaders[0]?.[1] ?? 0) + (leaders[1]?.[1] ?? 0);
  return candidates
    .map((question) => {
      const informationGain = expectedInformationGain(question, dist);
      const novelty = noveltyFor(model, question, askedIds);
      const tieBreaker = leaderA && leaderB && askedIds.size >= 6 ? pairwiseDiscrimination(question, leaderA, leaderB) : 0;
      // 情報量を主軸にしつつ、同型質問を抑え、探索後半では上位2状態を直接識別できる質問を少し優先する。
      const selectionScore = informationGain * ((1 - NOVELTY_WEIGHT) + NOVELTY_WEIGHT * novelty)
        + TIE_BREAK_WEIGHT * leaderMass * tieBreaker;
      return { question, informationGain, novelty, tieBreaker, selectionScore };
    })
    .sort((a, b) => b.selectionScore - a.selectionScore || b.informationGain - a.informationGain)[0];
}

export function rankedStates(dist: Distribution) {
  return Object.entries(dist).sort((a, b) => b[1] - a[1]);
}

export function secondaryCandidate(dist: Distribution) {
  const ranked = rankedStates(dist);
  const [primaryId, primaryProbability] = ranked[0] ?? ['', 0];
  const [secondaryId, secondaryProbability] = ranked[1] ?? ['', 0];
  if (!secondaryId || primaryProbability <= 0) return null;
  const relative = secondaryProbability / primaryProbability;
  // 絶対確率だけでなく主状態との相対比も見る。24状態程度でも副状態を落としすぎない。
  if (secondaryProbability >= 0.12 || (secondaryProbability >= 0.08 && relative >= 0.35)) {
    return { primaryId, primaryProbability, secondaryId, secondaryProbability };
  }
  return null;
}

export function shouldStop(model: AuditModel, dist: Distribution, askedIds: Set<string>, answers: AuditAnswer[]) {
  const ranked = rankedStates(dist);
  const top = ranked[0]?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  const gap = top - second;
  const answerCount = answers.length;
  const informativeCount = answers.filter((a) => a.value !== null).length;

  if (answerCount >= AUDIT_MAX_QUESTIONS) return { stop: true, reason: 'max-questions' as const };

  const next = chooseNextQuestion(model, dist, askedIds);
  if (!next) return { stop: true, reason: 'no-questions' as const };

  // 早期の1〜3回答だけで断定しない。最低8問、通常は10問以上を探索する。
  if (answerCount < AUDIT_MIN_QUESTIONS || informativeCount < 6) return { stop: false, reason: null, next };

  // 8〜9問で終了するのは、極端に明瞭な場合だけ。
  if (answerCount < AUDIT_TARGET_QUESTIONS) {
    if (top >= 0.92 && gap >= 0.50 && informativeCount >= 7) return { stop: true, reason: 'very-high-confidence' as const };
    return { stop: false, reason: null, next };
  }

  // 10問以降は十分な優位があれば終了。そうでなければ12問まで探索する。
  if (top >= 0.72 && gap >= 0.16 && informativeCount >= 8) return { stop: true, reason: 'confidence' as const };
  if (next.informationGain < 0.012 && informativeCount >= 8 && (top >= 0.45 || gap >= 0.10)) return { stop: true, reason: 'low-information-gain' as const };

  return { stop: false, reason: null, next };
}

export function confidenceFor(dist: Distribution, informativeCount = AUDIT_TARGET_QUESTIONS): 'high' | 'medium' | 'low' {
  const ranked = rankedStates(dist);
  const top = ranked[0]?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  const gap = top - second;
  if (informativeCount >= 8 && top >= 0.72 && gap >= 0.18) return 'high';
  if (informativeCount >= 6 && (top >= 0.48 || gap >= 0.10)) return 'medium';
  return 'low';
}

export function influentialAnswers(model: AuditModel, answers: AuditAnswer[], finalDist: Distribution, limit = 4): string[] {
  const topId = rankedStates(finalDist)[0]?.[0];
  if (!topId) return [];
  const initial = initialDistribution(model);
  return answers
    .filter((a) => a.value !== null)
    .map((a) => {
      const q = model.questions.find((item) => item.id === a.questionId);
      if (!q || a.value === null) return null;
      const idx = a.value;
      const pTop = conditional(q, topId, idx);
      const pMarginal = Math.max(answerProbability(q, initial, idx), EPS);
      return { text: q.text, score: Math.abs(Math.log(pTop / pMarginal)) };
    })
    .filter((x): x is { text: string; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.text);
}
