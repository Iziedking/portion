import { approvePartAction, declinePartAction, keepFailedPartAction } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { PART_LABEL, PART_TONE, PAYMENT_LABEL, PAYMENT_TONE, potColor } from "@/lib/format";
import type { Part, PaymentStatus } from "@/lib/repo";

export function Tag({ tone, children }: { tone: "ok" | "wait" | "bad" | "plain"; children: React.ReactNode }) {
  return <span className={`tag ${tone === "plain" ? "" : tone}`}>{children}</span>;
}

export function PaymentTag({ status }: { status: PaymentStatus }) {
  return <Tag tone={PAYMENT_TONE[status]}>{PAYMENT_LABEL[status]}</Tag>;
}

export function PartTag({ part }: { part: Part }) {
  return <Tag tone={PART_TONE[part.status]}>{PART_LABEL[part.status]}</Tag>;
}

/** One payment drawn as the pots it became. Widths are the real share of each part. */
export function DivideStrip({ parts, total, currency }: { parts: { name: string; cents: number; index: number }[]; total: number; currency: string }) {
  return (
    <div>
      <div className="strip" role="img" aria-label="How this payment was divided">
        {parts.map((p) => (
          <div
            key={p.name}
            className="strip-seg"
            style={{ flexGrow: p.cents, flexBasis: 0, background: potColor(p.index) }}
            title={`${p.name}: ${formatMoney(p.cents, currency)}`}
          >
            {p.cents / total > 0.12 ? formatMoney(p.cents, currency) : ""}
          </div>
        ))}
      </div>
      <div className="strip-legend">
        {parts.map((p) => (
          <div className="legend-item" key={p.name}>
            <span className="dot" style={{ background: potColor(p.index) }} />
            <span>{p.name}</span>
            <span className="legend-amt">{formatMoney(p.cents, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PartActions({ part, back }: { part: Part; back: string }) {
  if (part.status === "needs_approval") {
    return (
      <div className="actions">
        <form action={approvePartAction}>
          <input type="hidden" name="partId" value={part.id} />
          <input type="hidden" name="back" value={back} />
          <button className="btn primary small">Approve and send</button>
        </form>
        <form action={declinePartAction}>
          <input type="hidden" name="partId" value={part.id} />
          <input type="hidden" name="back" value={back} />
          <button className="btn quiet small">Keep it instead</button>
        </form>
      </div>
    );
  }
  if (part.status === "failed" || part.status === "returned") {
    return (
      <form action={keepFailedPartAction}>
        <input type="hidden" name="partId" value={part.id} />
        <input type="hidden" name="back" value={back} />
        <button className="btn small">Keep in account</button>
      </form>
    );
  }
  return null;
}

export function Problems({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div className="notice bad">
      Portion checked this plan and stopped it before it could run:
      <ul>
        {list.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export function parseProblems(raw: string | string[] | undefined): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).slice(0, 8) : [];
  } catch {
    return [];
  }
}
