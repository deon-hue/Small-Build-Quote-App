'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Suppliers are now managed under Contacts (/clients?tab=supplier)
export default function SuppliersRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/clients?tab=supplier') }, [router])
  return null
}
