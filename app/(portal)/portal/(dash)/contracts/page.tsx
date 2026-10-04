'use client'

// The client's Contracts tab. The screen itself lives in components/PortalContractsView.tsx (shared with the builder's
// "preview what the client sees" page); this page just feeds it the client's own data and the signing window.

import { useEffect, useState } from 'react'
import { usePortal, type PortalContract } from '@/contexts/PortalContext'
import PortalContractsView, { PortalFileList, type PortalJobFile } from '@/components/PortalContractsView'
import PortalSignContractModal from '@/components/PortalSignContractModal'

/** Fetches this job's plans and documents (client-visible files) for the contract card */
function ContractFiles({ jobId }: { jobId: string }) {
  const [files, setFiles] = useState<PortalJobFile[]>([])
  useEffect(() => {
    let live = true
    fetch(`/api/portal/job-attachments?jobId=${jobId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: PortalJobFile[]) => { if (live) setFiles(Array.isArray(d) ? d : []) })
      .catch(() => { if (live) setFiles([]) })
    return () => { live = false }
  }, [jobId])
  return <PortalFileList files={files} />
}

export default function PortalContractsPage() {
  const { jobs, contracts, reloadContracts, loading, error } = usePortal()
  const [signing, setSigning] = useState<PortalContract | null>(null)

  if (loading) {
    return (
      <div className="portal-loading">
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        Loading your contracts…
      </div>
    )
  }
  if (error) return <div className="portal-section"><p className="portal-empty">Unable to load your contracts.</p></div>

  return (
    <>
      <PortalContractsView
        contracts={contracts}
        jobs={jobs}
        renderFiles={jobId => <ContractFiles jobId={jobId} />}
        onSign={setSigning}
      />
      {signing && (
        <PortalSignContractModal
          contract={signing}
          onClose={() => setSigning(null)}
          onSigned={() => { setSigning(null); reloadContracts() }}
        />
      )}
    </>
  )
}
