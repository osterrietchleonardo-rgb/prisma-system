"use client";

import { useState } from "react";

// Galería de una propiedad. La foto es grande y las flechas miden 44px: esto se abre en el
// celular del cliente, desde WhatsApp, y ahí no hay hover que valga.
export default function GaleriaPropiedad({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;

  const ir = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div className="relative w-full overflow-hidden bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={alt} className="aspect-[4/3] w-full object-cover" />

      {images.length > 1 && (
        <>
          <button
            onClick={() => ir(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl leading-none text-white"
          >
            ‹
          </button>
          <button
            onClick={() => ir(1)}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl leading-none text-white"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white">
            {idx + 1}/{images.length}
          </div>
        </>
      )}
    </div>
  );
}
