import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountTooltip } from "@/components/pe-daily/count-tooltip";
import {
  CHANNEL_SERIES,
  PERIOD_SERIES,
  PromoBarChart,
} from "@/components/pe-daily/promo-bar-chart";
import { UpsellingTrendChart } from "@/components/pe-daily/upselling-trend-chart";
import { promoChartData, upsellingChartData } from "@/lib/pe-daily/chart-data";
import { makeReport } from "./fixtures/pe-daily";

const report = makeReport();

describe("CountTooltip", () => {
  it("shows the category and every series value with separators", () => {
    render(
      <CountTooltip
        active
        label="revive"
        payload={[
          { dataKey: "lastWeek", name: "Last week", value: 7603289, color: "#111" },
          { dataKey: "dayBefore", name: "Day before", value: 8471845, color: "#222" },
          { dataKey: "yesterday", name: "Yesterday", value: null, color: "#333" },
        ]}
      />,
    );
    expect(screen.getByText("revive")).toBeInTheDocument();
    expect(screen.getByText("7,603,289")).toBeInTheDocument();
    expect(screen.getByText("8,471,845")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Yesterday: -");
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<CountTooltip active={false} label="x" payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PromoBarChart", () => {
  it("renders a labelled chart with a toggleable legend", async () => {
    const user = userEvent.setup();
    render(
      <PromoBarChart label="Promos – H_DYNAMIC chart" data={promoChartData(report.promos)} series={PERIOD_SERIES} />,
    );
    const figure = screen.getByRole("figure", { name: "Promos – H_DYNAMIC chart" });
    const yesterday = screen.getByRole("button", { name: "Yesterday" });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Last week",
      "Day before",
      "Yesterday",
    ]);
    expect(yesterday).toHaveAttribute("aria-pressed", "true");

    await user.click(yesterday);
    expect(yesterday).toHaveAttribute("aria-pressed", "false");
    await user.click(yesterday);
    expect(yesterday).toHaveAttribute("aria-pressed", "true");
    expect(figure.querySelector(".pe-daily-chart-canvas")).toHaveStyle({ height: "340px" });
  });

  it("scrolls sideways when there are more than 15 categories", () => {
    const many = Array.from({ length: 29 }, (_, index) => ({
      category: `promo-${index}`,
      offline: index,
      online: index,
    }));
    const { container, rerender } = render(
      <PromoBarChart label="SMS chart" data={many} series={CHANNEL_SERIES} />,
    );
    expect(container.querySelector(".pe-daily-chart-canvas")).toHaveStyle({ minWidth: "1392px" });
    rerender(<PromoBarChart label="SMS chart" data={many.slice(0, 15)} series={CHANNEL_SERIES} />);
    expect((container.querySelector(".pe-daily-chart-canvas") as HTMLElement).style.minWidth).toBe("");
  });
});

describe("UpsellingTrendChart", () => {
  it("renders a labelled line chart", () => {
    render(<UpsellingTrendChart data={upsellingChartData(report.upselling)} />);
    expect(screen.getByRole("figure", { name: "Upselling trend" })).toBeInTheDocument();
  });
});
