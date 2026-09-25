// Minimal Jev client: one POST to /v1/systemone, no dependencies.
// If TYPESAFE_API_KEY is not set, it falls back to a local mock so the
// demo still runs end to end. The mock is keyword rules, not a model.

import { MODEL } from './questions.js'
import { mockAnswers } from './mock.js'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export const isLive = () => Boolean(process.env.TYPESAFE_API_KEY)

export async function systemOne({ state, questions, model = MODEL }) {
  if (!isLive()) {
    const started = performance.now()
    const answers = mockAnswers(state, questions)
    return { model: 'mock', answers, usage: null, latencyMs: Math.round(performance.now() - started) }
  }

  const started = performance.now()
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, state, questions }),
    })

    // 429 rate limit / 529 overloaded → back off and retry
    if (res.status === 429 || res.status === 529) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      continue
    }
    if (!res.ok) {
      throw new Error(`Jev ${res.status}: ${await res.text()}`)
    }
    const body = await res.json()
    return { ...body, latencyMs: Math.round(performance.now() - started) }
  }
  throw new Error('Jev: still rate-limited after retries')
}
