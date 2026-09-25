// Offline stand-in for Jev. Returns answers in Jev's exact response shape
// (noul / choice+probabilities+confidence / score+legend+probabilities+confidence)
// using crude keyword rules. It exists so the pipeline runs without a key.
// Real Jev reads meaning; this does not. Never judge Jev by these numbers.

const text = (v) => JSON.stringify(v).toLowerCase()
const has = (s, words) => words.some((w) => s.includes(w))

function normalize(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, +(v / total).toFixed(3)]))
}

// Confidence from the shape of the distribution: 1 - normalized entropy.
function confidence(probs) {
  const p = Object.values(probs).filter((x) => x > 0)
  const h = -p.reduce((a, x) => a + x * Math.log(x), 0)
  return +(1 - h / Math.log(Object.keys(probs).length)).toFixed(2)
}

function choiceAnswer(weights) {
  const probabilities = normalize(weights)
  const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0]
  return { type: 'choice', choice, probabilities, confidence: confidence(probabilities) }
}

function scoreAnswer(levels, weights) {
  const probabilities = normalize(Object.fromEntries(weights.map((w, i) => [String(i), w])))
  const score = +Object.entries(probabilities).reduce((a, [i, p]) => a + Number(i) * p, 0).toFixed(2)
  const legend = Object.fromEntries(levels.map((l, i) => [String(i), l]))
  return { type: 'score', score, legend, probabilities, confidence: confidence(probabilities) }
}

const noul = (p) => ({ type: 'noul', noul: p })

const RULES = {
  // ── triage ──
  category: (s) =>
    choiceAnswer({
      publishing: has(s, ['publish', 'cdn', 'delivery', 'stale', 'old content', 'webhook']) ? 30 : 0.2,
      branches: has(s, ['branch', 'merge', 'alias']) ? 30 : 0.2,
      migration: has(s, ['migrat', 'import', 'wordpress', 'aem', 'sitecore']) ? 30 : 0.2,
      access: has(s, ['sso', 'login', 'permission', 'role', 'token']) ? 30 : 0.2,
      billing: has(s, ['invoice', 'charged', 'refund', 'billing', 'renewal']) ? 30 : 0.2,
      other: 0.6,
    }),
  urgency: (s, q) => {
    if (has(s, ['down', 'losing', 'launch tomorrow', 'asap', 'right now'])) return scoreAnswer(q.criteria, [0.01, 0.04, 0.2, 0.75])
    if (has(s, ['live', 'production', 'customers see', 'whole team'])) return scoreAnswer(q.criteria, [0.02, 0.18, 0.65, 0.15])
    if (has(s, ['broken', 'fails', 'error', 'charged twice'])) return scoreAnswer(q.criteria, [0.05, 0.6, 0.3, 0.05])
    return scoreAnswer(q.criteria, [0.8, 0.15, 0.04, 0.01])
  },
  frustration: (s, q) => {
    if (has(s, ['unacceptable', 'third time', 'cancel', 'switch vendor', '!!'])) return scoreAnswer(q.criteria, [0.02, 0.18, 0.8])
    if (has(s, ['still', 'again', 'frustrat', 'asap'])) return scoreAnswer(q.criteria, [0.1, 0.75, 0.15])
    return scoreAnswer(q.criteria, [0.85, 0.13, 0.02])
  },
  production_impact: (s) => noul(has(s, ['live', 'production', 'customers see', 'end users']) ? 0.95 : 0.08),
  refund_requested: (s) => noul(has(s, ['refund', 'money back', 'credit back']) ? 0.94 : 0.02),
  asks_how_to: (s) => noul(has(s, ['how do i', 'how can i', 'is there a way']) && !has(s, ['broken', 'error', 'fails']) ? 0.91 : 0.07),

  // ── tool gate ──
  reversibility: (s) =>
    choiceAnswer({
      read_only: has(s, ['"get_', '"list_', '"search_']) ? 30 : 0.2,
      reversible: has(s, ['"publish', '"unpublish', '"update_']) ? 30 : 0.2,
      irreversible: has(s, ['"delete', '"purge', '"drop']) ? 30 : 0.2,
    }),
  touches_production: (s) => noul(has(s, ['"production"', '"prod"', '"live"']) ? 0.97 : 0.05),
  matches_intent: (s) => {
    const req = s.split('"action"')[0]
    // crude drift check: the agent wants to delete but the user never asked to delete
    if (has(s, ['"delete', '"purge']) && !has(req, ['delete', 'remove', 'clean up'])) return noul(0.12)
    if (has(s, ['"publish']) && has(req, ['staging']) && has(s, ['"production"'])) return noul(0.2)
    return noul(0.9)
  },
}

export function mockAnswers(state, questions) {
  const s = text(state)
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      const rule = RULES[id]
      if (!rule) throw new Error(`mock has no rule for question "${id}"`)
      return [id, rule(s, q)]
    })
  )
}
