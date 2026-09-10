import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Signed links can be missing — the object was removed, or signing failed.
 * next/image throws on an empty src, so the fallback is rendered instead.
 */
export function GarmentImage({
  src,
  alt,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex size-full items-center justify-center bg-muted",
          className,
        )}
      >
        <ImageOff className="size-5 text-muted-foreground" />
        <span className="sr-only">{alt} — image unavailable</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
      unoptimized
      loading="lazy"
      decoding="async"
    />
  );
}
