import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ReturnRequest } from "@/features/returns/types/return.types";
import { getReturnProgress, RETURN_PROGRESS_STEPS } from "@/features/returns/utils/return-progress";
import { cn } from "@/lib/utils/cn";

const ACTOR_LABEL = { buyer: "the buyer", seller: "the seller", admin: "the admin" } as const;

/** Five-stage strip for one return request: what is done, what is in progress, and who acts next. */
export function ReturnProgress({ request }: { request: ReturnRequest }) {
  const { current, waitingOn } = getReturnProgress(request);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <ol className="grid grid-cols-5 gap-1" aria-label="Request progress">
        {RETURN_PROGRESS_STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex flex-col items-center gap-1 text-center" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary ring-4 ring-primary/15",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold leading-tight sm:text-[11px]",
                  done || active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step}
                <span className="sr-only">{done ? " (done)" : active ? " (in progress)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {waitingOn ? (
        <p>
          <Badge tone={waitingOn === "seller" ? "warning" : "info"}>Next: {ACTOR_LABEL[waitingOn]}</Badge>
        </p>
      ) : null}
    </div>
  );
}
