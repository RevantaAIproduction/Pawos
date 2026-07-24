import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

/**
 * Shown once after PawOS has been running continuously for 3 hours (see
 * RatingPromptScheduler.ts, main process) — never sooner, never more than
 * once per session, and never again at all once the user rates or picks
 * "Don't ask again".
 */
export function RatingFeedbackModal() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    ipc.onShowRatingPrompt(() => setOpen(true));
  }, []);

  const close = () => {
    setOpen(false);
    setRating(0);
    setHoverRating(0);
    setComment('');
    setSubmitted(false);
  };

  const submit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await ipc.feedbackSubmit({ rating, comment: comment.trim() || undefined });
      setSubmitted(true);
      setTimeout(close, 1600);
    } finally {
      setSubmitting(false);
    }
  };

  const dontAskAgain = async () => {
    await ipc.feedbackDismiss({ dontAskAgain: true });
    close();
  };

  if (!open) return null;

  return (
    <div className={styles.ratingModalOverlay}>
      <div className={styles.ratingModalPanel}>
        {submitted ? (
          <>
            <h3 className={styles.cardTitle}>Thanks for the feedback!</h3>
            <p className={styles.cardBody} style={{ marginTop: 6 }}>It really helps us improve PawOS.</p>
          </>
        ) : (
          <>
            <h3 className={styles.cardTitle}>How's PawOS working out for you?</h3>
            <p className={styles.cardBody} style={{ marginTop: 6 }}>
              You've had Paw running for a few hours now — mind rating your experience so far?
            </p>

            <div className={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.ratingStar}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(n)}
                >
                  {(hoverRating || rating) >= n ? '★' : '☆'}
                </button>
              ))}
            </div>

            <textarea
              className={styles.ratingTextarea}
              placeholder="Anything you'd like us to know? (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className={styles.primaryButton} disabled={rating === 0 || submitting} onClick={submit}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
              <button type="button" className={styles.chip} onClick={close}>
                Not now
              </button>
              <button type="button" className={styles.chip} onClick={dontAskAgain}>
                Don't ask again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
