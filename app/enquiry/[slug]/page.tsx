import type { Metadata } from 'next'
import EnquiryForm from '@/components/EnquiryForm'

// A company's public enquiry form. Kept out of search engines: companies show it from their own site or social pages.
export const metadata: Metadata = { title: 'Send an enquiry', robots: { index: false, follow: false } }

export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ src?: string | string[]; embed?: string | string[] }> }) {
  const { slug } = await params
  const q = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  return <EnquiryForm slug={slug} src={first(q.src)} embed={first(q.embed) === '1'} />
}
