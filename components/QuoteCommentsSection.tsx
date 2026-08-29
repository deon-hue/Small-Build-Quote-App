'use client'

import { useState, useEffect } from 'react'
import type { QuoteComment } from '@/lib/types'

interface QuoteCommentsSectionProps {
  quoteId: string
  isPortalView?: boolean  // true for client portal, false for contractor app
}

export default function QuoteCommentsSection({ quoteId, isPortalView = false }: QuoteCommentsSectionProps) {
  const [comments, setComments] = useState<QuoteComment[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchComments()
  }, [quoteId])

  const fetchComments = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/quote-comments?quoteId=${quoteId}`)
      if (!res.ok) throw new Error('Failed to load comments')
      const data = await res.json()
      setComments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    try {
      setIsSubmitting(true)
      setError('')
      const res = await fetch('/api/quote-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          message: newMessage,
          isInternal: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to post comment')
      const newComment = await res.json()
      setComments([...comments, newComment])
      setNewMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return
    try {
      const res = await fetch(`/api/quote-comments/${commentId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete comment')
      setComments(comments.filter(c => c.id !== commentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment')
    }
  }

  // Filter comments: show non-internal comments on portal, all comments in app
  const visibleComments = isPortalView
    ? comments.filter(c => !c.isInternal)
    : comments

  if (isLoading) {
    return <div style={{ padding: '16px', color: '#666', textAlign: 'center' }}>Loading comments...</div>
  }

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '24px', marginTop: '24px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
        💬 Questions & Replies
      </h3>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          color: '#991b1b',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Comments list */}
      <div style={{ marginBottom: '24px' }}>
        {visibleComments.length === 0 ? (
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', color: '#666', fontSize: '14px' }}>
            No comments yet. {isPortalView ? 'Ask a question about this quote.' : 'Waiting for client feedback.'}
          </div>
        ) : (
          visibleComments.map(comment => (
            <div key={comment.id} style={{
              padding: '12px',
              background: '#f9fafb',
              borderRadius: '6px',
              marginBottom: '12px',
              borderLeft: '3px solid #3b82f6',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px',
              }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                    {comment.authorName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {new Date(comment.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                {!isPortalView && comment.authorName === 'You' && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '4px 8px',
                    }}
                    title="Delete comment"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p style={{ margin: '0', color: '#374151', lineHeight: '1.5', fontSize: '14px' }}>
                {comment.message}
              </p>
              {comment.isInternal && !isPortalView && (
                <div style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid #e5e7eb',
                  fontSize: '11px',
                  color: '#6b7280',
                  fontStyle: 'italic',
                }}>
                  🔒 Internal note (not shared with client)
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Comment form */}
      {!isPortalView && (
        <form onSubmit={handleSubmit} style={{
          padding: '16px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '6px',
        }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '600',
              color: '#166534',
              marginBottom: '8px',
            }}>
              Reply to client
            </label>
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type your reply here..."
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #86efac',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'vertical',
                minHeight: '80px',
                boxSizing: 'border-box',
              }}
              disabled={isSubmitting}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={isSubmitting || !newMessage.trim()}
              style={{
                padding: '8px 16px',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isSubmitting || !newMessage.trim() ? 'default' : 'pointer',
                opacity: isSubmitting || !newMessage.trim() ? 0.5 : 1,
              }}
            >
              {isSubmitting ? '⏳ Posting...' : '✓ Post Reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
