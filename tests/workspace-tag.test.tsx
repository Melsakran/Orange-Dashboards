import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTag } from "@/components/dashboard/workspace-tag";

describe("WorkspaceTag", () => {
  it("shows the tag read-only for visitors", () => {
    render(<WorkspaceTag value="October/November" />);
    expect(screen.getByText("October/November")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing for visitors when no tag is set", () => {
    const { container } = render(<WorkspaceTag />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets admins add a tag", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceTag onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("Tag"), "  October/November  ");
    await user.click(screen.getByRole("button", { name: "Save tag" }));

    expect(onSave).toHaveBeenCalledWith("October/November");
    expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
  });

  it("clears the tag when saved empty and keeps the old value on cancel", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceTag value="October" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Edit tag" }));
    await user.clear(screen.getByLabelText("Tag"));
    await user.type(screen.getByLabelText("Tag"), "Draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("October")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit tag" }));
    expect(screen.getByLabelText("Tag")).toHaveValue("October");
    await user.clear(screen.getByLabelText("Tag"));
    await user.click(screen.getByRole("button", { name: "Save tag" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("keeps the editor open and shows the error when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Saving the tag failed: offline"));
    render(<WorkspaceTag onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("Tag"), "Q4");
    await user.click(screen.getByRole("button", { name: "Save tag" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Saving the tag failed: offline");
    expect(screen.getByLabelText("Tag")).toHaveValue("Q4");
  });
});
