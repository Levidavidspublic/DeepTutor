import { StatusChip } from "@/shared/ui/StatusChip";
import { Tooltip } from "@/shared/ui/Tooltip";
import { RtlBlock } from "./RtlBlock";

export interface GlossaryChipProps {
  term_source: string;
  term_ui: string;
  note?: string;
}

export function GlossaryChip({ term_source, term_ui, note }: GlossaryChipProps) {
  const chip = (
    <StatusChip
      role="group"
      aria-label={`${term_source} ${term_ui}`}
      tabIndex={0}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <RtlBlock as="span">{term_source}</RtlBlock>
      <span lang="en">{term_ui}</span>
    </StatusChip>
  );

  return note ? <Tooltip label={note}>{chip}</Tooltip> : chip;
}
