"use client";

import { useState } from "react";

export default function FichaGallery({ images, title, accent }: { images: string[]; title: string; accent: string }) {
  const [active, setActive] = useState(0);
  const safe = images && images.length > 0 ? images : [];
  if (safe.length === 0) {
    return (
      <div className="w-full aspect-[16/10] rounded-2xl bg-neutral-200 flex items-center justify-center text-neutral-400">
        Sin fotos disponibles
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-100 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safe[active]} alt={title} className="w-full h-full object-cover" />
      </div>
      {safe.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {safe.slice(0, 12).map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all"
              style={{ borderColor: i === active ? accent : "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`${title} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
