import { formatDuration } from "@/lib/ops/analytics";
import type { OwnershipGroup } from "@/lib/ops/issues";

export function IssuesBoard({
  groups,
  areaKey,
  onAreaKeyChange,
}: {
  groups: OwnershipGroup[];
  areaKey: string;
  onAreaKeyChange: (areaKey: string) => void;
}) {
  return (
    <section className="ops-panel" aria-labelledby="ops-board-title">
      <div className="section-heading">
        <h2 id="ops-board-title">Ownership</h2>
        <p>Click an area to filter the list</p>
      </div>
      {groups.length ? (
        <div className="ops-board">
          {groups.map((group) => (
            <section key={group.key} className="ops-board-group" aria-labelledby={`ops-board-${group.key}`}>
              <h3 id={`ops-board-${group.key}`}>{group.label}</h3>
              <div className="ops-board-cards">
                {group.cards.map((card) => {
                  const active = areaKey === card.key;
                  return (
                    <button
                      type="button"
                      key={card.key}
                      className="ops-board-card"
                      data-active={active}
                      aria-pressed={active}
                      onClick={() => onAreaKeyChange(active ? "all" : card.key)}
                    >
                      <span className="ops-board-card-name">{card.name}</span>
                      <span className="ops-board-card-owner">{card.owner || "No owner"}</span>
                      {card.reportsTo ? (
                        <span className="ops-board-card-meta">Reports to {card.reportsTo}</span>
                      ) : null}
                      <span className="ops-board-card-stats">
                        <span>Open {card.open}</span>
                        <span>Closed {card.closed}</span>
                      </span>
                      <span className="ops-board-card-meta">
                        Oldest open {formatDuration(card.oldestOpenMs)}
                      </span>
                      <span className="ops-board-card-meta">
                        Avg resolution {formatDuration(card.avgResolutionMs)}
                      </span>
                      {card.escalations > 0 ? (
                        <span className="ops-escalate-flag">{card.escalations} to escalate</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="ops-empty-filter">No areas or issues yet.</p>
      )}
    </section>
  );
}
