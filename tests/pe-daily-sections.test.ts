// @vitest-environment node

import {
  displayManualValue,
  emptyDraftRow,
  MAX_TEXT_LENGTH,
  SECTIONS,
  toDraftRow,
  validateDraftRows,
} from "@/lib/pe-daily/sections";
import { SECTION_KEYS } from "@/lib/pe-daily/types";

describe("SECTIONS", () => {
  it("defines every admin-entered section with the deck's columns", () => {
    expect(SECTION_KEYS.map((key) => [SECTIONS[key].title, SECTIONS[key].fields.map((f) => f.label)])).toEqual([
      ["Promos – TX_PROV", ["Promo Name", "Last Week Count", "Day Before Count", "Yesterday Count"]],
      ["Actions", ["Action", "Status"]],
      ["Offer Sheet Tool", ["Promo Name", "Owner", "On GUI", "Utilized Business"]],
      ["Data Lake", ["File Path"]],
      ["IT First Line Cases", ["Case", "Promo Name", "Is it 1st line?", "Feedback"]],
      ["Grafana", ["Issue", "Server", "Feedback"]],
    ]);
    expect(SECTION_KEYS.map((key) => SECTIONS[key].fields.filter((f) => f.required).map((f) => f.key))).toEqual([
      ["promo"],
      ["action"],
      ["promo"],
      ["file_path"],
      ["case"],
      ["issue"],
    ]);
  });
});

describe("validateDraftRows", () => {
  it("trims text, parses counts, and drops fully empty rows", () => {
    const result = validateDraftRows(SECTIONS.tx_prov, [
      { promo: " go-2 ", last_week: "1,408", day_before: "0", yesterday: "" },
      { promo: "", last_week: " ", day_before: "", yesterday: "" },
    ]);
    expect(result).toEqual({
      rows: [{ promo: "go-2", last_week: 1408, day_before: 0, yesterday: null }],
      errors: [{}, {}],
      valid: true,
    });
  });

  it("reports required fields, bad counts, and long text per row", () => {
    const result = validateDraftRows(SECTIONS.tx_prov, [
      { promo: "", last_week: "12a", day_before: "-1", yesterday: "3" },
      { promo: "x".repeat(MAX_TEXT_LENGTH + 1), last_week: "", day_before: "", yesterday: "" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { promo: "Required.", last_week: "Enter a whole number.", day_before: "Enter a whole number." },
      { promo: "Must be 2,000 characters or fewer." },
    ]);
  });

  it("treats a missing draft key as empty", () => {
    expect(validateDraftRows(SECTIONS.actions, [{ action: "Restart" }]).rows).toEqual([
      { action: "Restart", status: "" },
    ]);
  });
});

describe("drafts and display", () => {
  it("round-trips stored rows into editable drafts", () => {
    expect(toDraftRow(SECTIONS.tx_prov, { promo: "go-2", last_week: 408, day_before: null })).toEqual({
      promo: "go-2",
      last_week: "408",
      day_before: "",
      yesterday: "",
    });
    expect(emptyDraftRow(SECTIONS.grafana)).toEqual({ issue: "", server: "", feedback: "" });
  });

  it("displays counts with separators and blanks appropriately", () => {
    const [promo, lastWeek] = SECTIONS.tx_prov.fields;
    expect(displayManualValue(lastWeek, 1408)).toBe("1,408");
    expect(displayManualValue(lastWeek, null)).toBe("-");
    expect(displayManualValue(promo, "go-2")).toBe("go-2");
    expect(displayManualValue(promo, undefined)).toBe("");
  });
});
