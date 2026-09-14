import type { AuditAnswer, AuditModel, AuditQuestion } from '../types';

export type Distribution = Record<string, number>;

const EPS = 1e-12;

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

function conditional(question: AuditQuestion, stateId: string, answerIndex: number): number {
  const weights = question.likelihoods[stateId] ?? [1, 1, 1, 1, 1];
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return Math.max(weights[answerIndex] ?? 0, EPS) / total;
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

export function chooseNextQuestion(model: AuditModel, dist: Distribution, askedIds: Set<string>) {
  const candidates = model.questions.filter((q) => !askedIds.has(q.id));
  if (!candidates.length) return null;
  return candidates
    .map((question) => ({ question, informationGain: expectedInformationGain(question, dist) }))
    .sort((a, b) => b.informationGain - a.informationGain)[0];
}

export function rankedStates(dist: Distribution) {
  return Object.entries(dist).sort((a, b) => b[1] - a[1]);
}

export function shouldStop(model: AuditModel, dist: Distribution, askedIds: Set<string>, answerCount: number) {
  const ranked = rankedStates(dist);
  const top = ranked[0]?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  if (answerCount >= 3 && top >= 0.75 && top - second >= 0.20) return { stop: true, reason: 'confidence' as const };
  if (answerCount >= 12) return { stop: true, reason: 'max-questions' as const };
  const next = chooseNextQuestion(model, dist, askedIds);
  if (!next) return { stop: true, reason: 'no-questions' as const };
  if (answerCount >= 4 && next.informationGain < 0.02) return { stop: true, reason: 'low-information-gain' as const };
  return { stop: false, reason: null, next };
}

export function confidenceFor(dist: Distribution): 'high' | 'medium' | 'low' {
  const ranked = rankedStates(dist);
  const top = ranked[0]?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  if (top >= 0.75 && top - second >= 0.20) return 'high';
  if (top >= 0.55 || top - second >= 0.15) return 'medium';
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
