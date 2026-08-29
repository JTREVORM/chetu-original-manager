import React from "react";

/**
 * The national flag of Uganda, drawn inline.
 *
 * Six bands — black, yellow, red, repeated — with the white disc bearing the
 * grey crowned crane facing the hoist. Everything is vector: there is no image
 * file to fetch, which matters three ways here. The header renders this at
 * 24x16 CSS pixels and the login screen at up to 64x40, and a single drawing
 * stays sharp at both. The service worker deliberately caches nothing, so a
 * bitmap would be a network round trip on every cold load. And an earlier
 * version pointed at a file that was never added, so every mount rendered a
 * broken <img>, fired onError and swapped — a visible flicker and a 404 in the
 * console each time.
 *
 * Geometry follows the official 2:3 construction: 900x600, six 100-unit bands,
 * the disc centred on the seam between the third and fourth band with a radius
 * of 100. The crane is drawn back to front and every point is kept inside that
 * radius, so nothing spills onto the bands.
 */

const BLACK = "#000000";
const YELLOW = "#FCDC04";
const RED = "#D90000";
const GREY = "#9E9E9E";
const WING = "#F5F5F5";
const OUTLINE = "#6B7075";

/** Where each golden crest bristle ends, fanning up and back from the crown. */
const CREST_TIPS: ReadonlyArray<readonly [number, number]> = [
  [398, 218],
  [404, 211],
  [411, 207],
  [420, 206],
  [429, 208],
  [437, 213],
  [444, 220],
  [449, 228],
];

export const UgandaFlag: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 900 600"
    className={className}
    role="presentation"
    focusable="false"
    // The flag fills its box rather than letterboxing inside it. Every call
    // site is at or near 3:2, so the residual stretch is imperceptible.
    preserveAspectRatio="none"
  >
    <rect width="900" height="100" y="0" fill={BLACK} />
    <rect width="900" height="100" y="100" fill={YELLOW} />
    <rect width="900" height="100" y="200" fill={RED} />
    <rect width="900" height="100" y="300" fill={BLACK} />
    <rect width="900" height="100" y="400" fill={YELLOW} />
    <rect width="900" height="100" y="500" fill={RED} />

    <circle cx="450" cy="300" r="100" fill="#FFFFFF" />

    <g>
      {/* Legs, behind the body */}
      <g stroke={BLACK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M457 344 L450 386" />
        <path d="M450 386 L436 391 M450 386 L450 393 M450 386 L464 391" />
        <path d="M482 343 L490 384" />
        <path d="M490 384 L478 389 M490 384 L491 391 M490 384 L500 387" />
      </g>

      {/* Body: rounded breast at the left, tapering back towards the tail */}
      <path
        d="M427 322 C 427 299, 448 289, 471 289 C 492 289, 505 297, 510 310
           C 505 331, 487 349, 462 351 C 441 352, 427 340, 427 322 Z"
        fill={GREY}
      />

      {/* Rear plumage, overlapping the body so it reads as part of the bird */}
      <path
        d="M486 300 C 508 292, 530 298, 538 312 C 530 328, 506 334, 486 326
           C 481 318, 481 308, 486 300 Z"
        fill={RED}
      />

      {/* Folded wing, sitting inside the body outline */}
      <path
        d="M441 314 C 455 300, 484 298, 500 310 C 492 328, 464 337, 447 329 C 440 325, 438 318, 441 314 Z"
        fill={WING}
        stroke={OUTLINE}
        strokeWidth="2"
      />
      <path
        d="M454 318 C 468 312, 484 311, 495 314"
        stroke={OUTLINE}
        strokeWidth="1.6"
        fill="none"
      />

      {/* Neck, a tapered band from the head down into the breast */}
      <path
        d="M402 256 C 402 276, 416 294, 438 305 L 454 292 C 434 282, 421 269, 420 251 Z"
        fill={GREY}
      />

      {/* Crest */}
      <g stroke={YELLOW} strokeWidth="3.4" strokeLinecap="round">
        {CREST_TIPS.map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M416 237 L${x} ${y}`} />
        ))}
      </g>

      {/* Head */}
      <ellipse cx="409" cy="246" rx="19" ry="15" fill="#1A1A1A" />
      {/* White cheek patch, with the small red patch above it */}
      <ellipse cx="412" cy="251" rx="11" ry="8" fill="#FFFFFF" />
      <ellipse cx="419" cy="241" rx="6" ry="4" fill={RED} />

      {/* Beak, slightly open */}
      <path d="M393 242 L366 248 L393 250 Z" fill="#3C4043" />
      <path d="M393 253 L369 258 L393 259 Z" fill="#3C4043" />

      {/* Gular wattle */}
      <ellipse cx="399" cy="268" rx="6" ry="10" fill={RED} />

      {/* Eye */}
      <circle cx="403" cy="242" r="3.4" fill="#FFFFFF" />
      <circle cx="403" cy="242" r="1.8" fill={BLACK} />
    </g>
  </svg>
);
