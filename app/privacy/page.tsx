import Link from 'next/link'
import { PRODUCT_NAME } from '@/lib/product-config'

export const metadata = { title: `Privacy notice — ${PRODUCT_NAME}` }

// DRAFT privacy notice for the private beta. Have a solicitor review it (and add the controller's legal name and
// contact details) before any wider launch.
export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', lineHeight: 1.65, fontSize: 15 }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Privacy notice</h1>
      <p style={{ color: '#6b7580', marginTop: 0 }}>{PRODUCT_NAME} private beta. Draft. Last updated October 2026.</p>

      <h2 style={{ fontSize: 18 }}>What we hold</h2>
      <ul>
        <li><strong>Your account:</strong> your name, company name, email address and the details you enter about your business.</li>
        <li><strong>Your customers&apos; details:</strong> names, addresses, phone numbers, emails, quotes, jobs and documents that you enter. You are
        responsible for having a proper reason to hold and use them; we store them on your behalf and use them only to run the service for you.</li>
        <li><strong>Technical information:</strong> sign-in times and error information, used to keep the service working and secure.</li>
      </ul>

      <h2 style={{ fontSize: 18 }}>Who else handles it</h2>
      <p>To provide the service we use trusted suppliers: a database and file-storage host, a web host, an email-sending service,
      and AI providers when you use the AI features (the text or documents you send to those features are processed by them to give you a result).
      Customer and subcontractor portals show only what you share with them. We do not sell your data.</p>

      <h2 style={{ fontSize: 18 }}>Keeping it safe</h2>
      <p>Each company&apos;s information is kept separate from every other company&apos;s, and access is protected by sign-in. No system is perfect; tell us straight away if
      you think anything is wrong.</p>

      <h2 style={{ fontSize: 18 }}>Your rights</h2>
      <p>You can ask to see, correct, export or delete your information at any time, and we can close your account. Contact the person who invited you to the beta.</p>

      <p style={{ marginTop: 32 }}><Link href="/register">← Back to registration</Link></p>
    </div>
  )
}
