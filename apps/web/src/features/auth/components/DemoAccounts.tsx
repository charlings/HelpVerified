import { isMocking } from "@/config/env";
import { authCopy } from "@/content/auth";

/** Demo mode only: the seeded mock accounts, so reviewers can sign in as each role. */
export function DemoAccounts() {
  if (!isMocking) return null;
  const { title, body, accounts } = authCopy.demoAccounts;
  return (
    <aside aria-label={title} className="rounded-md border border-dashed border-border-strong bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-navy-900">{title}</p>
      <ul className="mt-1 grid gap-0.5 font-mono text-xs text-slate-700">
        {accounts.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p className="mt-1">{body}</p>
    </aside>
  );
}
