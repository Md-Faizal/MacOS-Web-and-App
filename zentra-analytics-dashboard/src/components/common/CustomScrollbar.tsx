import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';

export interface CustomScrollbarTrackProps {
  targetRef?: React.RefObject<HTMLElement | null>;
  useWindow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * CustomScrollbarTrack — Independent macOS-style overlay scrollbar track
 * Can be positioned OUTSIDE the main content box (e.g. on viewport edge or glass gutter).
 * Controls and mirrors either `window` scroll (when useWindow=true) or an element via `targetRef`.
 */
export const CustomScrollbarTrack: React.FC<CustomScrollbarTrackProps> = ({
  targetRef,
  useWindow = false,
  className = '',
  style: userStyle,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop,    setThumbTop]    = useState(0);
  const [visible,     setVisible]     = useState(false);
  const [hovered,     setHovered]     = useState(false);
  const [dragging,    setDragging]    = useState(false);
  const [hasScroll,   setHasScroll]   = useState(false);

  const hideTimer  = useRef<ReturnType<typeof setTimeout>>();
  const dragOrigin = useRef<{ y: number; top: number } | null>(null);

  // ── Helper to read scroll metrics from target or window ─────────────────
  const getScrollMetrics = useCallback(() => {
    if (useWindow || !targetRef) {
      if (typeof window === 'undefined') return null;
      const doc = document.documentElement;
      const body = document.body;
      const clientH = window.innerHeight;
      const scrollH = Math.max(
        doc.scrollHeight,
        doc.offsetHeight,
        body.scrollHeight,
        body.offsetHeight
      );
      const scrollT = window.scrollY || doc.scrollTop || body.scrollTop || 0;
      return { clientH, scrollH, scrollT };
    } else {
      const el = targetRef.current;
      if (!el) return null;
      return {
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        scrollT: el.scrollTop,
      };
    }
  }, [useWindow, targetRef]);

  // ── Compute thumb position & height ─────────────────────────────────────
  const computeThumb = useCallback(() => {
    const metrics = getScrollMetrics();
    if (!metrics) return;

    const { clientH, scrollH, scrollT } = metrics;
    const scrollable = scrollH > clientH + 1;
    setHasScroll(scrollable);
    if (!scrollable) return;

    const trackH = trackRef.current ? trackRef.current.clientHeight : clientH;
    const ratio = clientH / scrollH;
    const h = Math.max(ratio * trackH, 36);
    const maxTop = trackH - h;
    const scrollRange = scrollH - clientH;
    const progress = scrollRange > 0 ? scrollT / scrollRange : 0;

    setThumbHeight(h);
    setThumbTop(Math.min(Math.max(0, progress * maxTop), maxTop));
  }, [getScrollMetrics]);

  // ── Flash visible on scroll activity ────────────────────────────────────
  const flashVisible = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1400);
  }, []);

  // ── Listen to scroll, resizes & mutations ───────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      computeThumb();
      flashVisible();
    };

    const onWinResize = () => computeThumb();
    window.addEventListener('resize', onWinResize);

    let ro: ResizeObserver | null = null;
    let trackRo: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    if (useWindow || !targetRef) {
      window.addEventListener('scroll', onScroll, { passive: true });
      ro = new ResizeObserver(() => computeThumb());
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);

      mo = new MutationObserver(() => computeThumb());
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      const el = targetRef.current;
      if (el) {
        el.addEventListener('scroll', onScroll, { passive: true });
        ro = new ResizeObserver(() => computeThumb());
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);

        mo = new MutationObserver(() => computeThumb());
        mo.observe(el, { childList: true, subtree: true });
      }
    }

    if (trackRef.current) {
      trackRo = new ResizeObserver(() => computeThumb());
      trackRo.observe(trackRef.current);
    }

    computeThumb();

    const t1 = setTimeout(computeThumb, 100);
    const t2 = setTimeout(computeThumb, 400);

    return () => {
      if (useWindow || !targetRef) {
        window.removeEventListener('scroll', onScroll);
      } else {
        targetRef.current?.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('resize', onWinResize);
      ro?.disconnect();
      trackRo?.disconnect();
      mo?.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [useWindow, targetRef, computeThumb, flashVisible]);

  // ── Thumb drag (pointer capture) ────────────────────────────────────────
  const onThumbPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragOrigin.current = { y: e.clientY, top: thumbTop };
    setDragging(true);
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragOrigin.current || !trackRef.current) return;
    e.preventDefault();
    const metrics = getScrollMetrics();
    if (!metrics) return;

    const { clientH, scrollH } = metrics;
    const trackH = trackRef.current.clientHeight;
    const delta = e.clientY - dragOrigin.current.y;
    const maxTop = trackH - thumbHeight;
    const newTop = Math.max(0, Math.min(dragOrigin.current.top + delta, maxTop));
    const ratio = maxTop > 0 ? newTop / maxTop : 0;
    const targetScrollTop = ratio * (scrollH - clientH);

    if (useWindow || !targetRef) {
      window.scrollTo({ top: targetScrollTop, behavior: 'instant' as any });
    } else if (targetRef.current) {
      targetRef.current.scrollTop = targetScrollTop;
    }
  };

  const onThumbPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragging(false);
    flashVisible();
  };

  // ── Track click = smooth jump ───────────────────────────────────────────
  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || e.target === thumbRef.current) return;
    const metrics = getScrollMetrics();
    if (!metrics) return;

    const { clientH, scrollH } = metrics;
    const rect = trackRef.current.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;
    const targetScrollTop = clickRatio * (scrollH - clientH);

    if (useWindow || !targetRef) {
      window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else if (targetRef.current) {
      targetRef.current.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    }
  };

  if (!hasScroll) return null;

  const showThumb = visible || hovered || dragging;
  const expanded = hovered || dragging;
  const trackWidth = expanded ? 14 : 6;
  const thumbWidth = expanded ? 10 : 4;
  const thumbRight = expanded ? 2 : 1;

  const thumbBg = dragging
    ? 'rgba(17,17,17,0.62)'
    : hovered
    ? 'rgba(17,17,17,0.42)'
    : 'rgba(17,17,17,0.24)';

  const transition = [
    'width 0.22s cubic-bezier(0.16,1,0.3,1)',
    'right 0.22s cubic-bezier(0.16,1,0.3,1)',
    'background 0.15s ease',
    'opacity 0.25s ease',
  ].join(', ');

  return (
    <div
      ref={trackRef}
      className={`pointer-events-auto select-none fixed top-2 bottom-2 sm:top-3 sm:bottom-3 lg:top-4 lg:bottom-4 z-50 ${className}`}
      style={{
        right: 'max(4px, calc((100vw - 1760px) / 2 - 14px))',
        width: `${trackWidth}px`,
        display: 'flex',
        justifyContent: 'flex-end',
        transition: 'width 0.22s cubic-bezier(0.16,1,0.3,1)',
        cursor: 'default',
        ...userStyle,
      }}
      onClick={onTrackClick}
      onMouseEnter={() => {
        setHovered(true);
        setVisible(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
      }}
      onMouseLeave={() => {
        if (!dragging) {
          setHovered(false);
          flashVisible();
        }
      }}
    >
      {/* Track pill background (visible on hover) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '9999px',
          background: expanded ? 'rgba(17,17,17,0.06)' : 'transparent',
          boxShadow: expanded ? 'inset 0 0 0 1px rgba(255,255,255,0.45)' : 'none',
          backdropFilter: expanded ? 'blur(6px)' : 'none',
          WebkitBackdropFilter: expanded ? 'blur(6px)' : 'none',
          transition: 'background 0.22s ease, box-shadow 0.22s ease',
        }}
      />

      {/* Thumb */}
      <div
        ref={thumbRef}
        className="absolute rounded-full select-none"
        style={{
          right: `${thumbRight}px`,
          top: `${thumbTop}px`,
          height: `${thumbHeight}px`,
          width: `${thumbWidth}px`,
          background: thumbBg,
          opacity: showThumb ? 1 : 0,
          cursor: dragging ? 'grabbing' : 'grab',
          transition,
          willChange: 'top, height',
        }}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
        onPointerCancel={onThumbPointerUp}
      />
    </div>
  );
};

// ── CustomScrollbar wrapper for general container use ───────────────────────
export interface CustomScrollbarProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export interface CustomScrollbarHandle {
  scrollTo: (options: ScrollToOptions) => void;
  readonly scrollTop: number;
}

export const CustomScrollbar = forwardRef<CustomScrollbarHandle, CustomScrollbarProps>(
  ({ children, className = '', innerClassName = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollTo: (opts) => containerRef.current?.scrollTo(opts),
      get scrollTop() {
        return containerRef.current?.scrollTop ?? 0;
      },
    }));

    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div
          ref={containerRef}
          className={`h-full w-full overflow-y-scroll ${innerClassName}`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <style>{`.zcs-inner::-webkit-scrollbar{display:none}`}</style>
          <div className="zcs-inner">{children}</div>
        </div>
        <CustomScrollbarTrack targetRef={containerRef} className="absolute! top-2! bottom-2! right-0!" />
      </div>
    );
  },
);

CustomScrollbar.displayName = 'CustomScrollbar';
