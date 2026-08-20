import React from "react";
import { Composition } from "remotion";
import {
  PropertyReel,
  propertyReelDefaults,
  calcReelMetadata,
  FPS,
} from "./PropertyReel";
import {
  EditedReel,
  editedReelDefaults,
  calcEditedMetadata,
  EDIT_FPS,
} from "./EditedReel";
import {
  Thumbnail,
  thumbnailDefaults,
  calcThumbnailMetadata,
  THUMB_FPS,
} from "./Thumbnail";
import {
  PropertyTour,
  propertyTourDefaults,
  calcTourMetadata,
  FPS as TOUR_FPS,
} from "./PropertyTour";
import {
  ChatMockup,
  chatMockupDefaults,
  calcChatMetadata,
  CHAT_FPS,
} from "./ChatMockup";

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
      <Composition
        id="EditedReel"
        component={EditedReel}
        durationInFrames={300}
        fps={EDIT_FPS}
        width={1080}
        height={1920}
        defaultProps={editedReelDefaults}
        calculateMetadata={calcEditedMetadata}
      />
      <Composition
        id="PropertyTour"
        component={PropertyTour}
        durationInFrames={1050}
        fps={TOUR_FPS}
        width={1080}
        height={1920}
        defaultProps={propertyTourDefaults}
        calculateMetadata={calcTourMetadata}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        durationInFrames={1}
        fps={THUMB_FPS}
        width={1080}
        height={1920}
        defaultProps={thumbnailDefaults}
        calculateMetadata={calcThumbnailMetadata}
      />
      <Composition
        id="ChatMockup"
        component={ChatMockup}
        durationInFrames={300}
        fps={CHAT_FPS}
        width={1080}
        height={1920}
        defaultProps={chatMockupDefaults}
        calculateMetadata={calcChatMetadata}
      />
    </>
  );
};
