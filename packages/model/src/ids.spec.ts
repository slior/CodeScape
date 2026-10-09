import { describe, expect, it } from "@jest/globals";
import {
  buildingId,
  cityId,
  districtId,
  edgeId,
  fileBoxId,
  portalId,
  symbolBoxId,
} from "./index.js";

describe("ids", () => {
  it("writes the byte length of each component", () => {
    expect(cityId("dialectic")).toBe("city:9:dialectic");
    expect(districtId("")).toBe("district:0:");
    expect(districtId("packages/core")).toBe("district:13:packages/core");
    expect(buildingId("src/a.ts")).toBe("building:8:src/a.ts");
    expect(fileBoxId("a:b")).toBe("box:3:a:b");
    expect(symbolBoxId("a", "b:c")).toBe("box:1:a3:b:c");
    expect(symbolBoxId("a:b", "c")).toBe("box:3:a:b1:c");
    expect(symbolBoxId("src/app.ts", "default")).toBe("box:10:src/app.ts7:default");
    const parent = districtId("");
    expect(portalId(parent, "lodash")).toBe("portal:11:district:0:6:lodash");
    const from = fileBoxId("src/app.ts");
    const to = portalId(parent, "lodash");
    expect(edgeId(parent, from, to)).toBe(
      "edge:11:district:0:17:box:10:src/app.ts29:portal:11:district:0:6:lodash",
    );
  });

  it("keeps ids unique when paths contain colon, hash, and :box:", () => {
    const ids = [
      fileBoxId("foo:box:bar"),
      fileBoxId("foo#box"),
      symbolBoxId("foo", "box:bar"),
      symbolBoxId("foo:box:bar", "N"),
      buildingId("foo:box:bar"),
      buildingId("src/:box:/file.ts"),
      portalId("district:0:", "a:b"),
      portalId("district:13:packages/core", "lodash"),
      edgeId("p:1", "f:2", "t:3"),
      edgeId("p", "1:f:2", "t:3"),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

