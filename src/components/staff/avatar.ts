/**
 * Staff photographs, made small enough to live in a text column.
 *
 * `profiles.avatar_url` is TEXT, so a photo is stored as a data URL. A phone
 * camera produces three or four megabytes of it, which would be read back on
 * every load of the register — so the image is cropped square and reduced to
 * 256px before it ever leaves the browser.
 */
const MAX_EDGE = 256;
const QUALITY = 0.82;

export const readAvatarFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be read."));
      image.onload = () => {
        // Centre-crop to a square first: an off-centre face inside a circular
        // avatar is worse than a slightly tighter portrait.
        const edge = Math.min(image.width, image.height);
        const sx = (image.width - edge) / 2;
        const sy = (image.height - edge) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = MAX_EDGE;
        canvas.height = MAX_EDGE;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(reader.result as string);
          return;
        }
        context.drawImage(image, sx, sy, edge, edge, 0, 0, MAX_EDGE, MAX_EDGE);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
