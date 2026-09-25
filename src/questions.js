// Every question and threshold lives in this one file.
// This is the part a reviewer should read — the rest is plumbing.

export const MODEL = process.env.JEV_MODEL ?? 'jev-latest'

// ─────────────────────────────────────────────────────────────
// Part 1: Support ticket triage (one call, all questions at once)
// ─────────────────────────────────────────────────────────────
export const TRIAGE_QUESTIONS = {
  category: {
    type: 'choice',
    instructions: 'What is the customer asking about in `message`?',
    criteria: {
      publishing: 'Entries or assets not publishing, delivery API or CDN serving old content, publish webhooks',
      branches: 'Creating, merging or comparing branches, aliases, merge conflicts',
      migration: 'Moving content from another CMS, bulk import or export of entries',
      access: 'Logins, SSO, roles, permissions, API tokens',
      billing: 'Invoices, charges, plan limits, refunds, renewals',
      other: 'Anything that does not fit the options above',
    },
  },
  urgency: {
    type: 'score',
    instructions: 'How urgent is the situation described in `message`?',
    criteria: [
      'A question or request with no deadline and nothing broken',
      'Something is broken but there is a workaround, or nothing live is affected',
      'Live content or a whole team is affected, or there is a deadline within days',
      'Production is down or the customer is losing money right now or within hours',
    ],
  },
  frustration: {
    type: 'score',
    instructions: 'How frustrated is the author of `message`?',
    criteria: [
      'Calm, just stating facts or asking a question',
      'Frustrated but civil',
      'Very angry, repeated follow-ups, or threatening to leave',
    ],
  },
  production_impact: {
    type: 'noul',
    instructions: 'Does `message` say that live or production content, or end users, are affected?',
    criteria: {
      true: 'The live site, production environment, or real end users are affected',
      false: 'Only staging, drafts, internal setup, or nothing broken',
    },
  },
  refund_requested: {
    type: 'noul',
    instructions: 'Does `message` ask for money back?',
  },
  asks_how_to: {
    type: 'noul',
    instructions: 'Is `message` only asking how to do something, with nothing broken?',
  },
}

export const TRIAGE_THRESHOLDS = {
  minCategoryConfidence: 0.5, // below this → a human reads it
  autoAnswerConfidence: 0.7, // how-to questions go to the LLM only above this
  productionNoul: 0.8,
  pageOnCallUrgency: 2.3, // urgency score runs 0..3
  angryFrustration: 1.5, // frustration score runs 0..2
  refundNoul: 0.7,
  howToNoul: 0.8,
}

// ─────────────────────────────────────────────────────────────
// Part 2: Agent tool-call safety gate
// Runs before the agent executes any tool that touches the CMS.
// ─────────────────────────────────────────────────────────────
export const TOOL_GATE_QUESTIONS = {
  reversibility: {
    type: 'choice',
    instructions: 'What kind of operation is `action`?',
    criteria: {
      read_only: 'Only reads or lists data; changes nothing',
      reversible: 'Changes data but can be undone, e.g. unpublish, update a field, publish a version',
      irreversible: 'Deletes or purges data, or cannot be undone',
    },
  },
  touches_production: {
    type: 'noul',
    instructions: 'Does `action.args.environment` refer to a production or live environment?',
  },
  matches_intent: {
    type: 'noul',
    instructions: 'Does `action` do what `user_request` asked for, with the same scope and no more?',
  },
}

export const GATE_THRESHOLDS = {
  minIntentMatch: 0.6, // agent drifted from what the user asked → block
  readOnlyConfidence: 0.8,
  reversibleConfidence: 0.7,
  productionNoul: 0.5,
  bulkItemCount: 20, // counted in code, never by the model
}
