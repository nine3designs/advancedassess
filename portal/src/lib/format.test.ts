import { describe, expect, it } from "vitest";
import { effectiveStatus, invoiceTotals } from "./format";

describe("invoice maths", () => {
  it("adds tax on top of the line items", () => {
    const t = invoiceTotals([{ description: "Logo", quantity: 2, rate: 100 }], 20);
    expect(t).toEqual({ subtotal: 200, tax: 40, total: 240 });
  });
  it("marks a sent invoice past its due date as overdue", () => {
    expect(effectiveStatus({ status: "sent", due_date: "2026-01-01" }, new Date("2026-02-01"))).toBe("overdue");
    expect(effectiveStatus({ status: "paid", due_date: "2026-01-01" }, new Date("2026-02-01"))).toBe("paid");
  });
});

import { monthlyPayments } from "./format";
describe("sports monthly payment summary", () => {
  it("splits each month into paid and still owed, ignoring drafts", () => {
    const rows = monthlyPayments([
      { issue_date: "2026-09-01", status: "paid", items: [{ description: "Sept", quantity: 1, rate: 150 }], tax_rate: 0 },
      { issue_date: "2026-09-20", status: "sent", items: [{ description: "Extra", quantity: 1, rate: 50 }], tax_rate: 0 },
      { issue_date: "2026-10-01", status: "draft", items: [{ description: "Oct", quantity: 1, rate: 150 }], tax_rate: 0 },
    ]);
    expect(rows).toEqual([{ month: "2026-09", billed: 200, paid: 150, owed: 50 }]);
  });
});
