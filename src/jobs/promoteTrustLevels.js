'use strict';

const { query } = require('../db/index');
const agentsDb = require('../db/agents');
const reputationDb = require('../db/reputation');
const humansDb = require('../db/humans');
const { getAutoPromotionRules, getMaxTrustLevel } = require('../lib/trustLevels');

/**
 * Run auto-promotion: for each agent with trust_level < max, check if they meet
 * the next level's rules (reputation, account age, optional verified human link for level 0->1).
 * Returns { promoted: number, checked: number }.
 */
async function runPromotion() {
  const maxLevel = getMaxTrustLevel();
  const agentsRes = await query(
    `SELECT id, trust_level, created_at FROM agents WHERE status = 'active' AND trust_level < $1 ORDER BY id`,
    [maxLevel]
  );
  const agents = agentsRes.rows;
  let promoted = 0;

  for (const agent of agents) {
    const currentLevel = Number(agent.trust_level) || 0;
    const nextLevel = currentLevel + 1;
    const rules = getAutoPromotionRules(currentLevel);
    if (!rules) continue;

    const rep = await reputationDb.getAgentReputation(agent.id);
    const accountAgeMs = Date.now() - new Date(agent.created_at).getTime();
    const accountAgeDays = accountAgeMs / (24 * 60 * 60 * 1000);

    let qualifies = false;

    if (currentLevel === 0 && rules) {
      const hasVerifiedHuman = (await humansDb.getHumansByAgentId(agent.id)).some(
        (h) => h.status === 'verified'
      );
      if (hasVerifiedHuman) {
        qualifies = true;
      }
    }

    if (!qualifies && rules) {
      const minCalls = rules.min_calls != null ? rules.min_calls : 0;
      const minRate = rules.min_success_rate_pct != null ? rules.min_success_rate_pct : 0;
      const minDays = rules.min_account_days != null ? rules.min_account_days : 0;
      qualifies =
        rep.total_calls >= minCalls &&
        rep.success_rate >= minRate &&
        accountAgeDays >= minDays;
    }

    if (qualifies) {
      await agentsDb.updateTrustLevel(agent.id, nextLevel);
      promoted++;
    }
  }

  return { promoted, checked: agents.length };
}

module.exports = { runPromotion };
