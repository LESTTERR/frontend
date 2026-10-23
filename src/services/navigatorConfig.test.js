import { describe, it, expect } from "vitest";
import { getAdminPinCode } from "./navigatorConfig.js";

describe("getAdminPinCode", () => {
  it("returns a non-empty access code", () => {
    const pin = getAdminPinCode();
    expect(typeof pin).toBe("string");
    expect(pin.length).toBeGreaterThan(0);
  });
});
