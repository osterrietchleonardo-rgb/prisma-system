import { describe, it, expect } from "vitest";
import { esMotorSafari } from "./motor-safari";

const UA = {
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
};

describe("esMotorSafari", () => {
  it("reconoce Safari de Mac y cualquier navegador del iPhone", () => {
    expect(esMotorSafari(UA.safariMac)).toBe(true);
    expect(esMotorSafari(UA.safariIphone)).toBe(true);
    expect(esMotorSafari(UA.chromeIphone)).toBe(true);
  });

  it("deja afuera a los que ya imprimen bien", () => {
    expect(esMotorSafari(UA.chromeMac)).toBe(false);
    expect(esMotorSafari(UA.chromeWindows)).toBe(false);
    expect(esMotorSafari(UA.chromeAndroid)).toBe(false);
    expect(esMotorSafari(UA.edgeWindows)).toBe(false);
    expect(esMotorSafari(UA.firefoxWindows)).toBe(false);
  });
});
