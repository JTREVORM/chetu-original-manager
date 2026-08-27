import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The one scrollable container in the app.
 *
 * Every region whose content can outgrow its box — data tables, long lists,
 * modal bodies, drawers, dropdowns — should be wrapped in this rather than
 * carrying its own `overflow-*` utilities, so that overflow behaviour and the
 * scrollbar skin stay identical everywhere.
 *
 * Scrollbars come from `overflow: auto`, so they appear only when the content
 * actually overflows; a region that fits shows nothing.
 */
export interface ScrollAreaProps {
  /**
   * Which direction may scroll. `x` is the common case for wide tables, `y`
   * for long lists and modal bodies, `both` for large data grids.
   */
  axis?: 'x' | 'y' | 'both';
  /**
   * Caps the height and turns on vertical scrolling. Any CSS length, e.g.
   * `'60vh'` or `'24rem'`. Required for `axis="y"`/`"both"` to do anything
   * when the parent does not already constrain the height.
   */
  maxHeight?: string;
  /**
   * Paddle buttons over the left/right edges, shown only while there is more
   * to scroll in that direction. Worth it on wide tables, noise on small ones.
   */
  arrows?: boolean;
  /** Classes for the scrolling element itself (borders, radius, background). */
  className?: string;
  /** Classes for the positioned wrapper — only relevant with `arrows`/`fade`. */
  wrapperClassName?: string;
  children: React.ReactNode;
  /** Accessible label; a keyboard-scrollable region should say what it holds. */
  ariaLabel?: string;
}

const AXIS_CLASS: Record<NonNullable<ScrollAreaProps['axis']>, string> = {
  x: 'scroll-x',
  y: 'scroll-y',
  both: 'scroll-both',
};

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  axis = 'x',
  maxHeight,
  arrows = false,
  className = '',
  wrapperClassName = '',
  children,
  ariaLabel,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const canScrollX = axis === 'x' || axis === 'both';
  const decorate = arrows && canScrollX;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2px tolerance: sub-pixel layout leaves a hairline of scrollWidth that
    // would otherwise keep an arrow lit at the very end of the track.
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !decorate) return;
    sync();
    // Content can change size without the window resizing (a filter narrows
    // the table, rows load in), so observe the element itself.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [decorate, sync, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
  };

  const scroller = (
    <div
      ref={ref}
      onScroll={decorate ? sync : undefined}
      style={maxHeight ? { maxHeight } : undefined}
      className={`scroll-area ${AXIS_CLASS[axis]} ${className}`}
      // A region the pointer can scroll must also be reachable by keyboard.
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );

  if (!decorate) return scroller;

  const paddle =
    'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full ' +
    'border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 md:flex';

  return (
    <div className={`relative ${wrapperClassName}`}>
      {scroller}

      {/* Arrows are a pointer convenience; touch users swipe, so they are
          hidden below md where the tap target would also cover the content. */}
      {canLeft && (
        <button type="button" onClick={() => page(-1)} aria-label="Scroll left" className={`${paddle} left-2`}>
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canRight && (
        <button type="button" onClick={() => page(1)} aria-label="Scroll right" className={`${paddle} right-2`}>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

/**
 * A wide table in its own scrollable box: horizontal always, vertical too once
 * `maxHeight` is given, with the header row pinned while the body scrolls.
 */
export const TableScroll: React.FC<{
  children: React.ReactNode;
  /** Turns on vertical scrolling and pins the `thead`. */
  maxHeight?: string;
  arrows?: boolean;
  className?: string;
  ariaLabel?: string;
}> = ({ children, maxHeight, arrows = true, className = '', ariaLabel }) => (
  <ScrollArea
    axis={maxHeight ? 'both' : 'x'}
    maxHeight={maxHeight}
    arrows={arrows}
    className={`${maxHeight ? 'table-sticky-head' : ''} ${className}`}
    ariaLabel={ariaLabel}
  >
    {children}
  </ScrollArea>
);
