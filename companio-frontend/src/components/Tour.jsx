import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PAD = 8; // space between the highlighted element and its outline
const GAP = 14; // space between the highlight and the tip card

// A step-by-step guide: dims the page, highlights one element at a time and explains it.
// steps = [{ target?: CSS selector, title, body }] - a step without a target is shown in the middle.
// Steps whose element isn't on the page (e.g. no pets matched) are skipped.
export default function Tour({ steps, onClose }) {
  const [available, setAvailable] = useState(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);

  // wait one frame so the page has rendered, then keep the steps whose element exists
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAvailable(steps.filter((step) => !step.target || document.querySelector(step.target)));
    });
    return () => cancelAnimationFrame(frame);
  }, [steps]);

  const step = available?.[index];
  const isLast = available && index === available.length - 1;

  // scroll the highlighted element into view and follow it while scrolling / resizing
  useEffect(() => {
    if (!step) {
      return undefined;
    }

    let frame;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = step.target ? document.querySelector(step.target) : null;
        setRect(el ? el.getBoundingClientRect() : null);
      });
    };

    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    cardRef.current?.focus();

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const next = () => {
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => i + 1);
    }
  };

  // keyboard: Esc skips, arrow keys move between steps
  useEffect(() => {
    if (!available) {
      return undefined;
    }

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!step) {
    return null;
  }

  // place the card under the element, or above it when there isn't room below
  let cardStyle = {};
  if (rect) {
    const width = Math.min(340, window.innerWidth - 32);
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
    const roomBelow = window.innerHeight - rect.bottom;

    cardStyle = roomBelow > 240
      ? { top: rect.bottom + PAD + GAP, left }
      : { bottom: window.innerHeight - rect.top + PAD + GAP, left };
  }

  return createPortal(
    <>
      {/* blocks clicks on the page while the tour is open */}
      <div className={rect ? "tour-blocker" : "tour-blocker tour-blocker-dim"} aria-hidden="true" />

      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}

      <div
        ref={cardRef}
        className={rect ? "tour-card" : "tour-card tour-card-center"}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <p className="tour-count">Step {index + 1} of {available.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body" className="muted">{step.body}</p>

        <div className="tour-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Skip tour
          </button>
          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
