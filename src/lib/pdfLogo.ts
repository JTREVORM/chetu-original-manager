/**
 * Rasterizes public/logo.svg to a PNG data URL so jsPDF (which cannot embed
 * SVG directly) can print the actual brand mark instead of typed text.
 * Fetched once and cached; any failure yields `null` so a missing/broken
 * logo can never stop a document from generating.
 */
export interface PdfLogo {
  dataUrl: string;
  /** Intrinsic width/height in px, from the SVG's own width/height — used to keep the aspect ratio when placing the image. */
  width: number;
  height: number;
}

let logoPromise: Promise<PdfLogo | null> | null = null;

export function loadPdfLogo(): Promise<PdfLogo | null> {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width || 300;
          const height = img.naturalHeight || img.height || 100;
          // Oversample for crisp print output at whatever mm size the PDF places it.
          const scale = 3;
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/logo.svg';
    } catch {
      resolve(null);
    }
  });
  return logoPromise;
}
