import React from 'react';

/**
 * The Uganda flag, drawn inline.
 *
 * This used to be an <img> pointing at an asset on the old hosting platform's
 * CDN, which does not exist for this project — it rendered as a broken image in
 * the header. Inlining it removes the network dependency entirely.
 *
 * Six bands, black / yellow / red repeated, with the white disc at the centre.
 * The crested crane inside the disc is omitted deliberately: at the 24×16 the
 * header uses, it would be an illegible smudge.
 */
export const UgandaFlag: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 36 24"
    className={className}
    role="presentation"
    focusable="false"
    preserveAspectRatio="none"
  >
    <rect width="36" height="4" y="0" fill="#000000" />
    <rect width="36" height="4" y="4" fill="#FCDC04" />
    <rect width="36" height="4" y="8" fill="#D90000" />
    <rect width="36" height="4" y="12" fill="#000000" />
    <rect width="36" height="4" y="16" fill="#FCDC04" />
    <rect width="36" height="4" y="20" fill="#D90000" />
    <circle cx="18" cy="12" r="5" fill="#FFFFFF" />
  </svg>
);
