import { isLive } from './jev.js'
import { triage } from './triage.js'
import { gate } from './gate.js'
import { TICKETS, AGENT_ACTIONS } from './fixtures.js'

const verbose = process.argv.includes('--json')
const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = c(1), dim = c(2), red = c(31), green = c(32), yellow = c(33), cyan = c(36)

console.log(bold('\nJev demo — CMS support desk'))
console.log(
  isLive()
    ? green('LIVE: calling api.typesafe.ai with your key')
    : yellow('MOCK MODE: no TYPESAFE_API_KEY set. Answers come from keyword rules, not Jev.')
)

// ── Part 1 ──
console.log(bold('\n1) Ticket triage — 6 questions per ticket, one call each\n'))
for (const t of TICKETS) {
  const r = await triage(t)
  const a = r.answers
  const d = r.decision
  console.log(`${bold(t.id)} ${dim(`${t.customer} · ${t.plan}`)}`)
  console.log(dim(`  "${t.message.slice(0, 90)}${t.message.length > 90 ? '…' : ''}"`))
  console.log(
    `  category ${cyan(a.category.choice)} (conf ${a.category.confidence})` +
      `  urgency ${a.urgency.score}/3  frustration ${a.frustration.score}/2` +
      `  prod ${a.production_impact.noul}  refund ${a.refund_requested.noul}  how-to ${a.asks_how_to.noul}`
  )
  const color = d.priority === 'P1' ? red : d.route === 'human-review' ? yellow : green
  console.log(`  → ${color(`${d.route} [${d.priority}]`)} ${dim(d.why)}${d.flag ? yellow(`  ⚑ ${d.flag}`) : ''}  ${dim(`${r.latencyMs}ms`)}`)
  if (verbose) console.log(JSON.stringify(a, null, 2))
  console.log()
}

// ── Part 2 ──
console.log(bold('2) Agent tool-call gate — Jev checks each action before it runs\n'))
for (const { user_request, action } of AGENT_ACTIONS) {
  const r = await gate(user_request, action)
  const a = r.answers
  const v = r.verdict
  const n = action.args.uids?.length
  console.log(dim(`  user:  "${user_request}"`))
  console.log(`  agent: ${action.tool}(${action.args.environment}${n ? `, ${n} items` : ''})`)
  console.log(
    dim(`  kind ${a.reversibility.choice} (conf ${a.reversibility.confidence})  prod ${a.touches_production.noul}  matches ask ${a.matches_intent.noul}`)
  )
  const color = v.result === 'ALLOW' ? green : v.result === 'BLOCK' ? red : yellow
  console.log(`  → ${color(v.result)} ${dim(v.why)}\n`)
  if (verbose) console.log(JSON.stringify(a, null, 2))
}
