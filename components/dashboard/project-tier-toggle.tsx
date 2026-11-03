import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import type { ProjectTier } from "@/lib/data/dashboard";

const OPTIONS: ReadonlyArray<{ value: ProjectTier; label: string }> = [
  { value: "critical", label: "Critical Projects" },
  { value: "standard", label: "Standard Projects" },
];

export function ProjectTierToggle({
  value,
  onChange,
}: {
  value: ProjectTier;
  onChange: (tier: ProjectTier) => void;
}) {
  return <SegmentedToggle label="Project type" options={OPTIONS} value={value} onChange={onChange} />;
}
