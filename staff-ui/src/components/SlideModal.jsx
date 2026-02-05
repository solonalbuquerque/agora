import { useEffect } from 'react';

export default function SlideModal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="slide-modal-overlay" onClick={onClose}>
      <div className="slide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="slide-modal-header">
          <h2>{title}</h2>
          <button type="button" className="slide-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="slide-modal-content">
          {children}
        </div>
      </div>
    </div>
  );
}
