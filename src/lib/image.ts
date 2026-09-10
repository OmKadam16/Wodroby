"use client";

export const STORAGE_MAX_EDGE = 640;
export const STORAGE_QUALITY_AVIF = 0.45;
export const STORAGE_QUALITY_WEBP = 0.55;
export const STORAGE_QUALITY_JPEG = 0.6;

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  if (blob && blob.type === type) return blob;
  return null;
}

export async function toCompressedFile(
  file: File,
  maxEdge = STORAGE_MAX_EDGE,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  if (
    scale === 1 &&
    (file.type === "image/avif" || file.type === "image/webp") &&
    file.size < 180 * 1024
  ) {
    bitmap.close();
    return file;
  }
  if (scale === 1 && file.type === "image/jpeg" && file.size < 180 * 1024) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser cannot process the image.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const name = file.name.replace(/\.[^.]+$/, "") || "garment";

  const avifBlob = await canvasToBlob(
    canvas,
    "image/avif",
    STORAGE_QUALITY_AVIF,
  );
  if (avifBlob) {
    return new File([avifBlob], `${name}.avif`, { type: "image/avif" });
  }

  const webpBlob = await canvasToBlob(
    canvas,
    "image/webp",
    STORAGE_QUALITY_WEBP,
  );
  if (webpBlob) {
    return new File([webpBlob], `${name}.webp`, { type: "image/webp" });
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", STORAGE_QUALITY_JPEG),
  );
  if (!jpegBlob) throw new Error("Failed to compress image.");

  return new File([jpegBlob], `${name}.jpg`, { type: "image/jpeg" });
}
