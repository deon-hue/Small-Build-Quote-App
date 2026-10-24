// Which quotes and jobs belong to a contact. Quotes and jobs carry the customer's NAME (not the contact's id), so a contact's are the ones whose name matches it: the same, or one contained in the other ("Smith" and "Mr Smith").
// A blank name matches nothing (it would otherwise match everything, and put someone else's quotes, jobs and FILES on the contact). Pure.

export function sameCustomerName(contactName: string | null | undefined, otherName: string | null | undefined): boolean {
  const n = (contactName || '').trim().toLowerCase()
  const o = (otherName || '').trim().toLowerCase()
  if (!n || !o) return false
  return o === n || o.includes(n) || n.includes(o)
}

export function quotesForClient<Q extends { customer: { name: string } }>(contactName: string, quotes: Q[]): Q[] {
  return quotes.filter(q => sameCustomerName(contactName, q.customer?.name))
}

export function jobsForClient<J extends { client: string }>(contactName: string, jobs: J[]): J[] {
  return jobs.filter(j => sameCustomerName(contactName, j.client))
}
