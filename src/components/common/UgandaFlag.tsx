import React, { useState } from 'react';

/**
 * The Uganda flag.
 *
 * Prefers the photographic flag at `public/uganda-flag.jpg`. If that file is
 * not present the inline SVG below is drawn instead, so the header never shows
 * a broken image — an earlier version pointed at the old hosting platform's CDN
 * and did exactly that.
 *
 * To use the photo, save it as `public/uganda-flag.jpg`; nothing else needs to
 * change.
 */
const FLAG_SRC = '/uganda-flag.jpg';

export const UgandaFlag: React.FC<{ className?: string }> = ({ className }) => {
  const [usePhoto, setUsePhoto] = useState(true);

  if (usePhoto) {
    return (
      <img
        src={FLAG_SRC}
        alt=""
        role="presentation"
        // object-cover keeps the flag's proportions inside the header's small
        // box rather than squashing the bands.
        className={`object-cover ${className || ''}`}
        onError={() => setUsePhoto(false)}
      />
    );
  }

  // Fallback: six bands, black / yellow / red repeated, with the white disc.
  // The crested crane is omitted — at header size it would be a smudge.
  return (
    <svg viewBox="0 0 36 24" className={className} role="presentation" focusable="false" preserveAspectRatio="none">
      <rect width="36" height="4" y="0" fill="#000000" />
      <rect width="36" height="4" y="4" fill="#FCDC04" />
      <rect width="36" height="4" y="8" fill="#D90000" />
      <rect width="36" height="4" y="12" fill="#000000" />
      <rect width="36" height="4" y="16" fill="#FCDC04" />
      <rect width="36" height="4" y="20" fill="#D90000" />
      <circle cx="18" cy="12" r="5" fill="#FFFFFF" />
    </svg>
  );
};
