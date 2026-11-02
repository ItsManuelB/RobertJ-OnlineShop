import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/features/admin/utils/service-speed";
import { getServiceSpeed } from "@/lib/supabase/queries";

export interface AdminServiceSpeedProps {
  from: string;
  to: string;
}

/**
 * How long orders take to ship and returns take to be decided, for work started in the
 * selected dates. If the read fails (for example the database function is not installed
 * yet) the card says so and the rest of the dashboard is unaffected.
 */
export async function AdminServiceSpeed({ from, to }: AdminServiceSpeedProps) {
  let speed: Awaited<ReturnType<typeof getServiceSpeed>> | null = null;
  try {
    speed = await getServiceSpeed(from, to);
  } catch {
    speed = null;
  }

  const items = speed
    ? [
        { label: "Order placed to shipped", value: formatDuration(speed.avgShipSeconds), basis: speed.shippedOrders, noun: "shipped order" },
        { label: "Return filed to decided", value: formatDuration(speed.avgReturnDecisionSeconds), basis: speed.decidedReturns, noun: "decided return" },
      ]
    : [];

  return (
    <Card className="border-border">
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm font-semibold">Service speed</CardTitle>
        <p className="text-xs text-muted-foreground">Average handling time for work started in the selected dates.</p>
      </CardHeader>
      <CardContent>
        {speed === null ? (
          <p className="text-sm text-muted-foreground">Service speed isn&apos;t available right now.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</dd>
                <dd className="text-xs text-muted-foreground">
                  {item.basis === 0 ? "Nothing to average yet" : `Based on ${item.basis} ${item.noun}${item.basis === 1 ? "" : "s"}`}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminServiceSpeedSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="p-5" role="status">
        <span className="sr-only">Loading service speed</span>
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}
