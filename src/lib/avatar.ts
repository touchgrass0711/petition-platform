import imageCompression from "browser-image-compression";
import { TINY_AVATAR_MAX_BYTES, TINY_AVATAR_PX } from "@/lib/tiny-avatar";

/** Shrinks a photo to a tiny WebP data URL that is stored on the comment itself (no Storage bucket). */
export async function tinyAvatar(file: File): Promise<string> {
  const small = await imageCompression(file, {
    maxSizeMB: (TINY_AVATAR_MAX_BYTES * 0.9) / 1024 / 1024,
    maxWidthOrHeight: TINY_AVATAR_PX,
    fileType: "image/webp",
    useWebWorker: true,
  });
  return imageCompression.getDataUrlFromFile(small);
}
