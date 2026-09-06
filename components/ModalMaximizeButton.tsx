'use client'

/**
 * Maximize/restore toggle for a draggable modal (see useDraggableModal).
 * Desktop/mouse only — hidden on touch via the .modal-maximize-btn CSS rule
 * in globals.css, so it never appears on tablet/phone (where the modal is
 * already a fixed full-width sheet, so "maximize" wouldn't mean anything).
 */
export default function ModalMaximizeButton({ isMaximized, onClick }: { isMaximized: boolean; onClick: () => void }) {
  return (
    <button type="button" className="modal-maximize-btn" onClick={onClick} title={isMaximized ? 'Restore' : 'Maximize'}>
      {isMaximized ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="3.2" y="1.2" width="8.6" height="8.6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M1.2 3.7V10.8a1 1 0 0 0 1 1H9.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="1.5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      )}
    </button>
  )
}
