import Link from 'next/link'
import { PRODUCT_NAME } from '@/lib/product-config'

export const metadata = { title: `Beta terms — ${PRODUCT_NAME}` }

// DRAFT beta terms for the friends-and-testers phase. Plain English on purpose. Have a solicitor review before
// any wider launch or before charging for the service.
export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', lineHeight: 1.65, fontSize: 15 }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{PRODUCT_NAME} — beta terms</h1>
      <p style={{ color: '#6b7580', marginTop: 0 }}>Draft for the private beta. Last updated October 2026.</p>

      <h2 style={{ fontSize: 18 }}>What this is</h2>
      <p>{PRODUCT_NAME} is a quoting and job-management tool for builders. During the beta it is free, it is still being built,
      and things will change, break and occasionally be reset. You are helping us test it.</p>

      <h2 style={{ fontSize: 18 }}>Using it</h2>
      <ul>
        <li>Your invite is for you and your business. Please don&apos;t share your login or your invite code.</li>
        <li>You are responsible for the quotes, prices and messages you send to your own customers. Check everything before it goes out. The AI
        features give suggestions and estimates, not guaranteed prices.</li>
        <li>Don&apos;t use the service for anything unlawful, and don&apos;t try to access other people&apos;s accounts or data.</li>
        <li>Emails and messages to your customers are sent in your company&apos;s name through {PRODUCT_NAME}. Only message people who expect to hear from you.</li>
      </ul>

      <h2 style={{ fontSize: 18 }}>Your data</h2>
      <p>You own the information you put in (your customers, quotes, rates and so on). Keep your own copy of anything important:
      during the beta we may reset or remove data, with notice where we can. We may look at technical information to fix problems and improve the product.
      See the <Link href="/privacy">privacy notice</Link>.</p>

      <h2 style={{ fontSize: 18 }}>No guarantees</h2>
      <p>The beta is provided as it is, with no promise that it will always be available or error-free, and we are not liable for losses
      caused by using it. Nothing here limits any rights you have by law.</p>

      <h2 style={{ fontSize: 18 }}>Ending the beta</h2>
      <p>Either of us can stop at any time. If we later introduce paid plans, we will tell you first, and you can choose whether to continue.</p>

      <p style={{ marginTop: 32 }}><Link href="/register">← Back to registration</Link></p>
    </div>
  )
}
