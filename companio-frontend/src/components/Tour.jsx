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
  const [cardHeight, setCardHeight] = useState(260);
  const step = available?.[index];
  useEffect(() => {
    if (!step) return;
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setCardHeight(card.getBoundingClientRect().height));
    observer.observe(card);
    return () => observer.disconnect();
  }, [step]);

  // wait one frame so the page has rendered, then keep the steps whose element exists
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAvailable(steps.filter((step) => !step.target || document.querySelector(step.target)));
    });
    return () => cancelAnimationFrame(frame);
  }, [steps]);

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
    el?.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
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

  // Prefer a free side of the target. If it fills the viewport, reserve a
  // separate instruction area and highlight only the visible target portion.
  let cardStyle = {};
  let spotlight = null;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - 32);
    const height = Math.min(cardHeight, vh - 32);
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    const left = clamp(rect.left, 16, vw - width - 16);
    const top = clamp(rect.top, 16, vh - height - 16);
    const candidates = [
      { left: rect.right + PAD + GAP, top },
      { left: rect.left - PAD - GAP - width, top },
      { left, top: rect.bottom + PAD + GAP },
      { left, top: rect.top - PAD - GAP - height },
    ];
    const position = candidates.find((p) => p.left >= 16 && p.top >= 16 && p.left + width <= vw - 16 && p.top + height <= vh - 16);
    let visibleTop = Math.max(8, rect.top - PAD);
    let visibleBottom = Math.min(vh - 8, rect.bottom + PAD);
    if (position) {
      cardStyle = position;
    } else {
      const maxHeight = Math.floor((vh - 32) * 0.55);
      const dockHeight = Math.min(height, maxHeight);
      const bottomTop = vh - dockHeight - 16;
      const above = Math.max(0, Math.min(visibleBottom, bottomTop - GAP) - visibleTop);
      const below = Math.max(0, visibleBottom - Math.max(visibleTop, 16 + dockHeight + GAP));
      if (above >= below) {
        cardStyle = { left, top: bottomTop, maxHeight };
        visibleBottom = Math.min(visibleBottom, bottomTop - GAP);
      } else {
        cardStyle = { left, top: 16, maxHeight };
        visibleTop = Math.max(visibleTop, 16 + dockHeight + GAP);
      }
    }
    const visibleLeft = Math.max(8, rect.left - PAD);
    const visibleRight = Math.min(vw - 8, rect.right + PAD);
    if (visibleBottom > visibleTop && visibleRight > visibleLeft) {
      spotlight = { top: visibleTop, left: visibleLeft, width: visibleRight - visibleLeft, height: visibleBottom - visibleTop };
    }
  }

  return createPortal(
    <>
      {/* blocks clicks on the page while the tour is open */}
      <div className={rect ? "tour-blocker" : "tour-blocker tour-blocker-dim"} aria-hidden="true" />

      {spotlight && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={spotlight}
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
