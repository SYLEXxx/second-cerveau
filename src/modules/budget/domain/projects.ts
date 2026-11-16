import type { SavingsProject } from './types';

export type ProjectEta =
  | { kind: 'done' }
  | { kind: 'unknown' }
  | { kind: 'eta'; months: number; date: Date; monthlyPace: number };

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

/**
 * Rythme d'épargne : le versement mensuel prévu s'il est renseigné, sinon la
 * moyenne des versements enregistrés depuis le premier.
 */
export function monthlyPace(p: SavingsProject, now: Date = new Date()): number {
  if (p.monthly && p.monthly > 0) return p.monthly;
  const list = p.contributions ?? [];
  if (!list.length) return 0;
  const first = Math.min(...list.map((c) => new Date(c.date).getTime()));
  const months = Math.max(1, (now.getTime() - first) / MS_PER_MONTH);
  return list.reduce((s, c) => s + c.amount, 0) / months;
}

export function projectEta(p: SavingsProject, now: Date = new Date()): ProjectEta {
  if (p.current >= p.target) return { kind: 'done' };
  const pace = monthlyPace(p, now);
  if (pace <= 0) return { kind: 'unknown' };
  const months = Math.ceil((p.target - p.current) / pace);
  const date = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return { kind: 'eta', months, date, monthlyPace: pace };
}

export function addContribution(p: SavingsProject, amount: number, now: Date = new Date()): void {
  p.current = Math.max(0, p.current + amount);
  p.contributions = [...(p.contributions ?? []), { date: now.toISOString(), amount }];
}
