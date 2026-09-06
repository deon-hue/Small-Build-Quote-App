'use client'

/**
 * Bottom-right resize grip for a draggable modal (see useDraggableModal).
 * Desktop/mouse only — hidden on touch via the .modal-resize-handle CSS rule
 * in globals.css, so it never appears on tablet/phone.
 */
export default function ModalResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div className="modal-resize-handle" onMouseDown={onMouseDown} title="Drag to resize">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M11 1L1 11M11 6L6 11M11 11L11 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}
