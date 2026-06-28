import { Config } from "@remotion/cli/config";

// Calidad alta para reels de redes. H.264 + CRF bajo = nitido y compatible con IG/TikTok.
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(18);
Config.overrideWebpackConfig((config) => config);
