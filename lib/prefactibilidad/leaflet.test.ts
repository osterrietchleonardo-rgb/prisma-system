import { describe, it, expect } from "vitest";
import { posicionesDe } from "./leaflet";

describe("GeoJSON [lng, lat] → Leaflet [lat, lng]", () => {
  it("Polygon y MultiPolygon", () => {
    expect(posicionesDe({ type: "Polygon", coordinates: [[[-58.4, -34.6], [-58.3, -34.6], [-58.3, -34.5], [-58.4, -34.6]]] })).toEqual([[[[-34.6, -58.4], [-34.6, -58.3], [-34.5, -58.3], [-34.6, -58.4]]]]);
    expect(posicionesDe({ type: "MultiPolygon", coordinates: [[[[0, 1], [2, 3], [4, 5], [0, 1]]], [[[6, 7], [8, 9], [10, 11], [6, 7]]]] })).toHaveLength(2);
  });
});
