// Milestones are granted automatically the moment they are reached (state.milestones[id] = true).
import { MILESTONES, milestoneValue } from '../data/milestones.js';

export const isClaimed = (state, id) => !!state.milestones?.[id];
export const reached = (state, m) => milestoneValue(state, m) >= m.target;

/** Milestones reached but not yet granted. */
export const pending = (state) => MILESTONES.filter((m) => !isClaimed(state, m.id) && reached(state, m));
/** Next unreached milestone per kind (for the 검토 list). */
export const upcoming = (state) => {
  const out = [];
  for (const kind of ['stage', 'level', 'party']) { const next = MILESTONES.find((m) => m.kind === kind && !isClaimed(state, m.id) && !reached(state, m)); if (next) out.push(next); }
  return out;
};
export const claimedCount = (state) => MILESTONES.filter((m) => isClaimed(state, m.id)).length;

/** Grant every pending milestone. Returns the list of { milestone, reward } granted. */
export function grantPending(state) {
  const granted = [];
  for (const m of pending(state)) {
    state.milestones ??= {};
    state.milestones[m.id] = true;
    state.gems += m.reward.gems ?? 0; state.cards += m.reward.cards ?? 0;
    granted.push({ milestone: m, reward: m.reward });
  }
  return granted;
}
