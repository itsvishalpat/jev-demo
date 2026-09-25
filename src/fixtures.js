// Made-up tickets and agent actions for the demo. Swap in your own.

export const TICKETS = [
  {
    id: 'T-101',
    customer: 'Acme Retail',
    plan: 'enterprise',
    message:
      'Our homepage banner was published 2 hours ago but the live site still shows the old one. Customers see last week\'s sale prices. We are losing orders right now, please fix ASAP.',
  },
  {
    id: 'T-102',
    customer: 'Northwind Media',
    plan: 'growth',
    message: 'How do I compare two branches before merging? Is there a way to see only the entries that changed?',
  },
  {
    id: 'T-103',
    customer: 'Globex',
    plan: 'enterprise',
    message:
      'We were charged twice for the September invoice. Please refund the duplicate charge.',
  },
  {
    id: 'T-104',
    customer: 'Initech',
    plan: 'growth',
    message:
      'This is the third time I am writing about this. The WordPress import still fails at 40% and nobody replies. Unacceptable. We will switch vendor if this is not sorted this week!!',
  },
  {
    id: 'T-105',
    customer: 'Umbrella Labs',
    plan: 'starter',
    message: 'Hey, quick one: does your team offer workshops for our marketing folks?',
  },
]

// What an LLM agent wants to do, and what the user actually asked for.
export const AGENT_ACTIONS = [
  {
    user_request: 'Show me all entries in the blog content type that are still in draft.',
    action: { tool: 'list_entries', args: { content_type: 'blog', status: 'draft', environment: 'production' } },
  },
  {
    user_request: 'Publish the updated pricing page to staging so marketing can review it.',
    action: { tool: 'publish_entry', args: { uid: 'blt_pricing', environment: 'staging' } },
  },
  {
    user_request: 'Publish the updated pricing page to staging so marketing can review it.',
    action: { tool: 'publish_entry', args: { uid: 'blt_pricing', environment: 'production' } },
  },
  {
    user_request: 'Unpublish the old campaign pages from production.',
    action: {
      tool: 'unpublish_entries',
      args: { uids: Array.from({ length: 35 }, (_, i) => `blt_campaign_${i}`), environment: 'production' },
    },
  },
  {
    user_request: 'Find the duplicate author entries.',
    action: { tool: 'delete_entries', args: { uids: ['blt_author_7', 'blt_author_9'], environment: 'production' } },
  },
]
