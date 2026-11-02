import Link from "next/link";
import { ListChecks } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";

/** A friendly way into Guided Selection where a search or filter found nothing. */
export function GuidedSelectionPromo() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-rj-gray-200 bg-rj-gray-50 p-5 sm:flex-row sm:items-center">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rj-red text-rj-white"
      >
        <ListChecks className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-rj-black">Not finding it? Answer 4 quick questions.</p>
        <p className="text-xs text-rj-gray-600">We match you with what is in stock right now.</p>
      </div>
      <Link href={ROUTES.assistant} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
        Find my match
      </Link>
    </div>
  );
}
