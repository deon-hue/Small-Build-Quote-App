import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SRC_BUCKET = 'quote-documents'
const DST_BUCKET = 'job-documents'

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { quoteId, jobId } = await req.json() as { quoteId?: string; jobId?: string }
    if (!quoteId || !jobId) {
      return NextResponse.json({ error: 'quoteId and jobId are required' }, { status: 400 })
    }

    // Fetch all plan files attached to this quote
    const { data: docs } = await sb
      .from('quote_documents')
      .select('filename, storage_path, mime_type, file_size')
      .eq('user_id', user.id)
      .eq('quote_id', quoteId)

    if (!docs?.length) {
      return NextResponse.json({ copied: 0 })
    }

    let copied = 0
    const stamp = () => Date.now().toString(36)

    for (const doc of docs) {
      try {
        // Download from quote-documents bucket
        const { data: fileData, error: downloadErr } = await sb.storage
          .from(SRC_BUCKET)
          .download(doc.storage_path)

        if (downloadErr || !fileData) {
          console.warn('copy-quote-plans: download failed for', doc.storage_path, downloadErr)
          continue
        }

        // Upload to job-documents bucket under attachments path
        const safeName = doc.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const destPath = `${user.id}/${jobId}/attachments/${stamp()}-${safeName}`

        const { data: uploadData, error: uploadErr } = await sb.storage
          .from(DST_BUCKET)
          .upload(destPath, fileData, { contentType: doc.mime_type })

        if (uploadErr || !uploadData) {
          console.warn('copy-quote-plans: upload failed for', doc.filename, uploadErr)
          continue
        }

        // Insert into job_attachments
        await sb.from('job_attachments').insert({
          user_id:      user.id,
          job_id:       jobId,
          file_name:    doc.filename,
          storage_path: uploadData.path,
          mime_type:    doc.mime_type,
          file_size:    doc.file_size,
          category:     'plan',
          label:        doc.filename.replace(/\.[^.]+$/, ''), // filename without extension
        })

        copied++
      } catch (fileErr) {
        console.warn('copy-quote-plans: error on file', doc.filename, fileErr)
      }
    }

    return NextResponse.json({ copied })
  } catch (err) {
    console.error('copy-quote-plans error:', err)
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }
}
