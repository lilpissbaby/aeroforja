import { useEffect, useId, useRef, useState } from "react";
import { formatFixed, parseNumber } from "../units/display.ts";

interface NumberFieldProps {
  readonly label: string;
  readonly unit: string;
  /** Value in display units; null shows an empty field. */
  readonly value: number | null;
  readonly decimals: number;
  readonly onCommit: (value: number | null) => void;
  /** An empty field commits null (e.g. "no uncertainty", "dry air"). */
  readonly allowEmpty?: boolean;
  /** Smallest accepted value, inclusive unless `exclusiveMin` is set. */
  readonly min?: number;
  readonly exclusiveMin?: boolean;
  readonly max?: number;
  readonly placeholder?: string;
}

const show = (value: number | null, decimals: number): string =>
  value === null ? "" : formatFixed(value, decimals).replace(/\./g, "");

/**
 * Numeric input that only commits valid numbers, on blur or Enter. Invalid
 * text stays visible with the reason, so nothing silently becomes zero.
 */
export function NumberField(props: NumberFieldProps) {
  const { label, unit, value, decimals, onCommit, allowEmpty = false, min, max, placeholder } = props;
  const id = useId();
  const [text, setText] = useState(() => show(value, decimals));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);

  // Follow changes that come from elsewhere (another field, a loaded file),
  // but never overwrite what the person is typing or an invalid entry they
  // still have to fix.
  useEffect(() => {
    if (!editing.current) {
      setText(show(value, decimals));
      setError(null);
    }
  }, [value, decimals]);

  const cancelled = useRef(false);

  const commit = (): void => {
    editing.current = false;
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text.trim() === "") {
      if (allowEmpty) {
        setError(null);
        onCommit(null);
      } else {
        setError("Escribe un valor");
      }
      return;
    }
    const parsed = parseNumber(text);
    if (parsed === null) {
      setError("No es un número");
      return;
    }
    if (min !== undefined && (props.exclusiveMin === true ? parsed <= min : parsed < min)) {
      setError(props.exclusiveMin === true ? `Debe ser mayor que ${min}` : `Mínimo ${min}`);
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`Máximo ${max}`);
      return;
    }
    setError(null);
    if (value !== null && parsed === value) setText(show(value, decimals));
    onCommit(parsed);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? `${id}-error` : undefined}
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              setText(show(value, decimals));
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="unit">{unit}</span>
      </div>
      {error !== null && (
        <span className="error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
