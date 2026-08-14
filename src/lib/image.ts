/**
 * Cover images are normalised in the browser before they are uploaded.
 *
 * Photos straight off an iPhone are HEIC, which Chrome and Firefox cannot
 * decode and Next's image optimizer passes through untouched — the cover
 * lands in the page as a broken image. Decoding here also lets a 4-megapixel
 * photo be cut down to something sensible for a thumbnail.
 */

/** Covers are never shown larger than a card, so this is plenty. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
/** Below this an already-web-safe image is left exactly as it was picked. */
const PASSTHROUGH_MAX_BYTES = 2 * 1024 * 1024;

export class CoverImageError extends Error {}

export async function prepareCoverImage(file: File): Promise<File> {
  const heic = await isHeic(file);

  if (!heic) {
    // Animated GIFs would come back as a single frame, so they go up untouched.
    if (file.type === "image/gif") return file;
    if (file.size <= PASSTHROUGH_MAX_BYTES) return file;
  }

  const source = heic ? await decodeHeic(file) : file;

  try {
    return await reencode(source, file.name, heic);
  } catch (err) {
    // A photo that only needed shrinking is still perfectly displayable.
    if (!heic) return file;
    throw err instanceof CoverImageError ? err : new CoverImageError(String(err));
  }
}

/** Sniffs the ISO-BMFF brand rather than trusting the extension or MIME type. */
async function isHeic(file: File): Promise<boolean> {
  const { isHeic: check } = await import("heic-to");
  try {
    return await check(file);
  } catch {
    return false;
  }
}

async function decodeHeic(file: File): Promise<Blob> {
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "image/jpeg", quality: JPEG_QUALITY });
  } catch {
    throw new CoverImageError(
      "Couldn't read that HEIC photo. Save it as a JPEG or PNG and try again.",
    );
  }
}

/** Draws the image at cover size and re-encodes it as JPEG. */
async function reencode(source: Blob, originalName: string, wasHeic: boolean): Promise<File> {
  const bitmap = await createBitmap(source);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new CoverImageError("This browser wouldn't let us resize the image.");
  // Transparent corners would otherwise come out black once it's a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new CoverImageError("Couldn't convert that image.");

  // A HEIC already re-encoded to a small JPEG can be worse off after a second
  // pass — but never for a shrunk photo, which is the case that matters.
  if (wasHeic && blob.size > source.size && scale === 1) {
    return toFile(source, originalName);
  }
  return toFile(blob, originalName);
}

async function createBitmap(source: Blob): Promise<ImageBitmap> {
  try {
    // Without this, a photo taken sideways is uploaded sideways.
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(source);
  }
}

function toFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, "") || "cover";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
