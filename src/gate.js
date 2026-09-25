// Safety gate in front of an agent's CMS tool calls.
// The LLM agent proposes an action; Jev judges it; code decides allow / confirm / block.

import { systemOne } from './jev.js'
import { TOOL_GATE_QUESTIONS, GATE_THRESHOLDS as G } from './questions.js'

export async function gate(userRequest, action) {
  const res = await systemOne({
    state: { user_request: userRequest, action },
    questions: TOOL_GATE_QUESTIONS,
  })
  const a = res.answers
  return { verdict: decide(a, action), answers: a, latencyMs: res.latencyMs }
}

function decide(a, action) {
  const { reversibility, touches_production, matches_intent } = a

  // Counting belongs in code, not in the model.
  const itemCount = action.args?.uids?.length ?? 1
  const bulk = itemCount >= G.bulkItemCount

  if (matches_intent.noul < G.minIntentMatch) {
    return { result: 'BLOCK', why: `does not match what the user asked (${matches_intent.noul})` }
  }
  if (reversibility.choice === 'irreversible') {
    return { result: 'CONFIRM', why: `irreversible${bulk ? `, ${itemCount} items` : ''} — needs a human yes` }
  }
  if (reversibility.choice === 'read_only' && reversibility.confidence >= G.readOnlyConfidence) {
    return { result: 'ALLOW', why: 'read-only' }
  }
  if (reversibility.choice === 'reversible' && reversibility.confidence >= G.reversibleConfidence) {
    if (touches_production.noul >= G.productionNoul && bulk) {
      return { result: 'CONFIRM', why: `bulk change (${itemCount}) on production` }
    }
    return { result: 'ALLOW', why: 'reversible' + (touches_production.noul >= G.productionNoul ? ', production' : '') }
  }
  return { result: 'CONFIRM', why: `unsure what this does (confidence ${reversibility.confidence})` }
}
