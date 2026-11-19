import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { GlossaryChip } from "@/features/a11y-study/GlossaryChip";
import { RtlBlock } from "@/features/a11y-study/RtlBlock";

it("renders a Hebrew RTL block inside an LTR page", () => {
  render(
    <main dir="ltr" lang="en">
      <RtlBlock>שלום</RtlBlock>
    </main>,
  );

  const block = screen.getByText("שלום");
  expect(block.tagName).toBe("DIV");
  expect(block).toHaveAttribute("dir", "rtl");
  expect(block).toHaveAttribute("lang", "he");
  expect(block).toHaveClass("text-start");
  expect(screen.getByRole("main")).toHaveAttribute("dir", "ltr");
});

it("renders an inline RTL span with the requested language", () => {
  render(<RtlBlock as="span" lang="ar">مرحبا</RtlBlock>);

  const inline = screen.getByText("مرحبا");
  expect(inline.tagName).toBe("SPAN");
  expect(inline).toHaveAttribute("dir", "rtl");
  expect(inline).toHaveAttribute("lang", "ar");
});

it("names the glossary chip with both terms and shows the note on keyboard focus", async () => {
  const user = userEvent.setup();
  const note = "A change in position over time.";
  render(<GlossaryChip term_source="תנועה" term_ui="Motion" note={note} />);

  const chip = screen.getByRole("group", { name: "תנועה Motion" });
  const source = within(chip).getByText("תנועה");
  expect(source.tagName).toBe("SPAN");
  expect(source).toHaveAttribute("dir", "rtl");
  expect(source).toHaveAttribute("lang", "he");
  expect(within(chip).getByText("Motion")).toBeVisible();
  expect(chip).toHaveAccessibleDescription(note);

  await user.tab();
  expect(chip).toHaveFocus();
  await waitFor(() => expect(screen.getByRole("tooltip").parentElement).toBe(document.body));
  expect(screen.getByRole("tooltip")).toHaveTextContent(note);

  await user.keyboard("{Escape}");
  expect(screen.getByRole("tooltip")).toHaveClass("sr-only");
});

it("keeps the glossary chip keyboard focusable without a note", async () => {
  const user = userEvent.setup();
  render(<GlossaryChip term_source="תנועה" term_ui="Motion" />);

  const chip = screen.getByRole("group", { name: "תנועה Motion" });
  await user.tab();
  expect(chip).toHaveFocus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
