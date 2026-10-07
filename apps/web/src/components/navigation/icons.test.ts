import { describe, expect, it } from "vitest";
import { appNav } from "@/config/nav";
import { appIcons } from "./icons";

describe("app icons", () => {
  it("resolves every icon name used in app navigation", () => {
    for (const nav of Object.values(appNav)) {
      for (const item of nav.items) expect(appIcons[item.icon], item.label).toBeDefined();
    }
  });
});
