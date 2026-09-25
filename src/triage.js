// Jev supplies the judgment. This file decides what happens next.

import { systemOne } from './jev.js'
import { TRIAGE_QUESTIONS, TRIAGE_THRESHOLDS as T } from './questions.js'

const QUEUES = {
  publishing: 'platform-support',
  branches: 'platform-support',
  migration: 'solutions-team',
  access: 'identity-support',
  billing: 'billing',
}

export async function triage(ticket) {
  // One call: every question, even ones only some tickets need.
  const res = await systemOne({
    state: { message: ticket.message, plan: ticket.plan, customer: ticket.customer },
    questions: TRIAGE_QUESTIONS,
  })
  const a = res.answers
  const decision = decide(a, ticket)
  return { decision, answers: a, model: res.model, latencyMs: res.latencyMs, usage: res.usage }
}

function decide(a, ticket) {
  const { category, urgency, frustration, production_impact, refund_requested, asks_how_to } = a

  if (category.confidence < T.minCategoryConfidence) {
    return { route: 'human-review', priority: 'normal', why: `category unclear (confidence ${category.confidence})` }
  }

  const live = production_impact.noul >= T.productionNoul
  const enterprise = ticket.plan === 'enterprise'

  // Page on-call: production + very urgent. Enterprise gets a lower bar.
  const bar = enterprise ? T.pageOnCallUrgency - 0.3 : T.pageOnCallUrgency
  if (live && urgency.score >= bar) {
    return { route: 'on-call', priority: 'P1', why: `production impact ${production_impact.noul}, urgency ${urgency.score}/3` }
  }

  if (category.choice === 'billing' && refund_requested.noul >= T.refundNoul) {
    return { route: 'billing', priority: 'P2', why: `refund requested (${refund_requested.noul})`, flag: 'refund' }
  }

  // Pure how-to questions: let the LLM draft an answer from the docs.
  if (asks_how_to.noul >= T.howToNoul && category.confidence >= T.autoAnswerConfidence) {
    return { route: 'llm-answer', priority: 'P4', why: `how-to question about ${category.choice}` }
  }

  const priority = urgency.score >= 1.5 ? 'P2' : 'P3'
  const route = category.choice === 'other' ? 'human-review' : QUEUES[category.choice]
  const decision = { route, priority, why: `${category.choice}, urgency ${urgency.score}/3` }
  if (frustration.score >= T.angryFrustration) decision.flag = 'escalate-to-account-manager'
  return decision
}
