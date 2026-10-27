import type { Provenance, Result, Validity, ValidityLevel } from "@aeroforja/physics";
import { PROVENANCE_ES, VALIDITY_ES, assumptionText, methodName } from "../i18n/es.ts";

const ICON: Readonly<Record<ValidityLevel, string>> = { green: "✓", amber: "!", red: "✕" };

export function ValidityBadge({ level }: { readonly level: ValidityLevel }) {
  return (
    <span className={`validity ${level}`}>
      <span className="dot" aria-hidden="true">
        {ICON[level]}
      </span>
      {VALIDITY_ES[level]}
    </span>
  );
}

export function ProvenanceTag({ provenance }: { readonly provenance: Provenance }) {
  return <span className={`tag ${provenance.toLowerCase()}`}>{PROVENANCE_ES[provenance]}</span>;
}

export function ResultHead({
  validity,
  provenance,
}: {
  readonly validity: Validity;
  readonly provenance: Provenance;
}) {
  return (
    <div className="result-head">
      <ValidityBadge level={validity.level} />
      <ProvenanceTag provenance={provenance} />
    </div>
  );
}

/** Method, references and assumptions, one click away as the spec asks. */
export function MethodDetails({ result }: { readonly result: Result<unknown> }) {
  return (
    <details className="method">
      <summary>Método, referencias y supuestos</summary>
      <ul>
        {result.methods.map((m) => (
          <li key={m.id}>
            {methodName(m)}
            {m.references.map((r) => (
              <span className="ref" key={r.citation}>
                {r.url !== undefined ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.citation}
                  </a>
                ) : (
                  r.citation
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <ul>
        {result.assumptions.map((a) => (
          <li key={a.id}>{assumptionText(a)}</li>
        ))}
      </ul>
    </details>
  );
}
