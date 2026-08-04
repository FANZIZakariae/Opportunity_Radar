import { describe, expect, it } from "vitest";
import { canonicalCountryName, marketMatchesRequestedCountries, normalizeOrganizationMarket, resolveMarket } from "@/lib/geography";

describe("market normalization and gating", () => {
  it("normalizes Moroccan cities to the country used by UI filters", () => {
    expect(resolveMarket({ location: "Casablanca-Settat" })).toMatchObject({ country: "Morocco", city: "Casablanca", verified: true });
    expect(normalizeOrganizationMarket({ country: "Rabat" })).toEqual({ country: "Morocco", city: "Rabat" });
  });

  it("accepts explicit Moroccan evidence and .ma domains", () => {
    expect(marketMatchesRequestedCountries({ countries: ["Morocco"], evidenceText: "Based in Casablanca, Maroc" })).toBe(true);
    expect(marketMatchesRequestedCountries({ countries: ["Morocco"], website: "https://example.ma" })).toBe(true);
  });

  it("rejects foreign and unverified locations from a Morocco-only run", () => {
    expect(marketMatchesRequestedCountries({ countries: ["Morocco"], country: "New York, NY" })).toBe(false);
    expect(marketMatchesRequestedCountries({ countries: ["Morocco"], country: "Algeria (West)" })).toBe(false);
    expect(marketMatchesRequestedCountries({ countries: ["Morocco"], country: "Remote" })).toBe(false);
  });

  it("keeps Worldwide discovery intentionally unrestricted", () => {
    expect(marketMatchesRequestedCountries({ countries: ["Worldwide"], country: "New York, NY" })).toBe(true);
  });

  it("canonicalizes country codes and city-style locations", () => {
    expect(canonicalCountryName("NOR")).toBe("Norway");
    expect(canonicalCountryName("ROU")).toBe("Romania");
    expect(canonicalCountryName("IRL")).toBe("Ireland");
    expect(canonicalCountryName("Bangalore, India")).toBe("India");
    expect(canonicalCountryName("Chicago, IL")).toBe("United States");
    expect(canonicalCountryName("Wroclaw")).toBe("Poland");
  });

  it("turns platforms, remote regions and missing locations into Worldwide", () => {
    for (const value of ["LinkedIn", "Remote", "Remote, LATAM", "Asia", ""]) {
      expect(canonicalCountryName(value)).toBe("Worldwide");
      expect(normalizeOrganizationMarket({ country: value }).country).toBe("Worldwide");
    }
  });
});
