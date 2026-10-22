import { isValidElement } from "react";
import { render } from "@testing-library/react";
import { CountTooltip } from "@/components/pe-daily/count-tooltip";
import { PERIOD_SERIES, PromoBarChart } from "@/components/pe-daily/promo-bar-chart";
import { UpsellingTrendChart } from "@/components/pe-daily/upselling-trend-chart";
import { promoChartData, upsellingChartData } from "@/lib/pe-daily/chart-data";
import { makeReport } from "./fixtures/pe-daily";

const { captured } = vi.hoisted(() => ({ captured: [] as Record<string, unknown>[] }));

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  Tooltip: (props: Record<string, unknown>) => {
    captured.push(props);
    return null;
  },
}));

const report = makeReport();

beforeEach(() => {
  captured.length = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { width: 720, height: 340, top: 0, left: 0, right: 720, bottom: 340, x: 0, y: 0 } as DOMRect,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectMissingValuesKept() {
  expect(captured.length).toBeGreaterThan(0);
  for (const props of captured) {
    expect(props.filterNull).toBe(false);
    expect(isValidElement(props.content) && props.content.type).toBe(CountTooltip);
  }
}

describe("chart tooltip wiring", () => {
  it("keeps missing values in the PromoBarChart tooltip", () => {
    render(<PromoBarChart label="Promos chart" data={promoChartData(report.promos)} series={PERIOD_SERIES} />);
    expectMissingValuesKept();
  });

  it("keeps missing values in the UpsellingTrendChart tooltip", () => {
    render(<UpsellingTrendChart data={upsellingChartData(report.upselling)} />);
    expectMissingValuesKept();
  });
});
