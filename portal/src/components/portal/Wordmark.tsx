const PF = { fontFamily: '"Playfair Display", Georgia, serif' } as const;

export function Wordmark({ variant }: { variant: "stack" | "inline" }) {
  if (variant === "inline") {
    return (
      <span aria-label="Advanced Assessment & Solutions" className="inline-flex select-none items-center whitespace-nowrap text-[0.6rem] font-medium uppercase tracking-[0.22em] text-white" style={PF}>
        Advanced&nbsp;Assessment&nbsp;&amp;&nbsp;Solutions
      </span>
    );
  }
  return (
    <span aria-label="Advanced Assessment & Solutions" className="inline-flex select-none flex-col items-center text-center text-white" style={PF}>
      <span className="text-[1.55rem] font-medium uppercase leading-tight tracking-[0.22em] md:text-[1.9rem]">Advanced&nbsp;Assessment</span>
      <span className="mx-auto text-[1.55rem] font-medium leading-tight md:text-[1.9rem]">&amp;</span>
      <span className="text-[1.55rem] font-medium uppercase leading-tight tracking-[0.34em] md:text-[1.9rem]">Solutions</span>
    </span>
  );
}
