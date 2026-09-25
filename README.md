# Jev demo: decision layer for a CMS support desk

Jev (TypeSafe AI) doesn't write text. You send it some **state** plus a set of **typed questions**, and it sends back **probabilities**. Your own code compares those numbers to thresholds and picks the action.

This demo puts Jev in two places where a full LLM is overkill:

1. **Ticket triage.** Each support ticket gets 6 questions in **one** call (category, urgency, frustration, production impact, refund, how-to). Code turns the answers into a route: page on-call, billing, LLM auto-answer, a team queue, or human review.
2. **Agent tool-call gate.** Before an AI agent runs a CMS action (list, publish, unpublish, delete), Jev checks whether it's reversible, whether it hits production, and whether it matches what the user asked for. Code then decides **ALLOW / CONFIRM / BLOCK**.

```
User / ticket → (LLM agent proposes action) → Jev: typed answers + probabilities → code: thresholds → action
```

---

## Contents

- [Run it](#run-it)
- [Visual walkthrough (UI)](#visual-walkthrough-ui)
- [How it works](#how-it-works)
  - [1. The request](#1-the-request)
  - [2. The three answer types](#2-the-three-answer-types)
  - [3. Code makes the decision](#3-code-makes-the-decision)
- [Real example 1: ticket triage](#real-example-1-ticket-triage)
- [Real example 2: agent tool-call gate](#real-example-2-agent-tool-call-gate)
- [All sample results](#all-sample-results)
- [Decision rules](#decision-rules)
- [Thresholds and tuning](#thresholds-and-tuning)
- [Mock mode vs live mode](#mock-mode-vs-live-mode)
- [Files](#files)
- [Plug it into your own system](#plug-it-into-your-own-system)
- [Design choices worth copying](#design-choices-worth-copying)
- [Next steps](#next-steps)

---

## Run it

Needs Node 20+. No dependencies, so there's nothing to install.

```bash
npm run demo              # mock mode, no key needed
npm run demo:json         # also prints the raw answer objects

export TYPESAFE_API_KEY=your_key    # from console.typesafe.ai
npm run demo              # live calls to api.typesafe.ai/v1/systemone
```

Optional: pin a model version with `JEV_MODEL=jev-1.13.0` (the default is `jev-latest`).

## Visual walkthrough (UI)

Open `ui/index.html` in any browser (double-click it, or run `open ui/index.html` on macOS). It needs no server and no build step.

The page shows every step for each sample:

| Step | What you see |
|---|---|
| **1. What your code sends** | The state, each question with its type, and the full JSON request body |
| **2. What Jev sends back** | One card per answer with probability bars. A black tick on a bar marks the threshold the code checks. |
| **3. What your code decides** | Every rule in order, marked *Fires*, *Passes* or *Not reached*, then the final route or verdict |

You can also:
- switch between the **Support ticket triage** and **Agent tool-call gate** tabs
- use **Try your own** to type a ticket, or a user request plus the tool call the agent picked
- move the **threshold sliders** to see a decision change live (the sample labels on the left update too)

The UI uses the same mock as the CLI. The decision rules and thresholds are copied from `src/triage.js`, `src/gate.js` and `src/questions.js`.

---

## How it works

### 1. The request

Every decision is **one POST** to `https://api.typesafe.ai/v1/systemone`:

```json
{
  "model": "jev-latest",
  "state": {
    "message": "Our homepage banner was published 2 hours ago but the live site still shows the old one. ...",
    "plan": "enterprise",
    "customer": "Acme Retail"
  },
  "questions": {
    "category": {
      "type": "choice",
      "instructions": "What is the customer asking about in `message`?",
      "criteria": {
        "publishing": "Entries or assets not publishing, delivery API or CDN serving old content, publish webhooks",
        "billing": "Invoices, charges, plan limits, refunds, renewals",
        "other": "Anything that does not fit the options above"
      }
    },
    "production_impact": {
      "type": "noul",
      "instructions": "Does `message` say that live or production content, or end users, are affected?"
    }
  }
}
```

- **`state`** is any JSON you want Jev to reason about. Questions refer to its fields in backticks, e.g. `` `message` `` or `` `action.args.environment` ``.
- **`questions`** is a map of named questions. All of them run **in parallel** against the same state, so asking 6 questions takes about as long as asking 1.
- The client (`src/jev.js`) retries on `429` (rate limit) and `529` (overloaded) with exponential backoff.

### 2. The three answer types

| Type | You define | Jev returns | Use it for |
|---|---|---|---|
| `noul` | a yes/no question (optional `criteria.true` / `criteria.false`) | `noul`: probability of yes, 0–1 | "Is production affected?", "Did they ask for a refund?" |
| `choice` | named options with descriptions | `choice` (top option), `probabilities` per option, `confidence` | Category, kind of operation |
| `score` | an ordered list of levels | `score` (expected level), `probabilities` per level, `legend`, `confidence` | Urgency 0–3, frustration 0–2 |

Example response shapes:

```json
{ "type": "noul", "noul": 0.95 }

{ "type": "choice", "choice": "publishing",
  "probabilities": { "publishing": 0.955, "branches": 0.006, "other": 0.019 },
  "confidence": 0.86 }

{ "type": "score", "score": 2.69,
  "probabilities": { "0": 0.01, "1": 0.04, "2": 0.2, "3": 0.75 },
  "legend": { "0": "A question ... nothing broken", "3": "Production is down ..." },
  "confidence": 0.49 }
```

A `score` is the probability-weighted average of the levels: `0×0.01 + 1×0.04 + 2×0.20 + 3×0.75 = 2.69`.

### 3. Code makes the decision

Jev never picks the route. `src/triage.js` and `src/gate.js` hold plain `if` rules that compare the answers to thresholds in `src/questions.js`. The rules run top to bottom and the first one that fires wins. That split means:

- you can read, test and audit every decision
- you can change behaviour by editing a number, with no prompt engineering
- facts such as item counts are computed in code, where they're exact

---

## Real example 1: ticket triage

**Ticket T-101**, Acme Retail, enterprise plan:

> Our homepage banner was published 2 hours ago but the live site still shows the old one. Customers see last week's sale prices. We are losing orders right now, please fix ASAP.

**Jev's answers** (mock mode, from `npm run demo:json`):

| Question | Type | Answer |
|---|---|---|
| `category` | choice | **publishing** (p = 0.955, confidence 0.86) |
| `urgency` | score | **2.69 / 3** (75% on level 3, "Production is down or losing money right now") |
| `frustration` | score | **1.05 / 2** (75% on level 1, "Frustrated but civil") |
| `production_impact` | noul | **0.95** |
| `refund_requested` | noul | 0.02 |
| `asks_how_to` | noul | 0.07 |

**How the code decides:**

| # | Rule | Check | Result |
|---|---|---|---|
| 1 | Category too unclear → human | confidence 0.86 ≥ 0.50 | passes |
| 2 | Live and very urgent → page on-call | production 0.95 ≥ 0.80 **and** urgency 2.69 ≥ 2.00 (enterprise bar is 2.3 − 0.3) | **fires** |
| 3–5 | billing / how-to / team queue | | not reached |

**Result:** `on-call [P1]`, because production impact is 0.95 and urgency is 2.69/3.

The same ticket on the **growth** plan would still page on-call, because 2.69 is also above the normal bar of 2.3. Raise `pageOnCallUrgency` to 3.0, though, and the enterprise bar becomes 2.7. Now 2.69 misses it, and the ticket falls through to `platform-support [P2]`. Try this with the slider in the UI.

## Real example 2: agent tool-call gate

The user asks the agent:

> Find the duplicate author entries.

The LLM agent proposes:

```json
{ "tool": "delete_entries",
  "args": { "uids": ["blt_author_7", "blt_author_9"], "environment": "production" } }
```

The user asked to **find** duplicates, and the agent wants to **delete** them on production.

**Jev's answers:**

| Question | Type | Answer |
|---|---|---|
| `reversibility` | choice | **irreversible** (p = 0.987, confidence 0.93) |
| `touches_production` | noul | **0.97** |
| `matches_intent` | noul | **0.12** |

**Facts computed in code:** 2 items, which isn't bulk (the bulk limit is 20).

**How the code decides:**

| # | Rule | Check | Result |
|---|---|---|---|
| 1 | Drifted from the ask → block | matches_intent 0.12 < 0.60 | **fires** |
| 2 | Irreversible → a human must confirm | | not reached |

**Result:** `BLOCK`, because the action doesn't match what the user asked (0.12). Even if the user *had* asked to delete them, rule 2 would stop it at `CONFIRM`, since irreversible actions always need a human yes.

---

## All sample results

Output of `npm run demo` in mock mode:

**Ticket triage**

| Ticket | Message (short) | Route | Why |
|---|---|---|---|
| T-101 Acme Retail · enterprise | Banner published, live site still old, losing orders | **on-call P1** | production 0.95, urgency 2.69/3 |
| T-102 Northwind · growth | How do I compare two branches? | **llm-answer P4** | how-to question about branches |
| T-103 Globex · enterprise | Charged twice, please refund | **billing P2** ⚑ refund | refund requested (0.94) |
| T-104 Initech · growth | Third time writing, import fails, will switch vendor | **solutions-team P3** ⚑ escalate-to-account-manager | migration, frustration 1.78/2 |
| T-105 Umbrella Labs · starter | Do you offer workshops? | **human-review** | category unclear (confidence 0.07) |

**Agent tool-call gate**

| User asked | Agent proposed | Verdict | Why |
|---|---|---|---|
| Show draft blog entries | `list_entries(production)` | **ALLOW** | read-only |
| Publish pricing page to staging | `publish_entry(staging)` | **ALLOW** | reversible |
| Publish pricing page to staging | `publish_entry(production)` | **BLOCK** | wrong environment, intent 0.2 |
| Unpublish old campaign pages from production | `unpublish_entries(production, 35 items)` | **CONFIRM** | bulk change (35) on production |
| Find duplicate author entries | `delete_entries(production, 2 items)` | **BLOCK** | find ≠ delete, intent 0.12 |

---

## Decision rules

### Triage (`src/triage.js`)

Rules run in this order, and the first one that fires wins:

| # | If | Route | Priority |
|---|---|---|---|
| 1 | `category.confidence < 0.5` | human-review | normal |
| 2 | `production_impact ≥ 0.8` **and** `urgency ≥ 2.3` (2.0 for enterprise) | on-call | P1 |
| 3 | `category = billing` **and** `refund_requested ≥ 0.7` | billing (flag: refund) | P2 |
| 4 | `asks_how_to ≥ 0.8` **and** `category.confidence ≥ 0.7` | llm-answer | P4 |
| 5 | otherwise | team queue for the category (`other` → human-review) | P2 if urgency ≥ 1.5, else P3 |

On rule 5 only: if `frustration ≥ 1.5`, the ticket is also flagged `escalate-to-account-manager`.

Category → queue: `publishing` and `branches` → platform-support, `migration` → solutions-team, `access` → identity-support, `billing` → billing.

### Tool-call gate (`src/gate.js`)

| # | If | Verdict |
|---|---|---|
| 1 | `matches_intent < 0.6` | **BLOCK** |
| 2 | `reversibility = irreversible` | **CONFIRM** (always needs a human yes) |
| 3 | `reversibility = read_only` and confidence ≥ 0.8 | **ALLOW** |
| 4 | `reversibility = reversible` and confidence ≥ 0.7 | **CONFIRM** if production ≥ 0.5 and ≥ 20 items, otherwise **ALLOW** |
| 5 | otherwise | **CONFIRM** (unsure what the action does) |

The item count comes from `action.args.uids.length` in code, not from Jev.

---

## Thresholds and tuning

All questions and thresholds live in `src/questions.js`. That's the file to review.

| Threshold | Default | Effect |
|---|---|---|
| `TRIAGE_THRESHOLDS.minCategoryConfidence` | 0.5 | Below this, a human reads the ticket |
| `TRIAGE_THRESHOLDS.autoAnswerConfidence` | 0.7 | Category confidence needed before the LLM auto-answers |
| `TRIAGE_THRESHOLDS.productionNoul` | 0.8 | Counts as "live is affected" at or above this |
| `TRIAGE_THRESHOLDS.pageOnCallUrgency` | 2.3 | Urgency (0–3) needed to page on-call; enterprise gets 0.3 lower |
| `TRIAGE_THRESHOLDS.angryFrustration` | 1.5 | Frustration (0–2) that flags the account manager |
| `TRIAGE_THRESHOLDS.refundNoul` | 0.7 | Sends billing tickets to the refund route |
| `TRIAGE_THRESHOLDS.howToNoul` | 0.8 | Counts as a pure how-to question |
| `GATE_THRESHOLDS.minIntentMatch` | 0.6 | Below this, the agent has drifted → BLOCK |
| `GATE_THRESHOLDS.readOnlyConfidence` | 0.8 | Needed to allow a read without asking |
| `GATE_THRESHOLDS.reversibleConfidence` | 0.7 | Needed to allow a reversible change |
| `GATE_THRESHOLDS.productionNoul` | 0.5 | Counts as production at or above this |
| `GATE_THRESHOLDS.bulkItemCount` | 20 | Item count that counts as bulk |

**How to tune:** run live on 20–50 real tickets that you've labelled with the correct route, compare, and move one threshold at a time. Raising a bar sends fewer tickets to that route; lowering it sends more.

---

## Mock mode vs live mode

| | Mock (no key) | Live (`TYPESAFE_API_KEY` set) |
|---|---|---|
| Where answers come from | Keyword rules in `src/mock.js` | Jev at `api.typesafe.ai/v1/systemone` |
| Response shape | Same as Jev | Jev |
| Understands meaning | No, only matches words like "refund" or "production" | Yes |
| Latency | ~0 ms | a network round trip |
| Good for | Seeing the pipeline end to end | Judging accuracy and tuning thresholds |

**Mock mode is not Jev.** For example, the mock thinks any message containing "live" is about production. Use a real key before you judge accuracy.

---

## Files

| File | What it does |
|---|---|
| `src/questions.js` | **Every question and threshold.** Review this file. |
| `src/triage.js` | Ticket answers → route + priority |
| `src/gate.js` | Agent action answers → ALLOW / CONFIRM / BLOCK |
| `src/jev.js` | ~40-line client: one POST, retries on 429/529, mock fallback |
| `src/mock.js` | Offline stand-in (keyword rules) |
| `src/fixtures.js` | Sample tickets and agent actions. Replace with your own. |
| `src/demo.js` | CLI runner behind `npm run demo` |
| `ui/index.html` | Interactive visual walkthrough (single file, no build) |

---

## Plug it into your own system

**Helpdesk webhook → triage**

```js
import { triage } from './src/triage.js'

app.post('/webhooks/ticket', async (req, res) => {
  const { id, customer, plan, message } = req.body
  const { decision, answers } = await triage({ id, customer, plan, message })
  // decision = { route: 'on-call', priority: 'P1', why: '...', flag?: '...' }
  await helpdesk.assign(id, decision.route, decision.priority)
  if (decision.flag) await helpdesk.tag(id, decision.flag)
  res.sendStatus(204)
})
```

**Agent tool executor → gate**

```js
import { gate } from './src/gate.js'

async function executeTool(userRequest, action) {
  const { verdict } = await gate(userRequest, action)
  if (verdict.result === 'BLOCK') return { error: `Blocked: ${verdict.why}` }
  if (verdict.result === 'CONFIRM') {
    const ok = await askUser(`The agent wants to run ${action.tool}. ${verdict.why}. Continue?`)
    if (!ok) return { error: 'User declined' }
  }
  return cms[action.tool](action.args)
}
```

**Adding a question:** add it to `TRIAGE_QUESTIONS` or `TOOL_GATE_QUESTIONS` in `src/questions.js`, then use it in `decide()`. In mock mode you also need a matching rule in `src/mock.js`, or the mock throws `mock has no rule for question "..."`.

---

## Design choices worth copying

- **Ask everything in one call.** Questions run in parallel against the same state, so extra questions barely add time. Code ignores what it doesn't need.
- **Judgment goes to Jev, facts stay in code.** "Is this bulk?" is `uids.length >= 20` in code. Jev is weak at counting, math and dates.
- **Confidence gates.** Low category confidence goes to a human. Irreversible actions always need a human yes.
- **Intent check.** The gate catches an agent that drifts: asked to *find* duplicates but tries to *delete* them, or told *staging* but publishes to *production*.

## Next steps

- Run live on 20–50 real, labelled tickets and tune the thresholds in `questions.js`.
- Pin the model (`JEV_MODEL=jev-1.13.0`) once thresholds are tuned.
- Wire `gate()` in front of your agent's tool executor, and `triage()` onto your helpdesk webhook.
