import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpsTimeline, OpsWeekTooltip, toWeekData } from "@/components/ops/ops-timeline";

const weeks = [
  { weekStart: "2026-05-18", assigned: 7, closed: 1 },
  { weekStart: "2026-05-25", assigned: 0, closed: 2 },
];

describe("toWeekData", () => {
  it("labels each week with its start and full date range", () => {
    expect(toWeekData(weeks)).toEqual([
      { label: "May 18", range: "Week of May 18 – May 24", assigned: 7, closed: 1 },
      { label: "May 25", range: "Week of May 25 – May 31", assigned: 0, closed: 2 },
    ]);
  });
});

describe("OpsWeekTooltip", () => {
  it("shows the week range with assigned and closed counts", () => {
    const [datum] = toWeekData(weeks);
    render(
      <OpsWeekTooltip
        active
        payload={[
          { dataKey: "assigned", name: "Assigned", value: 7, color: "#e56f18", payload: datum },
          { dataKey: "closed", name: "Closed", value: 1, color: "#237b4b", payload: datum },
        ]}
      />,
    );

    expect(screen.getByText("Week of May 18 – May 24")).toBeInTheDocument();
    expect(screen.getByText("Assigned:", { exact: false })).toHaveTextContent("Assigned: 7");
    expect(screen.getByText("Closed:", { exact: false })).toHaveTextContent("Closed: 1");
  });

  it("renders nothing when not hovered", () => {
    const { container } = render(<OpsWeekTooltip active={false} payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OpsTimeline", () => {
  it("keeps a screen-reader summary of every week", () => {
    render(<OpsTimeline weeks={weeks} />);
    expect(screen.getByRole("listitem", { name: "Week of May 18: 7 assigned, 1 closed" }))
      .toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Week of May 25: 0 assigned, 2 closed" }))
      .toBeInTheDocument();
  });
});
