import type { OpsRequest } from "@/lib/ops/types";

export function makeOpsRequest(overrides: Partial<OpsRequest> = {}): OpsRequest {
  return {
    interactionId: "SD1000",
    status: "closed",
    assignmentTime: "2026-05-04T09:00:00",
    title: "New Task",
    requestTitle: "Request",
    description: "",
    requestorName: "NFawzy",
    requestorKey: "nfawzy",
    closeDate: "2026-05-04T11:00:00",
    closureCode: "Successful",
    closureComments: "",
    assignedTo: "HElGhandour",
    assignedToKey: "helghandour",
    ...overrides,
  };
}

export const SAMPLE_NOW = "2026-05-21T08:00:00";

export const sampleRequests: OpsRequest[] = [
  makeOpsRequest({
    interactionId: "SD1001",
    requestTitle: "Report deploy",
    closureComments: "Deployed on production",
  }),
  makeOpsRequest({
    interactionId: "SD1002",
    requestTitle: "Merge request 2401",
    assignmentTime: "2026-05-05T09:00:00",
    closeDate: "2026-05-07T09:00:00",
    requestorName: "nfawzy",
    assignedTo: "helghandour",
  }),
  makeOpsRequest({
    interactionId: "SD1003",
    requestTitle: "World cup card",
    assignmentTime: "2026-05-12T10:00:00",
    closeDate: "2026-05-12T10:30:00",
    closureCode: "Failed",
    requestorName: "AhKamel",
    requestorKey: "ahkamel",
    assignedTo: "amdelsabban",
    assignedToKey: "amdelsabban",
  }),
  makeOpsRequest({
    interactionId: "SD1004",
    status: "open",
    requestTitle: "Quota offer",
    description: "Double quota for the attached customer list",
    assignmentTime: "2026-05-13T08:00:00",
    closeDate: null,
    closureCode: "",
    requestorName: "rshalim",
    requestorKey: "rshalim",
    assignedTo: "amdelsabban",
    assignedToKey: "amdelsabban",
  }),
  makeOpsRequest({
    interactionId: "SD1005",
    status: "pending",
    requestTitle: "Plan schedule",
    assignmentTime: "2026-05-20T08:00:00",
    closeDate: null,
    closureCode: "",
    assignedTo: "",
    assignedToKey: "",
  }),
];
