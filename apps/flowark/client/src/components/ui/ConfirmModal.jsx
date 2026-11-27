import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const CONFIRM_MODAL_FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function ConfirmModal({ modal, onClose }) {
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const inputHelpId = useId();
  const inputErrorId = useId();

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    setInputValue('');
    setSubmitting(false);
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    const frame = requestAnimationFrame(() => {
      const focusableElements = Array.from(dialogRef.current?.querySelectorAll(CONFIRM_MODAL_FOCUSABLE_SELECTOR) || [])
        .filter(element => element.offsetParent !== null);
      const preferredElement = focusableElements.find(element => element.hasAttribute('data-modal-autofocus'));
      (preferredElement || focusableElements[0] || dialogRef.current)?.focus?.({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !submitting) onClose();
      if (event.key === 'Tab') {
        const focusableElements = Array.from(dialogRef.current?.querySelectorAll(CONFIRM_MODAL_FOCUSABLE_SELECTOR) || [])
          .filter(element => element.offsetParent !== null);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, onClose, submitting]);

  if (!modal) return null;

  const ModalIcon = modal.Icon;
  const expectedInput = typeof modal.expectedInput === 'string' ? modal.expectedInput : '';
	  const hasRequiredInput = modal.inputRequired || Boolean(expectedInput);
	  const hasMissingRequiredInput = hasRequiredInput && !inputValue.trim();
	  const hasMismatchedExpectedInput = Boolean(expectedInput) && inputValue.trim().toLowerCase() !== expectedInput.toLowerCase();
	  const confirmDisabled = submitting || hasMissingRequiredInput || hasMismatchedExpectedInput;
	  const inputHelpText = expectedInput
	    ? `Confirmación requerida: escribe ${expectedInput}.`
	    : (modal.inputRequired ? 'Este campo es obligatorio para continuar.' : '');
  const inputErrorText = expectedInput && inputValue.trim() && hasMismatchedExpectedInput ? 'El texto no coincide.' : '';
  const inputDescriptionIds = [inputHelpText ? inputHelpId : '', inputErrorText ? inputErrorId : ''].filter(Boolean).join(' ') || undefined;

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setSubmitting(true);
    try {
      await Promise.resolve(modal.onConfirm(inputValue));
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const colors = {
    red:    { border: 'border-red-500/15',    btn: 'from-red-600 to-red-500',       icon: 'bg-red-500/[0.08] text-red-400',    glow: 'from-transparent via-red-500/20 to-transparent' },
	    orange: { border: 'border-orange-500/15',  btn: 'from-orange-600 to-orange-500',  icon: 'bg-orange-500/[0.08] text-orange-400', glow: 'from-transparent via-orange-500/20 to-transparent' },
	    green:  { border: 'border-cyan-500/15', btn: 'from-cyan-600 to-cyan-500', icon: 'bg-cyan-500/[0.08] text-cyan-400', glow: 'from-transparent via-cyan-500/20 to-transparent' },
	    amber:  { border: 'border-amber-500/15',   btn: 'from-amber-600 to-amber-500',    icon: 'bg-amber-500/[0.08] text-amber-400', glow: 'from-transparent via-amber-500/20 to-transparent' },
	    yellow: { border: 'border-amber-500/15',   btn: 'from-amber-600 to-amber-500',    icon: 'bg-amber-500/[0.08] text-amber-400', glow: 'from-transparent via-amber-500/20 to-transparent' },
    purple: { border: 'border-purple-500/15',  btn: 'from-purple-600 to-purple-500',  icon: 'bg-purple-500/[0.08] text-purple-400', glow: 'from-transparent via-purple-500/20 to-transparent' },
    blue:   { border: 'border-indigo-500/30/15',   btn: 'bg-indigo-500 hover:bg-indigo-400',    icon: 'bg-indigo-500/[0.08] text-indigo-400', glow: 'from-transparent via-indigo-500/20 to-transparent' },
  };

  const c = colors[modal.color] || colors.blue;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[140] flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={() => { if (!submitting) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.92, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 20, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.35 }}
          ref={dialogRef}
          className={`relative flex max-h-[calc(100dvh-1rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border ${c.border} bg-[#18181b] shadow-2xl shadow-black/20`}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${c.glow}`}></div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>
                {ModalIcon && <ModalIcon size={18} />}
              </div>
	              <h3 id={titleId} className="min-w-0 break-words text-[15px] font-bold flex-1 text-white">{modal.title}</h3>
              <button onClick={onClose} disabled={submitting} className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:w-auto sm:p-1.5" aria-label="Cerrar confirmación">
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar sm:px-6">
	              <p id={descriptionId} className="mb-5 break-words text-[13px] leading-relaxed text-zinc-400">{modal.message}</p>

              {modal.hasInput && (
                <div>
                  <label htmlFor={inputId} className="block text-[9px] font-medium text-zinc-500 uppercase tracking-[0.15em] mb-1.5 pl-1">
                    {modal.inputLabel}
                  </label>
                  <input
                    id={inputId}
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
	                      onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
		                      placeholder={modal.inputLabel}
		                      disabled={submitting}
		                      aria-invalid={hasMissingRequiredInput || hasMismatchedExpectedInput}
		                      aria-describedby={inputDescriptionIds}
		                      className="w-full bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none text-sm transition-all hover:border-zinc-600"
                          data-modal-autofocus
		                      autoFocus
		                    />
		                    {inputHelpText && (
		                      <p id={inputHelpId} className="mt-2 px-1 text-[11px] text-zinc-500">{inputHelpText}</p>
		                    )}
		                    {inputErrorText && (
		                      <p id={inputErrorId} className="mt-2 px-1 text-[11px] text-red-300">{inputErrorText}</p>
	                    )}
	                  </div>
	                )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2.5 justify-end border-t border-zinc-800 bg-[#18181b] px-5 py-4 sm:px-6">
              <button onClick={onClose} disabled={submitting} data-modal-autofocus={!modal.hasInput ? true : undefined} className="min-h-11 px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all disabled:cursor-not-allowed disabled:opacity-40">
                Cancelar
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
	                whileTap={{ scale: 0.97 }}
		                onClick={handleConfirm}
	                disabled={confirmDisabled}
	                className={`min-h-11 px-5 py-2.5 rounded-xl font-semibold text-white transition-all shadow-lg text-xs bg-gradient-to-r ${c.btn} btn-premium disabled:opacity-40 disabled:cursor-not-allowed`}
	              >
                {submitting ? 'Procesando...' : (modal.confirmText || 'Confirmar')}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
