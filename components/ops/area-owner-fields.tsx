"use client";

import { useState } from "react";
import {
  OPS_AREA_GROUPS,
  OPS_AREA_GROUP_LABELS,
  type OpsArea,
} from "@/lib/ops/types";

export interface AreaOwnerState {
  areaId: string;
  setAreaId: (areaId: string) => void;
  /** What the Owner field shows: the typed value, or the selected area's owner until the admin types. */
  owner: string;
  setOwner: (owner: string) => void;
  /** The value to store: "" when the owner is the area's owner, so directory changes still apply. */
  ownerToSave: () => string;
}

/**
 * Area + owner pair. The owner follows the selected area until the admin types into it; saving an
 * owner equal to the area's owner stores "" so later directory changes still apply.
 */
export function useAreaOwner(
  areas: OpsArea[],
  initialAreaId: string | null,
  initialOwnerOverride: string,
): AreaOwnerState {
  const [areaId, setAreaId] = useState(
    initialAreaId && areas.some((candidate) => candidate.id === initialAreaId) ? initialAreaId : "",
  );
  const [typedOwner, setTypedOwner] = useState<string | null>(
    initialOwnerOverride.trim() ? initialOwnerOverride : null,
  );
  const area = areas.find((candidate) => candidate.id === areaId) ?? null;
  const owner = typedOwner ?? area?.ownerName ?? "";

  return {
    areaId,
    setAreaId,
    owner,
    setOwner: setTypedOwner,
    ownerToSave: () => {
      const trimmed = owner.trim();
      return trimmed === (area?.ownerName ?? "").trim() ? "" : trimmed;
    },
  };
}

export function AreaOwnerFields({
  areas,
  state,
  areaError,
  idPrefix,
}: {
  areas: OpsArea[];
  state: AreaOwnerState;
  areaError?: string;
  idPrefix: string;
}) {
  return (
    <div className="form-row">
      <div className="form-field">
        <label htmlFor={`${idPrefix}-area`}>Area</label>
        <select
          id={`${idPrefix}-area`}
          value={state.areaId}
          aria-invalid={Boolean(areaError)}
          aria-describedby={areaError ? `${idPrefix}-area-error` : undefined}
          onChange={(event) => state.setAreaId(event.target.value)}
        >
          <option value="">Choose an area</option>
          {OPS_AREA_GROUPS.map((group) => {
            const groupAreas = areas
              .filter((area) => area.group === group)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
            if (!groupAreas.length) return null;
            return (
              <optgroup key={group} label={OPS_AREA_GROUP_LABELS[group]}>
                {groupAreas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
        {areaError ? <p className="form-error" id={`${idPrefix}-area-error`}>{areaError}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-owner`}>Owner</label>
        <input
          id={`${idPrefix}-owner`}
          value={state.owner}
          onChange={(event) => state.setOwner(event.target.value)}
        />
      </div>
    </div>
  );
}
