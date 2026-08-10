import { describe, it, expect } from "vitest"
import { bucketOf } from "./buckets"

describe("bucketOf", () => {
  it("null es 'sin atender'", () => {
    expect(bucketOf(null)).toBe("sin atender")
  })

  it("los bordes caen para arriba", () => {
    expect(bucketOf(0)).toBe("<1h")
    expect(bucketOf(0.99)).toBe("<1h")
    expect(bucketOf(1)).toBe("1-4h")
    expect(bucketOf(3.99)).toBe("1-4h")
    expect(bucketOf(4)).toBe("4-24h")
    expect(bucketOf(23.99)).toBe("4-24h")
    expect(bucketOf(24)).toBe("+24h")
    expect(bucketOf(500)).toBe("+24h")
  })
})
