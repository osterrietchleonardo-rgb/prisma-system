import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  CalculateMetadataFunction,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import {
  createTikTokStyleCaptions,
  type Caption,
} from "@remotion/captions";
import { BRAND } from "./brand";

const { fontFamily } = loadFont();

export const EDIT_FPS = 30;
const INTRO = Math.round(1.2 * EDIT_FPS); // 1.2s
const OUTRO = Math.round(1.5 * EDIT_FPS); // 1.5s

export type Segment = { from: number; to: number }; // segundos en el video crudo a CONSERVAR

export type EditedReelProps = {
  videoSrc: string; // "current/raw.mp4" en public o URL http
  segments: Segment[]; // tramos buenos (jump cuts). Vacio = todo el video.
  captions: Caption[] | null; // subtitulos ya re-mapeados a la linea de tiempo editada
  showSubtitles: boolean;
  watermark: boolean;
  brandIntro: boolean;
  brandOutro: boolean;
  title: string; // para intro/outro
  contact: string; // para outro (CTA)
};

export const editedReelDefaults: EditedReelProps = {
  videoSrc: "current/raw.mp4",
  segments: [],
  captions: null,
  showSubtitles: true,
  watermark: true,
  brandIntro: true,
  brandOutro: true,
  title: "Vakdor · PRISMA",
  contact: "@vakdor · WhatsApp",
};

const secToFrames = (s: number) => Math.round(s * EDIT_FPS);

const totalSegmentFrames = (segments: Segment[]) =>
  segments.reduce((acc, s) => acc + secToFrames(Math.max(s.to - s.from, 0)), 0);

export const calcEditedMetadata: CalculateMetadataFunction<
  EditedReelProps
> = ({ props }) => {
  const segFrames = props.segments.length
    ? totalSegmentFrames(props.segments)
    : secToFrames(60); // fallback si no hay segmentos (se ajusta con duracion real al renderizar)
  const intro = props.brandIntro ? INTRO : 0;
  const outro = props.brandOutro ? OUTRO : 0;
  return {
    durationInFrames: intro + segFrames + outro,
    fps: EDIT_FPS,
  };
};

const resolveSrc = (p: string) =>
  /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

// ---------- Marca de agua (logos discretos) ----------
const Watermark: React.FC = () => (
  <>
    <Img
      src={staticFile("logo-vakdor.png")}
      style={{
        position: "absolute",
        top: 60,
        left: 50,
        width: 72,
        height: 72,
        objectFit: "contain",
        opacity: 0.92,
      }}
    />
    <Img
      src={staticFile("logo-icon.png")}
      style={{
        position: "absolute",
        top: 60,
        right: 50,
        width: 72,
        height: 72,
        objectFit: "contain",
        opacity: 0.92,
      }}
    />
  </>
);

// ---------- Subtitulos estilo TikTok ----------
const Subtitles: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 1200,
  });

  const page = pages.find(
    (p) => nowMs >= p.startMs && nowMs < p.startMs + p.durationMs
  );
  if (!page) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 360,
        left: 60,
        right: 60,
        textAlign: "center",
        fontFamily,
        fontSize: 70,
        fontWeight: 800,
        lineHeight: 1.2,
        textShadow: "0 4px 24px rgba(0,0,0,0.85)",
      }}
    >
      {page.tokens.map((t, i) => {
        const active = nowMs >= t.fromMs && nowMs < t.toMs;
        return (
          <span
            key={i}
            style={{
              color: active ? BRAND.accent : BRAND.title,
              marginRight: 14,
              display: "inline-block",
            }}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
};

// ---------- Intro / Outro de marca ----------
const BrandCard: React.FC<{ line1: string; line2?: string; pill?: string }> = ({
  line1,
  line2,
  pill,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame, fps, config: { damping: 200 } });
  const rise = interpolate(appear, [0, 1], [40, 0]);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.background,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 90,
        fontFamily,
      }}
    >
      <Img
        src={staticFile("logo-vakdor.png")}
        style={{ width: 150, height: 150, objectFit: "contain", opacity: appear }}
      />
      <div
        style={{
          width: interpolate(appear, [0, 1], [0, 200]),
          height: 7,
          backgroundColor: BRAND.accent,
          borderRadius: 4,
          margin: "40px 0",
        }}
      />
      <div
        style={{
          color: BRAND.title,
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.1,
          transform: `translateY(${rise}px)`,
          opacity: appear,
        }}
      >
        {line1}
      </div>
      {line2 ? (
        <div
          style={{ color: BRAND.text, fontSize: 44, fontWeight: 600, marginTop: 20, opacity: appear }}
        >
          {line2}
        </div>
      ) : null}
      {pill ? (
        <div
          style={{
            marginTop: 48,
            backgroundColor: BRAND.accent,
            color: BRAND.title,
            fontSize: 40,
            fontWeight: 700,
            padding: "26px 56px",
            borderRadius: 999,
            opacity: appear,
          }}
        >
          {pill}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- Composicion principal del EDITOR ----------
export const EditedReel: React.FC<EditedReelProps> = (props) => {
  const segments = props.segments.length
    ? props.segments
    : [{ from: 0, to: 60 }];
  const introFrames = props.brandIntro ? INTRO : 0;

  let cursor = introFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {props.brandIntro ? (
        <Sequence durationInFrames={INTRO} name="Intro">
          <BrandCard line1={props.title} line2="" />
        </Sequence>
      ) : null}

      {segments.map((seg, i) => {
        const dur = secToFrames(Math.max(seg.to - seg.from, 0));
        const start = cursor;
        cursor += dur;
        return (
          <Sequence
            key={`seg-${i}`}
            from={start}
            durationInFrames={dur}
            name={`Tramo ${i + 1}`}
          >
            <AbsoluteFill>
              <OffthreadVideo
                src={resolveSrc(props.videoSrc)}
                trimBefore={secToFrames(seg.from)}
                trimAfter={secToFrames(seg.to)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Capa de marca + subtitulos sobre todos los tramos */}
      <Sequence from={introFrames} name="Overlays">
        {props.watermark ? <Watermark /> : null}
        {props.showSubtitles && props.captions ? (
          <Subtitles captions={props.captions} />
        ) : null}
      </Sequence>

      {props.brandOutro ? (
        <Sequence from={cursor} durationInFrames={OUTRO} name="Outro">
          <BrandCard line1="¿Te interesa?" pill={props.contact} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
