"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./error-toast.module.css";

/**
 * A visible, dismissible notification for errors that happen away from the
 * form field they relate to (a failed network call, a server rejection) —
 * on top of the inline message shown next to the relevant field, so the
 * error is impossible to miss even if the guest has scrolled away from the
 * form while a request was in flight.
 */
export function useErrorToast() {
  const [message, setMessage] = useState<string | null>(null);
  // Bumped on every show() so re-triggering the same message still re-announces it.
  const [nonce, setNonce] = useState(0);

  return {
    message,
    nonce,
    show(next: string) {
      setMessage(next);
      setNonce((current) => current + 1);
    },
    dismiss() {
      setMessage(null);
    },
  };
}

export function ErrorToast({
  message,
  nonce,
  onDismiss,
  closeLabel,
}: {
  message: string | null;
  nonce: number;
  onDismiss: () => void;
  closeLabel: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (message) closeButtonRef.current?.focus();
  }, [message, nonce]);

  if (!message) return null;

  return (
    <div className={styles.toastLayer}>
      <div className={styles.toast} role="alert">
        <span className={styles.icon} aria-hidden="true">⚠</span>
        <p className={styles.message}>{message}</p>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.close}
          onClick={onDismiss}
          aria-label={closeLabel}
        >
          ×
        </button>
      </div>
    </div>
  );
}
