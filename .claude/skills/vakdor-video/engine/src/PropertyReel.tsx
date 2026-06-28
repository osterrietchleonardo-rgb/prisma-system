import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Easing,
  CalculateMetadataFunction,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { BRAND } from "./brand";

const { fontFamily } = loadFont();

export const FPS = 30;
const INTRO = Math.round(2 * FPS); //  2.0s
const OUTRO = Math.round(2.5 * FPS); // 2.5s

export type Spec = { label: string; value: string };

export type PropertyReelProps = {
  operation: string; // "En Venta" | "En Alquiler"
  title: string; // "Departamento 3 ambientes"
  location: string; // "Belgrano, CABA"
  price: string; // "USD 185.000"
  specs: Spec[]; // [{label:"Ambientes", value:"3"}, ...]
  photos: string[]; // "current/1.jpg" (en public/) o URL http
  cta: string; // "Coordiná tu visita hoy"
  contact: string; // "@vakdor · wa.me/549..."
  secondsPerPhoto: number; // 2.5
};

export const propertyReelDefaults: PropertyReelProps = {
  operation: "En Venta",
  title: "Departamento 3 ambientes",
  location: "Belgrano, CABA",
  price: "USD 185.000",
  specs: [
    { label: "Ambientes", value: "3" },
    { label: "Superficie", value: "78 m²" },
    { label: "Baños", value: "2" },
    { label: "Cochera", value: "Sí" },
  ],
  photos: [
    "https://picsum.photos/seed/prisma1/1080/1920",
    "https://picsum.photos/seed/prisma2/1080/1920",
    "https://picsum.photos/seed/prisma3/1080/1920",
    "https://picsum.photos/seed/prisma4/1080/1920",
  ],
  cta: "Coordiná tu visita hoy",
  contact: "@vakdor · WhatsApp",
  secondsPerPhoto: 2.5,
};

// La duracion total se calcula segun cuantas fotos haya.
export const calcReelMetadata: CalculateMetadataFunction<
  PropertyReelProps
> = ({ props }) => {
  const perPhoto = Math.round((props.secondsPerPhoto || 2.5) * FPS);
  const nPhotos = Math.max(props.photos.length, 1);
  return {
    durationInFrames: INTRO + perPhoto * nPhotos + OUTRO,
    fps: FPS,
  };
};

const resolveSrc = (p: string) =>
  /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

// ---------- Fondo y atmosfera ----------
const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: BRAND.background }} />
);

const Logos: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <>
    <Img
      src={staticFile("logo-vakdor.png")}
      style={{
        position: "absolute",
        top: 80,
        left: 70,
        width: 96,
        height: 96,
        objectFit: "contain",
        opacity,
      }}
    />
    <Img
      src={staticFile("logo-icon.png")}
      style={{
        position: "absolute",
        top: 80,
        right: 70,
        width: 96,
        height: 96,
        objectFit: "contain",
        opacity,
      }}
    />
  </>
);

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(180deg, rgba(10,15,26,0.55) 0%, rgba(10,15,26,0) 28%, rgba(10,15,26,0) 55%, rgba(10,15,26,0.95) 100%)",
    }}
  />
);

// ---------- INTRO ----------
const Intro: React.FC<{ props: PropertyReelProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame, fps, config: { damping: 200 } });
  const lineW = interpolate(appear, [0, 1], [0, 260]);
  const fadeOut = interpolate(frame, [INTRO - 12, INTRO], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(appear, [0, 1], [40, 0]);

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        padding: 90,
        justifyContent: "center",
        fontFamily,
      }}
    >
      <Logos opacity={appear} />
      <div
        style={{
          color: BRAND.accent,
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {props.operation}
      </div>
      <div
        style={{
          width: lineW,
          height: 8,
          backgroundColor: BRAND.accent,
          margin: "34px 0",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          color: BRAND.title,
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1.05,
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {props.title}
      </div>
      <div
        style={{
          color: BRAND.text,
          fontSize: 48,
          fontWeight: 500,
          marginTop: 28,
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {props.location}
      </div>
    </AbsoluteFill>
  );
};

// ---------- CLIP DE FOTO (Ken Burns + lower third) ----------
const PhotoClip: React.FC<{
  src: string;
  durationInFrames: number;
  spec?: Spec;
  title: string;
  price: string;
  index: number;
}> = ({ src, durationInFrames, spec, title, price, index }) => {
  const frame = useCurrentFrame();
  const zoomDir = index % 2 === 0 ? 1 : -1;
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1.06 - 0.06 * zoomDir, 1.06 + 0.06 * zoomDir],
    { extrapolateRight: "clamp" }
  );
  const fadeIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const barRise = interpolate(frame, [10, 28], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill>
        <Img
          src={resolveSrc(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      </AbsoluteFill>
      <Vignette />

      {/* Spec chip arriba */}
      {spec ? (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 70,
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            fontFamily,
            transform: `translateY(${-barRise}px)`,
            opacity: interpolate(frame, [10, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span
            style={{ color: BRAND.accent, fontSize: 84, fontWeight: 800 }}
          >
            {spec.value}
          </span>
          <span style={{ color: BRAND.title, fontSize: 40, fontWeight: 600 }}>
            {spec.label}
          </span>
        </div>
      ) : null}

      {/* Lower third persistente */}
      <div
        style={{
          position: "absolute",
          bottom: 130,
          left: 70,
          right: 70,
          fontFamily,
          transform: `translateY(${barRise}px)`,
        }}
      >
        <div
          style={{
            width: 120,
            height: 6,
            backgroundColor: BRAND.accent,
            borderRadius: 3,
            marginBottom: 22,
          }}
        />
        <div
          style={{
            color: BRAND.title,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: BRAND.accent,
            fontSize: 64,
            fontWeight: 800,
            marginTop: 10,
          }}
        >
          {price}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- OUTRO (CTA) ----------
const Outro: React.FC<{ props: PropertyReelProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame, fps, config: { damping: 200 } });
  const rise = interpolate(appear, [0, 1], [50, 0]);
  const pill = spring({ frame: frame - 8, fps, config: { damping: 180 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 90,
        textAlign: "center",
        fontFamily,
      }}
    >
      <Logos opacity={appear} />
      <div
        style={{
          width: interpolate(appear, [0, 1], [0, 200]),
          height: 8,
          backgroundColor: BRAND.accent,
          borderRadius: 4,
          marginBottom: 40,
        }}
      />
      <div
        style={{
          color: BRAND.title,
          fontSize: 80,
          fontWeight: 800,
          lineHeight: 1.1,
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {props.cta}
      </div>
      <div
        style={{
          color: BRAND.text,
          fontSize: 52,
          fontWeight: 700,
          marginTop: 24,
          opacity: appear,
        }}
      >
        {props.price}
      </div>
      <div
        style={{
          marginTop: 56,
          backgroundColor: BRAND.accent,
          color: BRAND.title,
          fontSize: 44,
          fontWeight: 700,
          padding: "30px 64px",
          borderRadius: 999,
          transform: `scale(${interpolate(pill, [0, 1], [0.8, 1])})`,
          opacity: pill,
        }}
      >
        {props.contact}
      </div>
    </AbsoluteFill>
  );
};

// ---------- COMPOSICION PRINCIPAL ----------
export const PropertyReel: React.FC<PropertyReelProps> = (props) => {
  const perPhoto = Math.round((props.secondsPerPhoto || 2.5) * FPS);
  const photos = props.photos.length ? props.photos : propertyReelDefaults.photos;
  const specs = props.specs.length ? props.specs : [];

  return (
    <AbsoluteFill>
      <Backdrop />

      <Sequence durationInFrames={INTRO} name="Intro">
        <Intro props={props} />
      </Sequence>

      {photos.map((photo, i) => (
        <Sequence
          key={`${photo}-${i}`}
          from={INTRO + perPhoto * i}
          durationInFrames={perPhoto}
          name={`Foto ${i + 1}`}
        >
          <PhotoClip
            src={photo}
            durationInFrames={perPhoto}
            spec={specs.length ? specs[i % specs.length] : undefined}
            title={props.title}
            price={props.price}
            index={i}
          />
        </Sequence>
      ))}

      <Sequence
        from={INTRO + perPhoto * photos.length}
        durationInFrames={OUTRO}
        name="Outro"
      >
        <Outro props={props} />
      </Sequence>
    </AbsoluteFill>
  );
};
