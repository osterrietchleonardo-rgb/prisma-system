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

const { fontFamily } = loadFont();

export const FPS = 30;
const INTRO = Math.round(2.5 * FPS); //   2.5s
const AMENITIES = Math.round(4 * FPS); // 4.0s
const OUTRO = Math.round(3 * FPS); //     3.0s

export type Spec = { label: string; value: string };
export type TourScene = { src: string; highlight?: string };

// Branding POR CLIENTE (multi-inmobiliaria). El motor no fija una marca:
// cada inmobiliaria pasa sus colores y su logo.
export type Brand = {
  primary: string; // color base (fondo de intro/outro y cortina)
  secondary: string; // color de acento (líneas, chips, precio, pill)
  title: string; // color de textos protagonistas (blanco en fondos oscuros)
  text: string; // color de textos secundarios
  logoUrl: string; // logo del cliente (URL http o archivo en public/)
  legalText: string; // texto legal al pie del outro
};

export type PropertyTourProps = {
  operation: string; // "En Venta" | "En Alquiler"
  title: string; // "Piso en Torre 5 ambientes"
  location: string; // "Belgrano C, CABA"
  price: string; // "USD 945.000"
  specs: Spec[]; // ambientes, m², baños, cocheras…
  amenities: string[]; // badges de la escena de amenities
  scenes: TourScene[]; // fotos del recorrido (+ highlight opcional por foto)
  cta: string; // "Coordiná tu visita privada"
  contact: string; // "@inmobiliaria · WhatsApp"
  secondsPerScene: number; // 2.8
  brand: Brand;
};

const VAKDOR: Brand = {
  primary: "#0A0F1A",
  secondary: "#C07C41",
  title: "#FFFFFF",
  text: "#B4BAC5",
  logoUrl: "logo-vakdor.png",
  legalText:
    "Los valores y datos publicados son de carácter orientativo y no constituyen oferta contractual. Sujeto a disponibilidad.",
};

export const propertyTourDefaults: PropertyTourProps = {
  operation: "En Venta",
  title: "Piso en Torre · 5 ambientes",
  location: "Belgrano C, CABA",
  price: "USD 945.000",
  specs: [
    { label: "Ambientes", value: "5" },
    { label: "Superficie", value: "300 m²" },
    { label: "Baños", value: "5" },
    { label: "Cocheras", value: "2" },
  ],
  amenities: [
    "Pileta",
    "Gimnasio",
    "SUM",
    "Seguridad 24 hs",
    "Loza radiante",
    "Aire central",
    "2 cocheras",
    "Baulera",
  ],
  scenes: [
    "https://picsum.photos/seed/tour1/1080/1920",
    "https://picsum.photos/seed/tour2/1080/1920",
    "https://picsum.photos/seed/tour3/1080/1920",
    "https://picsum.photos/seed/tour4/1080/1920",
    "https://picsum.photos/seed/tour5/1080/1920",
  ].map((src) => ({ src })),
  cta: "Coordiná tu visita privada",
  contact: "@vakdor · WhatsApp",
  secondsPerScene: 2.8,
  brand: VAKDOR,
};

// La duración total se calcula sola: intro + recorrido + amenities + outro.
export const calcTourMetadata: CalculateMetadataFunction<
  PropertyTourProps
> = ({ props }) => {
  const perScene = Math.round((props.secondsPerScene || 2.8) * FPS);
  const nScenes = Math.max(props.scenes.length, 1);
  return {
    durationInFrames: INTRO + perScene * nScenes + AMENITIES + OUTRO,
    fps: FPS,
  };
};

const resolveSrc = (p: string) =>
  /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

// ---------- Helpers de estilo ----------
const glass = (tint: string): React.CSSProperties => ({
  backgroundColor: `${tint}22`,
  backdropFilter: "blur(16px) saturate(140%)",
  WebkitBackdropFilter: "blur(16px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
});

// ---------- Fondo, logo, viñeta ----------
const Backdrop: React.FC<{ brand: Brand }> = ({ brand }) => (
  <AbsoluteFill style={{ backgroundColor: brand.primary }} />
);

const BrandLogo: React.FC<{ brand: Brand; opacity?: number; size?: number }> = ({
  brand,
  opacity = 1,
  size = 92,
}) => (
  <Img
    src={resolveSrc(brand.logoUrl)}
    style={{
      position: "absolute",
      top: 80,
      left: 70,
      width: size,
      height: size,
      objectFit: "contain",
      opacity,
      filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.5))",
    }}
  />
);

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(180deg, rgba(6,10,18,0.60) 0%, rgba(6,10,18,0) 26%, rgba(6,10,18,0) 52%, rgba(6,10,18,0.96) 100%)",
    }}
  />
);

// ---------- INTRO (logo sobre primaryColor) ----------
const Intro: React.FC<{ props: PropertyTourProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = props.brand;
  const appear = spring({ frame, fps, config: { damping: 200 } });
  const lineW = interpolate(appear, [0, 1], [0, 280]);
  const rise = interpolate(appear, [0, 1], [46, 0]);
  const fadeOut = interpolate(frame, [INTRO - 14, INTRO], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        padding: 90,
        justifyContent: "center",
        fontFamily,
      }}
    >
      <BrandLogo brand={b} opacity={appear} />
      <div
        style={{
          color: b.secondary,
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
          backgroundColor: b.secondary,
          margin: "34px 0",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          color: b.title,
          fontSize: 92,
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
          color: b.text,
          fontSize: 46,
          fontWeight: 500,
          marginTop: 26,
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {props.location}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Cortina (revela la primera foto) ----------
const Curtain: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const shift = interpolate(open, [0, 1], [0, 52]); // % que se corre cada mitad
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "50%",
          backgroundColor: brand.primary,
          transform: `translateY(-${shift}%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "50%",
          backgroundColor: brand.primary,
          transform: `translateY(${shift}%)`,
        }}
      />
      {/* filo de acento que acompaña la apertura */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          width: "100%",
          height: 4,
          backgroundColor: brand.secondary,
          opacity: interpolate(open, [0, 0.6, 1], [1, 1, 0]),
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- ESCENA DE FOTO (Ken Burns + highlight + lower third glass) ----------
const PhotoScene: React.FC<{
  scene: TourScene;
  durationInFrames: number;
  title: string;
  price: string;
  index: number;
  total: number;
  brand: Brand;
  curtain?: boolean;
}> = ({ scene, durationInFrames, title, price, index, total, brand, curtain }) => {
  const frame = useCurrentFrame();
  const zoomDir = index % 2 === 0 ? 1 : -1;
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1.08 - 0.07 * zoomDir, 1.08 + 0.07 * zoomDir],
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
  const rise = interpolate(frame, [8, 26], [50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const uiIn = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, fontFamily }}>
      <AbsoluteFill>
        <Img
          src={resolveSrc(scene.src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      </AbsoluteFill>
      <Vignette />

      {/* Progreso del recorrido (arriba a la derecha) */}
      <div
        style={{
          position: "absolute",
          top: 92,
          right: 70,
          display: "flex",
          gap: 10,
          opacity: uiIn,
        }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 34 : 14,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                i === index ? brand.secondary : "rgba(255,255,255,0.45)",
              transition: "all 0.3s",
            }}
          />
        ))}
      </div>

      {/* Highlight (chip glass, arriba a la izquierda) */}
      {scene.highlight ? (
        <div
          style={{
            position: "absolute",
            top: 128,
            left: 70,
            padding: "18px 30px",
            borderRadius: 20,
            ...glass(brand.secondary),
            color: brand.title,
            fontSize: 40,
            fontWeight: 700,
            transform: `translateY(${-rise}px)`,
            opacity: uiIn,
          }}
        >
          {scene.highlight}
        </div>
      ) : null}

      {/* Lower third glass persistente (título + precio) */}
      <div
        style={{
          position: "absolute",
          bottom: 128,
          left: 70,
          right: 70,
          padding: "34px 40px",
          borderRadius: 28,
          ...glass(brand.primary),
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            width: 110,
            height: 6,
            backgroundColor: brand.secondary,
            borderRadius: 3,
            marginBottom: 20,
          }}
        />
        <div
          style={{
            color: brand.title,
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.12,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: brand.secondary,
            fontSize: 62,
            fontWeight: 800,
            marginTop: 10,
          }}
        >
          {price}
        </div>
      </div>

      {curtain ? <Curtain brand={brand} /> : null}
    </AbsoluteFill>
  );
};

// ---------- ESCENA DE AMENITIES (badges pop-in) ----------
const AmenitiesScene: React.FC<{
  props: PropertyTourProps;
  bgSrc: string;
}> = ({ props, bgSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = props.brand;
  const header = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(frame, [0, AMENITIES], [1.05, 1.14], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [AMENITIES - 12, AMENITIES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut, fontFamily }}>
      <AbsoluteFill>
        <Img
          src={resolveSrc(bgSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
            filter: "brightness(0.42) saturate(1.05)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `${b.primary}66` }} />

      <AbsoluteFill
        style={{
          padding: 90,
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            color: b.secondary,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 5,
            textTransform: "uppercase",
            opacity: header,
            transform: `translateY(${interpolate(header, [0, 1], [30, 0])}px)`,
          }}
        >
          Amenities & detalles
        </div>
        <div
          style={{
            color: b.title,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 14,
            marginBottom: 44,
            opacity: header,
            transform: `translateY(${interpolate(header, [0, 1], [30, 0])}px)`,
          }}
        >
          Todo lo que incluye
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
            maxWidth: 900,
          }}
        >
          {props.amenities.map((a, i) => {
            const pop = spring({
              frame: frame - 12 - i * 4,
              fps,
              config: { damping: 14, mass: 0.6 },
            });
            return (
              <div
                key={a}
                style={{
                  padding: "22px 34px",
                  borderRadius: 999,
                  ...glass(b.secondary),
                  color: b.title,
                  fontSize: 40,
                  fontWeight: 700,
                  transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`,
                  opacity: interpolate(pop, [0, 0.6], [0, 1], {
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                {a}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- OUTRO (CTA + precio + contacto + legal) ----------
const Outro: React.FC<{ props: PropertyTourProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = props.brand;
  const appear = spring({ frame, fps, config: { damping: 200 } });
  const rise = interpolate(appear, [0, 1], [50, 0]);
  const pill = spring({ frame: frame - 10, fps, config: { damping: 180 } });
  const legal = interpolate(frame, [OUTRO - 26, OUTRO - 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
      <BrandLogo brand={b} opacity={appear} size={100} />
      <div
        style={{
          width: interpolate(appear, [0, 1], [0, 220]),
          height: 8,
          backgroundColor: b.secondary,
          borderRadius: 4,
          marginBottom: 40,
        }}
      />
      <div
        style={{
          color: b.title,
          fontSize: 78,
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
          color: b.text,
          fontSize: 50,
          fontWeight: 700,
          marginTop: 22,
          opacity: appear,
        }}
      >
        {props.price}
      </div>
      <div
        style={{
          marginTop: 52,
          backgroundColor: b.secondary,
          color: b.title,
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

      {/* Texto legal al pie */}
      <div
        style={{
          position: "absolute",
          bottom: 70,
          left: 90,
          right: 90,
          color: b.text,
          fontSize: 22,
          lineHeight: 1.35,
          opacity: legal * 0.75,
        }}
      >
        {b.legalText}
      </div>
    </AbsoluteFill>
  );
};

// ---------- COMPOSICIÓN PRINCIPAL ----------
export const PropertyTour: React.FC<PropertyTourProps> = (props) => {
  const perScene = Math.round((props.secondsPerScene || 2.8) * FPS);
  const scenes = props.scenes.length ? props.scenes : propertyTourDefaults.scenes;
  const brand = props.brand || VAKDOR;
  const amenitiesBg = scenes[scenes.length - 1]?.src || scenes[0].src;

  return (
    <AbsoluteFill>
      <Backdrop brand={brand} />

      <Sequence durationInFrames={INTRO} name="Intro">
        <Intro props={{ ...props, brand }} />
      </Sequence>

      {scenes.map((scene, i) => (
        <Sequence
          key={`${scene.src}-${i}`}
          from={INTRO + perScene * i}
          durationInFrames={perScene}
          name={`Escena ${i + 1}`}
        >
          <PhotoScene
            scene={scene}
            durationInFrames={perScene}
            title={props.title}
            price={props.price}
            index={i}
            total={scenes.length}
            brand={brand}
            curtain={i === 0}
          />
        </Sequence>
      ))}

      <Sequence
        from={INTRO + perScene * scenes.length}
        durationInFrames={AMENITIES}
        name="Amenities"
      >
        <AmenitiesScene props={{ ...props, brand }} bgSrc={amenitiesBg} />
      </Sequence>

      <Sequence
        from={INTRO + perScene * scenes.length + AMENITIES}
        durationInFrames={OUTRO}
        name="Outro"
      >
        <Outro props={{ ...props, brand }} />
      </Sequence>
    </AbsoluteFill>
  );
};
