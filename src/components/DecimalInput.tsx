import { useEffect, useRef, useState } from "react";

interface DecimalInputProps {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

// Number input that allows typing decimals like "5.", "5.6", ".5" without
// the parser stripping the trailing dot. Stores a local string while focused
// and commits a parsed number to the parent on every valid edit.
const DecimalInput = ({ value, onChange, className, onClick }: DecimalInputProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string>(() => String(value ?? 0));

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    const parsed = parseFloat(text);
    if (!Number.isFinite(parsed) || parsed !== value) {
      setText(String(value ?? 0));
    }
  }, [value]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={text}
      onClick={onClick}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^-?\d*\.?\d*$/.test(v)) {
          setText(v);
          if (v === "" || v === "-" || v === "." || v === "-.") {
            onChange(0);
          } else {
            const n = parseFloat(v);
            if (Number.isFinite(n)) onChange(n);
          }
        }
      }}
      onBlur={() => {
        const n = parseFloat(text);
        setText(Number.isFinite(n) ? String(n) : "0");
      }}
      className={className}
    />
  );
};

export default DecimalInput;