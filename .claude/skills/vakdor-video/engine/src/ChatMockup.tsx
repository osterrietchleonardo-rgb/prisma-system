import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  CalculateMetadataFunction,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { BRAND } from "./brand";

const { fontFamily } = loadFont();

export const CHAT_FPS = 30;

// ---------- Tipos ----------

export type ChatMessage = {
  from: "them" | "me"; // "them" = el cliente, "me" = la inmobiliaria
  text: string; // usar \n para forzar un salto de linea
  time: string; // "10:42"
  typing?: number; // segundos de "escribiendo..." antes del mensaje (solo "them")
  delay?: number; // segundos de espera antes de que arranque este mensaje
  read?: boolean; // doble tilde azul (solo "me")
  divider?: string; // chip centrado antes del mensaje: "2 horas después", "Hoy"
};

export type ChatMockupProps = {
  contactName: string;
  contactStatus: string;
  messages: ChatMessage[];
  showLogo: boolean;
};

export const chatMockupDefaults: ChatMockupProps = {
  contactName: "Cliente",
  contactStatus: "en línea",
  messages: [
    { from: "them", text: "Hola, ¿sigue disponible el depto?", time: "21:14", typing: 1.1 },
    { from: "them", text: "Quería coordinar una visita", time: "21:15", typing: 1.3 },
    {
      from: "them",
      text: "¿Hay alguien ahí?",
      time: "23:47",
      typing: 1.6,
      delay: 1.2,
      divider: "2 horas después",
    },
  ],
  showLogo: true,
};

// ---------- Medidas del cuadro (1080x1920) ----------

const W = 1080;
const H = 1920;

const PHONE_X = 100;
const PHONE_Y = 245;
const PHONE_W = 880;
const PHONE_H = 1180;
const PHONE_RADIUS = 56;

const HEADER_H = 150;
const INPUT_H = 130;
const CHAT_PAD_X = 34;
const CHAT_PAD_Y = 28;
const CHAT_H = PHONE_H - HEADER_H - INPUT_H;

// Burbujas
const BUBBLE_MAX_W = 620;
const BUBBLE_PAD_X = 30;
const BUBBLE_PAD_Y = 26;
const FONT_SIZE = 38;
const LINE_H = 50;
const META_H = 30; // la linea de la hora dentro de la burbuja
const GAP = 20;
const TYPING_H = 92;
const DIVIDER_H = 64;

// Ancho util de texto -> cuantos caracteres entran por renglon.
// Inter a 38px promedia ~0.52em por caracter.
const CHARS_PER_LINE = Math.floor((BUBBLE_MAX_W - BUBBLE_PAD_X * 2) / (FONT_SIZE * 0.52));

// Colores del chat, derivados de la marca (no son los de WhatsApp: son los de Vakdor)
const SURFACE = "#111826"; // el "papel" del chat
const BUBBLE_THEM = "#1E2637";
const BUBBLE_ME = BRAND.accent;
const HEADER_BG = "#151D2C";
const HAIRLINE = "rgba(255,255,255,0.07)";

// ---------- Cronologia ----------

const countLines = (text: string) =>
  text
    .split("\n")
    .reduce((acc, para) => acc + Math.max(1, Math.ceil(para.length / CHARS_PER_LINE)), 0);

const bubbleHeight = (text: string) =>
  BUBBLE_PAD_Y * 2 + countLines(text) * LINE_H + META_H;

type Beat = {
  msg: ChatMessage;
  height: number;
  typingStart: number | null; // frames
  appear: number; // frames
};

const START_HOLD = 0.7;
const END_HOLD = 2.2;

// Cuanto "descansa" el video despues de un mensaje, segun cuanto haya para leer.
const readPause = (text: string) => Math.min(0.9 + text.length * 0.022, 2.3);

export const buildBeats = (messages: ChatMessage[], fps: number) => {
  let t = START_HOLD;
  const beats: Beat[] = [];

  for (const msg of messages) {
    t += msg.delay ?? 0.55;

    const typingSec = msg.from === "them" ? (msg.typing ?? 1.2) : 0;
    const typingStart = typingSec > 0 ? Math.round(t * fps) : null;
    t += typingSec;

    const appear = Math.round(t * fps);
    beats.push({ msg, height: bubbleHeight(msg.text), typingStart, appear });

    t += readPause(msg.text);
  }

  return { beats, totalFrames: Math.round((t + END_HOLD) * fps) };
};

export const calcChatMetadata: CalculateMetadataFunction<ChatMockupProps> = ({
  props,
}) => {
  const { totalFrames } = buildBeats(props.messages, CHAT_FPS);
  return { durationInFrames: totalFrames, fps: CHAT_FPS, width: W, height: H };
};

// ---------- Piezas ----------

const Avatar: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: "rgba(192,124,65,0.18)",
      border: `2px solid ${BRAND.accent}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: BRAND.accent,
      fontSize: size * 0.42,
      fontWeight: 600,
      fontFamily,
    }}
  >
    {name.trim().charAt(0).toUpperCase()}
  </div>
);

const Header: React.FC<{ name: string; status: string }> = ({ name, status }) => (
  <div
    style={{
      height: HEADER_H,
      backgroundColor: HEADER_BG,
      borderBottom: `1px solid ${HAIRLINE}`,
      display: "flex",
      alignItems: "center",
      gap: 24,
      paddingLeft: 34,
      paddingRight: 34,
    }}
  >
    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 40, marginRight: 4 }}>‹</div>
    <Avatar name={name} size={82} />
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: BRAND.title, fontSize: 38, fontWeight: 600, fontFamily }}>
        {name}
      </div>
      <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 27, fontFamily }}>
        {status}
      </div>
    </div>
  </div>
);

const Checks: React.FC<{ read: boolean }> = ({ read }) => (
  <svg width="34" height="20" viewBox="0 0 34 20" fill="none">
    <path
      d="M2 11.5 L7.5 17 L18 5"
      stroke={read ? "#5BC8FA" : "rgba(255,255,255,0.55)"}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13 11.5 L18.5 17 L29 5"
      stroke={read ? "#5BC8FA" : "rgba(255,255,255,0.55)"}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Chip centrado que marca el paso del tiempo. Es lo que cuenta la historia:
// sin el, tres mensajes seguidos parecen un minuto y no dos horas.
const Divider: React.FC<{ label: string; progress: number }> = ({ label, progress }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      opacity: progress,
    }}
  >
    <div
      style={{
        backgroundColor: "rgba(255,255,255,0.07)",
        borderRadius: 22,
        padding: "10px 26px",
        color: "rgba(255,255,255,0.45)",
        fontSize: 25,
        fontFamily,
        letterSpacing: 0.4,
      }}
    >
      {label}
    </div>
  </div>
);

const Bubble: React.FC<{ msg: ChatMessage; progress: number }> = ({ msg, progress }) => {
  const mine = msg.from === "me";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
        opacity: progress,
        transform: `translateY(${(1 - progress) * 26}px) scale(${0.94 + progress * 0.06})`,
        transformOrigin: mine ? "bottom right" : "bottom left",
      }}
    >
      <div
        style={{
          maxWidth: BUBBLE_MAX_W,
          backgroundColor: mine ? BUBBLE_ME : BUBBLE_THEM,
          padding: `${BUBBLE_PAD_Y}px ${BUBBLE_PAD_X}px`,
          borderRadius: 30,
          borderBottomRightRadius: mine ? 8 : 30,
          borderBottomLeftRadius: mine ? 30 : 8,
          boxShadow: "0 6px 22px rgba(0,0,0,0.30)",
        }}
      >
        <div
          style={{
            color: mine ? "#160D05" : BRAND.title,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_H}px`,
            fontFamily,
            fontWeight: mine ? 500 : 400,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.text}
        </div>
        <div
          style={{
            height: META_H,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 2,
          }}
        >
          <span
            style={{
              color: mine ? "rgba(22,13,5,0.55)" : "rgba(255,255,255,0.38)",
              fontSize: 24,
              fontFamily,
            }}
          >
            {msg.time}
          </span>
          {mine ? <Checks read={msg.read ?? true} /> : null}
        </div>
      </div>
    </div>
  );
};

const TypingDots: React.FC<{ frame: number; progress: number }> = ({ frame, progress }) => (
  <div style={{ display: "flex", justifyContent: "flex-start", opacity: progress }}>
    <div
      style={{
        backgroundColor: BUBBLE_THEM,
        borderRadius: 30,
        borderBottomLeftRadius: 8,
        padding: "26px 34px",
        display: "flex",
        gap: 14,
        alignItems: "center",
      }}
    >
      {[0, 1, 2].map((i) => {
        const bounce = Math.sin((frame / 5) - i * 0.9);
        return (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.55)",
              transform: `translateY(${bounce * 7}px)`,
              opacity: 0.5 + (bounce + 1) * 0.25,
            }}
          />
        );
      })}
    </div>
  </div>
);

const InputBar: React.FC = () => (
  <div
    style={{
      height: INPUT_H,
      backgroundColor: HEADER_BG,
      borderTop: `1px solid ${HAIRLINE}`,
      display: "flex",
      alignItems: "center",
      gap: 20,
      paddingLeft: 30,
      paddingRight: 30,
    }}
  >
    <div
      style={{
        flex: 1,
        height: 78,
        borderRadius: 39,
        backgroundColor: "rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 32,
        color: "rgba(255,255,255,0.28)",
        fontSize: 32,
        fontFamily,
      }}
    >
      Mensaje
    </div>
    <div
      style={{
        width: 78,
        height: 78,
        borderRadius: 39,
        backgroundColor: BRAND.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <path
          d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15.5 12 3.4 13.9Z"
          fill="#160D05"
        />
      </svg>
    </div>
  </div>
);

// ---------- Composicion ----------

export const ChatMockup: React.FC<ChatMockupProps> = ({
  contactName,
  contactStatus,
  messages,
  showLogo,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { beats } = buildBeats(messages, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.background }}>
      {/* halo cobre detras del telefono, muy sutil */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(192,124,65,0.16), transparent 62%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: PHONE_X,
          top: PHONE_Y,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: PHONE_RADIUS,
          overflow: "hidden",
          backgroundColor: SURFACE,
          border: `2px solid rgba(255,255,255,0.10)`,
          boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header name={contactName} status={contactStatus} />

        {/* Area de conversacion: el stack se ancla abajo y crece hacia arriba solo */}
        <div style={{ height: CHAT_H, position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: CHAT_PAD_X,
              right: CHAT_PAD_X,
              bottom: CHAT_PAD_Y,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {beats.map((beat, i) => {
              // El indicador de "escribiendo" ocupa lugar y despues se colapsa,
              // asi el mensaje que llega empuja al resto sin saltos.
              const typingOpen =
                beat.typingStart !== null
                  ? spring({
                      frame: frame - beat.typingStart,
                      fps,
                      config: { damping: 200, mass: 0.6 },
                      durationInFrames: 9,
                    })
                  : 0;
              const typingClose =
                beat.typingStart !== null
                  ? spring({
                      frame: frame - beat.appear,
                      fps,
                      config: { damping: 200, mass: 0.6 },
                      durationInFrames: 9,
                    })
                  : 0;
              const typingFactor = Math.max(0, typingOpen - typingClose);

              const grow = spring({
                frame: frame - beat.appear,
                fps,
                config: { damping: 200, mass: 0.7 },
                durationInFrames: 11,
              });

              // El divisor entra junto con el "escribiendo" (o con el mensaje si no lo hay)
              const dividerFrom = beat.typingStart ?? beat.appear;
              const dividerGrow = beat.msg.divider
                ? spring({
                    frame: frame - dividerFrom,
                    fps,
                    config: { damping: 200, mass: 0.6 },
                    durationInFrames: 10,
                  })
                : 0;

              return (
                <React.Fragment key={i}>
                  {beat.msg.divider ? (
                    <div
                      style={{
                        height: DIVIDER_H * dividerGrow,
                        marginBottom: GAP * dividerGrow,
                        overflow: "hidden",
                      }}
                    >
                      <Divider label={beat.msg.divider} progress={dividerGrow} />
                    </div>
                  ) : null}

                  {beat.typingStart !== null ? (
                    <div
                      style={{
                        height: TYPING_H * typingFactor,
                        marginBottom: GAP * typingFactor,
                        overflow: "hidden",
                      }}
                    >
                      <TypingDots frame={frame} progress={typingFactor} />
                    </div>
                  ) : null}

                  <div
                    style={{
                      height: beat.height * grow,
                      marginBottom: GAP * grow,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ width: "100%" }}>
                      <Bubble msg={beat.msg} progress={grow} />
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* difuminado arriba: los mensajes viejos se van sin cortarse en seco */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 130,
              background: `linear-gradient(to bottom, ${SURFACE}, rgba(17,24,38,0))`,
            }}
          />
        </div>

        <InputBar />
      </div>

      {showLogo ? (
        <div
          style={{
            position: "absolute",
            top: PHONE_Y + PHONE_H + 62,
            left: 0,
            width: W,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
            opacity: interpolate(frame, [6, 26], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Img src={staticFile("logo-vakdor.png")} style={{ height: 88 }} />
          <div
            style={{
              color: BRAND.title,
              fontFamily,
              fontSize: 46,
              fontWeight: 600,
              letterSpacing: 6,
            }}
          >
            VAKDOR
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
