import type { ProjectTier } from "@/lib/data/dashboard";

const OPTIONS: ReadonlyArray<{ tier: ProjectTier; label: string }> = [
  { tier: "critical", label: "Critical Projects" },
  { tier: "standard", label: "Standard Projects" },
];

export function ProjectTierToggle({
  value,
  onChange,
}: {
  value: ProjectTier;
  onChange: (tier: ProjectTier) => void;
}) {
  return (
    <div className="tier-toggle" role="group" aria-label="Project type">
      {OPTIONS.map((option) => (
        <button
          key={option.tier}
          type="button"
          className="tier-toggle-option"
          aria-pressed={value === option.tier}
          data-active={value === option.tier}
          onClick={() => onChange(option.tier)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
