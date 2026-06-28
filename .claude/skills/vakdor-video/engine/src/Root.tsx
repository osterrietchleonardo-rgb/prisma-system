import React from "react";
import { Composition } from "remotion";
import {
  PropertyReel,
  propertyReelDefaults,
  calcReelMetadata,
  FPS,
} from "./PropertyReel";

// Registro de composiciones del motor de video Vakdor.
// Formato vertical 1080x1920 (reel IG/TikTok). La duracion se calcula sola
// segun la cantidad de fotos (calculateMetadata).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PropertyReel"
        component={PropertyReel}
        durationInFrames={300}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={propertyReelDefaults}
        calculateMetadata={calcReelMetadata}
      />
    </>
  );
};
