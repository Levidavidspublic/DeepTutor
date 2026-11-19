import type { ReactNode } from "react";

export interface RtlBlockProps {
  lang?: string;
  children: ReactNode;
  as?: "div" | "span";
}

export function RtlBlock({ lang = "he", children, as: Element = "div" }: RtlBlockProps) {
  return (
    <Element dir="rtl" lang={lang} className="text-start">
      {children}
    </Element>
  );
}
