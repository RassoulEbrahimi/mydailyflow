/**
 * measure.ts — in-page measurement primitives for the Phase 1A baseline.
 *
 * These read the rendered result only. Nothing here changes app state, and no
 * helper "fixes" anything it finds: PR0 records, later PRs repair.
 */

import type { Page } from '@playwright/test';

/**
 * Installs `window.__mdfColor`, a colour toolkit backed by a 1x1 canvas.
 *
 * Parsing `getComputedStyle().color` with a regex is not good enough here:
 * Tailwind v4 emits its palette as `oklch(...)`, and Chromium serialises those
 * computed values back as `oklch(...)` rather than `rgb(...)`. A regex that only
 * understands `rgb()/rgba()` silently skips every Tailwind palette colour —
 * which then falls through to some ancestor's background and yields a contrast
 * ratio for a colour pair that is not on screen.
 *
 * The canvas parses whatever CSS accepts, and compositing the whole background
 * stack *inside* the canvas (back to front, over an opaque base) means the final
 * read is exact rather than a round trip through premultiplied alpha.
 *
 * Idempotent, and scoped to the throwaway test context.
 */
async function ensureColorUtils(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface ColorUtils {
      rgba(value: string): [number, number, number, number] | null;
      flatten(layers: string[], base: string): [number, number, number, number];
      luminance(c: [number, number, number, number]): number;
      contrast(a: [number, number, number, number], b: [number, number, number, number]): number;
      hex(c: [number, number, number, number]): string;
    }
    const w = window as unknown as { __mdfColor?: ColorUtils };
    if (w.__mdfColor) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const read = (): [number, number, number, number] => {
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };

    /** Resolve any CSS colour to sRGB bytes. Null when CSS cannot parse it. */
    const rgba = (value: string): [number, number, number, number] | null => {
      const v = (value || '').trim();
      if (!v) return null;
      if (v === 'transparent' || v === 'none') return [0, 0, 0, 0];
      // An unparseable value leaves fillStyle at the sentinel.
      ctx.fillStyle = '#010203';
      ctx.fillStyle = v;
      if (ctx.fillStyle === '#010203' && !/^#0*10*20*3$/i.test(v)) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      return read();
    };

    /**
     * Paint `layers` (front-most first) over an opaque `base` and read the
     * result. Because the base is opaque the final pixel is fully opaque, so no
     * unpremultiplication happens and the value is exact.
     */
    const flatten = (layers: string[], base: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      for (let i = layers.length - 1; i >= 0; i--) {
        ctx.fillStyle = layers[i];
        ctx.fillRect(0, 0, 1, 1);
      }
      return read();
    };

    const luminance = (c: [number, number, number, number]): number => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
    };

    const contrast = (
      a: [number, number, number, number],
      b: [number, number, number, number],
    ): number => {
      const la = luminance(a);
      const lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    const hex = (c: [number, number, number, number]): string =>
      `#${[c[0], c[1], c[2]].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

    w.__mdfColor = { rgba, flatten, luminance, contrast, hex };
  });
}

/** Shape of the in-page colour toolkit, for use inside evaluate callbacks. */
interface ColorUtils {
  rgba(value: string): [number, number, number, number] | null;
  flatten(layers: string[], base: string): [number, number, number, number];
  luminance(c: [number, number, number, number]): number;
  contrast(a: [number, number, number, number], b: [number, number, number, number]): number;
  hex(c: [number, number, number, number]): string;
}

// ─── Shared result shapes ─────────────────────────────────────────────────────

export interface ContrastPair {
  /** CSS selector-ish path, for locating the element again by hand. */
  path: string;
  /** Accessible name or trimmed text, whichever identifies it better. */
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  /** True when WCAG "large text" applies (>=24px, or >=18.66px and bold). */
  isLargeText: boolean;
  /** 4.5 for normal text, 3 for large text. */
  threshold: number;
  passes: boolean;
  /** Set when the effective background could not be resolved to an opaque color. */
  note?: string;
}

export interface HitTarget {
  path: string;
  label: string;
  role: string;
  width: number;
  height: number;
  /** True when both dimensions reach 44 CSS px. */
  meets44: boolean;
  /**
   * False for controls that are mounted but parked off-screen — the modals stay
   * in the DOM at `translate-y-full` when closed, so their controls are counted
   * here too. Separating them keeps "small target on the visible screen" apart
   * from "small target inside a closed overlay".
   */
  inViewport: boolean;
}

export interface NamelessControl {
  path: string;
  tag: string;
  role: string;
  /** What the control looks like from the outside — icon name, class hints. */
  hint: string;
}

export interface FocusStep {
  index: number;
  path: string;
  label: string;
  role: string;
  /** Bounding box at the moment focus landed. */
  rect: { x: number; y: number; width: number; height: number };
  /** True when the focused element is inside the visual viewport. */
  inViewport: boolean;
  /** True when Chromium considers this a keyboard focus worth ringing. */
  focusVisible: boolean;
  /** outline/box-shadow as computed while focused, after transitions settle. */
  focusStyle: { outlineWidth: string; outlineStyle: string; outlineColor: string; boxShadow: string };
  /** True when *any* focus indicator is drawn — UA ring or author style. */
  hasVisibleFocusIndicator: boolean;
  /**
   * Contrast of the drawn ring against the surface immediately behind it.
   * WCAG 2.4.11/1.4.11 want >= 3:1. Null when no ring is drawn.
   */
  indicatorContrast: number | null;
  /** True when the ring is drawn but fails the 3:1 non-text contrast minimum. */
  indicatorBelow3: boolean;
}

export interface StickyMeasurement {
  present: boolean;
  position: string;
  top: string;
  zIndex: string;
  /** Hero box relative to the viewport. */
  rect: { top: number; bottom: number; height: number };
  /** Fixed bottom nav box. */
  navRect: { top: number; bottom: number; height: number };
  /** Scroll container's visible height. */
  viewportHeight: number;
  /** Content hidden behind the fixed nav, if any, in CSS px. */
  contentClippedByNav: number;
}

// ─── The in-page script ───────────────────────────────────────────────────────
// Kept as one string-free function passed to page.evaluate so it type-checks
// against the DOM lib, but it must stay self-contained: nothing outside its own
// body is in scope inside the browser.

interface PageMeasurements {
  contrast: ContrastPair[];
  hitTargets: HitTarget[];
  namelessControls: NamelessControl[];
  horizontalOverflow: { path: string; label: string; overflowPx: number; scrollWidth: number; clientWidth: number }[];
  documentScrollWidth: number;
  documentClientWidth: number;
  /**
   * Whether the Inter webfont actually loaded. index.html pulls it from
   * fonts.googleapis.com with a render-blocking <link>, so on an offline or
   * egress-restricted machine the app renders in the fallback sans-serif and
   * text-derived box sizes shift slightly. Recorded with every measurement so
   * the numbers in the baseline document can never be misread.
   */
  interFontLoaded: boolean;
  /** Resolved font-family on the app root, where `.font-display` is applied. */
  appFontFamily: string;
}

/* eslint-disable */
function collectMeasurements(): PageMeasurements {
  // ── helpers ───────────────────────────────────────────────────────────────
  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && depth < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += `#${node.id}`;
      const cls = (node.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join('.');
      if (cls) part += `.${cls}`;
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  };

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const title = el.getAttribute('title');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    if (title && title.trim()) return title.trim();
    return '';
  };

  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'input') return `input[${el.getAttribute('type') || 'text'}]`;
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    return 'generic';
  };

  const color = (window as unknown as { __mdfColor: ColorUtils }).__mdfColor;

  /**
   * The background stack behind an element, front-most first, stopping at the
   * first opaque layer. Compositing is left to the canvas so alpha layers like
   * `bg-primary/15` come out exact.
   */
  const backgroundStack = (el: Element): { layers: string[]; note?: string } => {
    const layers: string[] = [];
    let node: Element | null = el;
    let note: string | undefined;

    while (node) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !note) {
        note = `${node.tagName.toLowerCase()} paints a background-image/gradient — ratio uses its background-color only`;
      }
      const raw = cs.backgroundColor;
      const parsed = color.rgba(raw);
      if (parsed && parsed[3] > 0) {
        layers.push(raw);
        if (parsed[3] >= 0.999) return { layers, note };
      }
      node = node.parentElement;
    }

    return {
      layers,
      note: note ?? 'no opaque ancestor background; page canvas colour assumed',
    };
  };

  /** Opaque colour the page paints where nothing else does. */
  const canvasBase = (() => {
    const bodyBg = color.rgba(getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg[3] >= 0.999) return getComputedStyle(document.body).backgroundColor;
    const htmlBg = color.rgba(getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg[3] >= 0.999) return getComputedStyle(document.documentElement).backgroundColor;
    return '#ffffff';
  })();

  const hex = (c: [number, number, number, number]): string => color.hex(c);

  const isVisible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** Direct text content only — ignores text that belongs to child elements. */
  const ownText = (el: Element): string => {
    let s = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) s += n.nodeValue || '';
    });
    return s.replace(/\s+/g, ' ').trim();
  };

  // ── contrast over every element that paints its own text ──────────────────
  const contrastPairs: ContrastPair[] = [];
  const seenContrast = new Set<string>();

  document.querySelectorAll<HTMLElement>('main *, nav *, header *, [role="dialog"] *').forEach((el) => {
    const text = ownText(el);
    if (!text || !isVisible(el)) return;

    const cs = getComputedStyle(el);
    if (!color.rgba(cs.color)) return;

    const bg = backgroundStack(el);
    const bgColor = color.flatten(bg.layers, canvasBase);

    // `opacity` on an ancestor fades the text toward its backdrop; folding it in
    // keeps the ratio honest for the many `opacity-50` / `opacity-70` rows.
    const inheritedOpacity = (() => {
      let acc = 1;
      let node: Element | null = el;
      while (node) {
        const o = Number(getComputedStyle(node).opacity);
        if (!Number.isNaN(o)) acc *= o;
        node = node.parentElement;
      }
      return acc;
    })();

    // Text is painted over the flattened background; the canvas does the blend,
    // so an alpha-carrying foreground such as `text-fg/50` resolves exactly.
    const fg = color.flatten([cs.color], color.hex(bgColor));

    // Then fade the result toward the background by the inherited opacity.
    const fgFaded: [number, number, number, number] = [
      fg[0] * inheritedOpacity + bgColor[0] * (1 - inheritedOpacity),
      fg[1] * inheritedOpacity + bgColor[1] * (1 - inheritedOpacity),
      fg[2] * inheritedOpacity + bgColor[2] * (1 - inheritedOpacity),
      1,
    ];

    const fontSizePx = parseFloat(cs.fontSize);
    const fontWeight = Number(cs.fontWeight) || 400;
    const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
    const threshold = isLargeText ? 3 : 4.5;
    const ratio = Math.round(color.contrast(fgFaded, bgColor) * 100) / 100;

    // One row per (colour pair, size, weight) — the same token pair repeated
    // across twenty cards is one finding, not twenty.
    const dedupe = `${hex(fgFaded)}|${hex(bgColor)}|${fontSizePx}|${fontWeight}`;
    if (seenContrast.has(dedupe)) return;
    seenContrast.add(dedupe);

    contrastPairs.push({
      path: describe(el),
      label: text.slice(0, 60),
      foreground: hex(fgFaded),
      background: hex(bgColor),
      ratio,
      fontSizePx,
      fontWeight,
      isLargeText,
      threshold,
      passes: ratio >= threshold,
      note: bg.note,
    });
  });

  // ── interactive targets: size + accessible name ───────────────────────────
  const INTERACTIVE =
    'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])';

  const hitTargets: HitTarget[] = [];
  const namelessControls: NamelessControl[] = [];

  document.querySelectorAll<HTMLElement>(INTERACTIVE).forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    const label = accessibleName(el);
    const role = roleOf(el);

    hitTargets.push({
      path: describe(el),
      label,
      role,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      meets44: r.width >= 44 && r.height >= 44,
      inViewport:
        r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
    });

    if (!label) {
      const icon = el.querySelector('svg');
      const iconClass = icon ? icon.getAttribute('class') || 'svg' : '';
      namelessControls.push({
        path: describe(el),
        tag: el.tagName.toLowerCase(),
        role,
        hint: icon ? `icon-only (${iconClass || 'svg'})` : 'no text, no icon',
      });
    }
  });

  // ── horizontal bleed ──────────────────────────────────────────────────────
  const horizontalOverflow: PageMeasurements['horizontalOverflow'] = [];
  document.querySelectorAll<HTMLElement>('main, main *, nav, header').forEach((el) => {
    if (!isVisible(el)) return;
    const overflowPx = el.scrollWidth - el.clientWidth;
    if (overflowPx > 1 && el.clientWidth > 0) {
      horizontalOverflow.push({
        path: describe(el),
        label: ownText(el).slice(0, 40),
        overflowPx,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  });

  return {
    contrast: contrastPairs,
    hitTargets,
    namelessControls,
    horizontalOverflow,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    // `document.fonts.check()` answers true when a family is simply absent and
    // the browser falls back, so it cannot tell "Inter loaded" from "Inter
    // missing". The loaded FontFace set can: if the Google Fonts stylesheet
    // never arrived, no Inter @font-face exists at all.
    interFontLoaded: Array.from(document.fonts).some(
      (face) => /Inter/i.test(face.family) && face.status === 'loaded',
    ),
    appFontFamily: getComputedStyle(
      document.querySelector('.font-display') ?? document.body,
    ).fontFamily,
  };
}
/* eslint-enable */

export async function measurePage(page: Page): Promise<PageMeasurements> {
  await ensureColorUtils(page);
  return page.evaluate(collectMeasurements);
}

// ─── Targeted text contrast ───────────────────────────────────────────────────

export interface TextContrastSample {
  /** Trimmed text of the element, for identifying it in a failure message. */
  text: string;
  foreground: string;
  background: string;
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  /** WCAG large text: >=24px, or >=18.66px at weight >=700. */
  isLargeText: boolean;
  /** 3 for large text, 4.5 otherwise. */
  threshold: number;
  passes: boolean;
}

/**
 * Measures the real rendered contrast of every element matching `selector`.
 *
 * Deliberately reads *computed* colours — resolving `oklch()`, compositing the
 * whole background stack, and folding in inherited `opacity` — rather than
 * asserting on class names. The Daily Essentials light-theme regression was a
 * hardcoded dark-palette class that looked perfectly reasonable in the source;
 * only the composited pixel colours revealed it.
 */
export async function measureTextContrast(
  page: Page,
  selector: string,
): Promise<TextContrastSample[]> {
  await ensureColorUtils(page);
  return page.evaluate((sel) => {
    const color = (window as unknown as { __mdfColor: ColorUtils }).__mdfColor;

    const canvasBase = (() => {
      const body = getComputedStyle(document.body).backgroundColor;
      const parsed = color.rgba(body);
      return parsed && parsed[3] >= 0.999 ? body : '#ffffff';
    })();

    const out: TextContrastSample[] = [];

    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;

      // Background stack, front-most first, to the first opaque layer.
      const layers: string[] = [];
      let node: Element | null = el;
      while (node) {
        const raw = getComputedStyle(node).backgroundColor;
        const parsed = color.rgba(raw);
        if (parsed && parsed[3] > 0) {
          layers.push(raw);
          if (parsed[3] >= 0.999) break;
        }
        node = node.parentElement;
      }
      const bg = color.flatten(layers, canvasBase);

      // Inherited opacity fades the text toward its backdrop.
      let opacity = 1;
      let walker: Element | null = el;
      while (walker) {
        const o = Number(getComputedStyle(walker).opacity);
        if (!Number.isNaN(o)) opacity *= o;
        walker = walker.parentElement;
      }

      const solid = color.flatten([cs.color], color.hex(bg));
      const fg: [number, number, number, number] = [
        solid[0] * opacity + bg[0] * (1 - opacity),
        solid[1] * opacity + bg[1] * (1 - opacity),
        solid[2] * opacity + bg[2] * (1 - opacity),
        1,
      ];

      const fontSizePx = parseFloat(cs.fontSize);
      const fontWeight = Number(cs.fontWeight) || 400;
      const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
      const threshold = isLargeText ? 3 : 4.5;
      const ratio = Math.round(color.contrast(fg, bg) * 100) / 100;

      out.push({
        text: text.slice(0, 60),
        foreground: color.hex(fg),
        background: color.hex(bg),
        ratio,
        fontSizePx,
        fontWeight,
        isLargeText,
        threshold,
        passes: ratio >= threshold,
      });
    });

    return out;
  }, selector);
}

// ─── Non-text (boundary) contrast ─────────────────────────────────────────────

export interface BoundaryContrast {
  path: string;
  label: string;
  borderColor: string;
  background: string;
  ratio: number;
  /** WCAG 1.4.11 requires 3:1 for the visual boundary of a control. */
  meets3: boolean;
}

/**
 * Contrast between a control's own border and the surface it sits on.
 *
 * This matters most for the unchecked task checkbox, whose 2px ring is the only
 * thing that distinguishes it from the card behind it.
 */
export async function measureBoundaries(page: Page): Promise<BoundaryContrast[]> {
  await ensureColorUtils(page);
  return page.evaluate(() => {
    const color = (window as unknown as { __mdfColor: ColorUtils }).__mdfColor;
    const out: BoundaryContrast[] = [];

    const stackBehind = (el: Element): string[] => {
      const layers: string[] = [];
      let node: Element | null = el.parentElement;
      while (node) {
        const raw = getComputedStyle(node).backgroundColor;
        const parsed = color.rgba(raw);
        if (parsed && parsed[3] > 0) {
          layers.push(raw);
          if (parsed[3] >= 0.999) break;
        }
        node = node.parentElement;
      }
      return layers;
    };

    document.querySelectorAll<HTMLElement>('main button, main input, nav button').forEach((el) => {
      const cs = getComputedStyle(el);
      const width = parseFloat(cs.borderTopWidth || '0');
      if (width <= 0) return;

      const border = color.rgba(cs.borderTopColor);
      if (!border || border[3] === 0) return;

      const surface = color.flatten(stackBehind(el), '#ffffff');
      const solidBorder = color.flatten([cs.borderTopColor], color.hex(surface));
      const ratio = Math.round(color.contrast(solidBorder, surface) * 100) / 100;

      out.push({
        path: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join('.')}`,
        label:
          el.getAttribute('aria-label') ||
          (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) ||
          '(no accessible name)',
        borderColor: color.hex(solidBorder),
        background: color.hex(surface),
        ratio,
        meets3: ratio >= 3,
      });
    });

    return out;
  });
}

export type { PageMeasurements };

// ─── Keyboard traversal ───────────────────────────────────────────────────────

/**
 * Presses Tab up to `maxSteps` times and records where focus lands each time.
 *
 * Stops early once focus cycles back to a previously visited element, which is
 * how a complete traversal of the page's tab ring is detected.
 *
 * A settle delay is essential rather than cosmetic: several controls carry
 * Tailwind's `transition-all`, which animates `outline-width` too. Reading the
 * computed style immediately after Tab catches the ring at 0px mid-transition
 * and reports a missing focus indicator that is in fact simply still growing.
 */
const FOCUS_SETTLE_MS = 260;

export async function traverseByKeyboard(page: Page, maxSteps = 40): Promise<FocusStep[]> {
  const steps: FocusStep[] = [];
  const seen = new Set<string>();

  await ensureColorUtils(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(FOCUS_SETTLE_MS);

    const step = await page.evaluate((index) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;

      const describe = (node: Element): string => {
        const parts: string[] = [];
        let cur: Element | null = node;
        let depth = 0;
        while (cur && depth < 4) {
          let part = cur.tagName.toLowerCase();
          const cls = (cur.getAttribute('class') || '')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .join('.');
          if (cls) part += `.${cls}`;
          parts.unshift(part);
          cur = cur.parentElement;
          depth++;
        }
        return parts.join(' > ');
      };

      const aria = el.getAttribute('aria-label');
      const label =
        (aria && aria.trim()) || (el.textContent || '').replace(/\s+/g, ' ').trim() || '';

      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();

      const outlineDrawn =
        cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth || '0') > 0;
      const shadowDrawn = cs.boxShadow !== 'none' && cs.boxShadow.trim() !== '';

      // ── Ring-vs-surface contrast (WCAG 1.4.11 / 2.4.11 want >= 3:1) ───────
      const color = (window as unknown as { __mdfColor: ColorUtils }).__mdfColor;

      // The ring is painted just outside the element, so the relevant surface
      // is the nearest opaque background behind the element's parent.
      const surfaceLayers: string[] = [];
      let walker: Element | null = el.parentElement;
      while (walker) {
        const raw = getComputedStyle(walker).backgroundColor;
        const c = color.rgba(raw);
        if (c && c[3] > 0) {
          surfaceLayers.push(raw);
          if (c[3] >= 0.999) break;
        }
        walker = walker.parentElement;
      }
      const surface = color.flatten(surfaceLayers, '#000000');

      let indicatorContrast: number | null = null;
      if (outlineDrawn && color.rgba(cs.outlineColor)) {
        const solid = color.flatten([cs.outlineColor], color.hex(surface));
        indicatorContrast = Math.round(color.contrast(solid, surface) * 100) / 100;
      }

      return {
        index,
        path: describe(el),
        label,
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        rect: {
          x: Math.round(r.x * 100) / 100,
          y: Math.round(r.y * 100) / 100,
          width: Math.round(r.width * 100) / 100,
          height: Math.round(r.height * 100) / 100,
        },
        inViewport:
          r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
        focusVisible: el.matches(':focus-visible'),
        focusStyle: {
          outlineWidth: cs.outlineWidth,
          outlineStyle: cs.outlineStyle,
          outlineColor: cs.outlineColor,
          boxShadow: shadowDrawn ? cs.boxShadow.slice(0, 120) : 'none',
        },
        hasVisibleFocusIndicator: outlineDrawn || shadowDrawn,
        indicatorContrast,
        indicatorBelow3: indicatorContrast !== null && indicatorContrast < 3,
      };
    }, i);

    if (!step) break;

    const fingerprint = `${step.path}|${step.label}|${step.rect.x},${step.rect.y}`;
    if (seen.has(fingerprint)) break;
    seen.add(fingerprint);
    steps.push(step);
  }

  return steps;
}

// ─── Sticky surfaces ──────────────────────────────────────────────────────────

export async function measureSticky(page: Page): Promise<StickyMeasurement> {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero-gradient');
    const stickyBox = hero?.parentElement ?? null;
    const nav = document.querySelector('nav');

    const navRect = nav
      ? nav.getBoundingClientRect()
      : ({ top: 0, bottom: 0, height: 0 } as DOMRect);
    const heroRect = hero
      ? hero.getBoundingClientRect()
      : ({ top: 0, bottom: 0, height: 0 } as DOMRect);

    const cs = stickyBox ? getComputedStyle(stickyBox) : null;
    const main = document.querySelector('main');

    // How far the scrollable content runs underneath the fixed bottom nav.
    let clipped = 0;
    if (main && nav) {
      const mainRect = main.getBoundingClientRect();
      clipped = Math.max(0, Math.round((mainRect.bottom - navRect.top) * 100) / 100);
    }

    return {
      present: !!hero,
      position: cs?.position ?? 'n/a',
      top: cs?.top ?? 'n/a',
      zIndex: cs?.zIndex ?? 'n/a',
      rect: {
        top: Math.round(heroRect.top * 100) / 100,
        bottom: Math.round(heroRect.bottom * 100) / 100,
        height: Math.round(heroRect.height * 100) / 100,
      },
      navRect: {
        top: Math.round(navRect.top * 100) / 100,
        bottom: Math.round(navRect.bottom * 100) / 100,
        height: Math.round(navRect.height * 100) / 100,
      },
      viewportHeight: window.innerHeight,
      contentClippedByNav: clipped,
    };
  });
}
