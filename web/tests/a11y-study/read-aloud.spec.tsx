import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ReadAloudButton } from "@/features/a11y-study/ReadAloudButton";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class MockUtterance {
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

const speechSynthesis = {
  speak: vi.fn<(utterance: MockUtterance) => void>(),
  cancel: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("speechSynthesis", speechSynthesis);
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reads a Hebrew block at the requested speed and stops on the second click", () => {
  const text = "שלום עולם";
  render(<ReadAloudButton text={text} rate={1.25} lang="he" />);

  fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  expect(speechSynthesis.speak).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ text, rate: 1.25, lang: "he" }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Stop reading aloud" }));
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeEnabled();
});

it.each([
  { rate: 0.25, expectedRate: 0.5 },
  { rate: 3, expectedRate: 2 },
])("clamps $rate to $expectedRate", ({ rate, expectedRate }) => {
  render(<ReadAloudButton text="A study block" rate={rate} />);

  fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  expect(speechSynthesis.speak).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ rate: expectedRate }),
  );
});

it("can start and stop playback with the keyboard", async () => {
  const user = userEvent.setup();
  render(<ReadAloudButton text="A study block" />);

  await user.tab();
  expect(screen.getByRole("button", { name: "Read aloud" })).toHaveFocus();

  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Stop reading aloud" })).toHaveFocus();
  expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);

  await user.keyboard("[Space]");
  expect(screen.getByRole("button", { name: "Read aloud" })).toHaveFocus();
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
});

it.each(["onend", "onerror"] as const)("resets the button when speech fires %s", (event) => {
  render(<ReadAloudButton text="A study block" />);
  fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  const [utterance] = speechSynthesis.speak.mock.calls[0];

  act(() => utterance[event]?.());

  expect(screen.getByRole("button", { name: "Read aloud" })).toBeEnabled();
});

it("lets another block take over and ignores a late event from the first block", () => {
  const first = render(<ReadAloudButton text="First block" />);
  const second = render(<ReadAloudButton text="Second block" />);
  const firstBlock = within(first.container);
  const secondBlock = within(second.container);

  fireEvent.click(firstBlock.getByRole("button", { name: "Read aloud" }));
  const onFirstEnd = speechSynthesis.speak.mock.calls[0][0].onend;
  fireEvent.click(secondBlock.getByRole("button", { name: "Read aloud" }));
  expect(firstBlock.getByRole("button", { name: "Read aloud" })).toBeEnabled();
  first.unmount();
  act(() => onFirstEnd?.());

  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  expect(secondBlock.getByRole("button", { name: "Stop reading aloud" })).toBeEnabled();

  second.unmount();
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
});
