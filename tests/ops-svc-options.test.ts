// @vitest-environment node

import { isMergeRequestType, readRequestType } from "@/lib/ops/svc-options";

const select = (attributes: string, text: string) =>
  `<select ${attributes}>${text}<option id="0" label="Merge Request">Merge Request</option></select>`;

describe("readRequestType", () => {
  it("reads the selected Request Type even when attributes contain '>'", () => {
    const svc = `<form editByUser="RequestType,MergeType">${select(
      'help="&lt;p>Request Type&lt;/p> " id="RequestType" label="&lt;p>Request Type&lt;/p> " mandatory="true"',
      "Merge Request",
    )}${select('help="&lt;p>Merge Type&lt;/p>" id="MergeType"', "CVM")}</form>`;
    expect(readRequestType(svc)).toBe("Merge Request");
  });

  it("ignores other selects and decodes entities", () => {
    const svc = `<form>${select('id="MergeType"', "CVM")}${select("id='RequestType'", " Report &amp; Recovery ")}</form>`;
    expect(readRequestType(svc)).toBe("Report & Recovery");
  });

  it.each(["", "not xml at all", "<form><select id=\"MergeType\">CVM</select></form>", "<form><select id=\"RequestType\""])(
    "returns an empty type for %j",
    (svc) => {
      expect(readRequestType(svc)).toBe("");
    },
  );
});

describe("isMergeRequestType", () => {
  it("matches Merge Request without regard to case or spacing", () => {
    expect(isMergeRequestType("Merge Request")).toBe(true);
    expect(isMergeRequestType(" merge  request ")).toBe(true);
    expect(isMergeRequestType("Merge Requests")).toBe(false);
    expect(isMergeRequestType("Report Recovery")).toBe(false);
    expect(isMergeRequestType("")).toBe(false);
  });
});
