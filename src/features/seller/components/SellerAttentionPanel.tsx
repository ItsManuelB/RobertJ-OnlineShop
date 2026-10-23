import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { getSellerTaskList } from "@/features/seller/utils/seller-tasks.server";
import { summarizeSellerTasks } from "@/features/seller/utils/seller-tasks";

import { SellerAttentionToggle } from "./SellerAttentionToggle";

/**
 * "Needs your attention" — live counts (never date filtered), collapsed by
 * default behind a toggle so the performance numbers stay at the top of the
 * page. Same task list as the topbar bell (`getSellerTaskList`).
 */
export async function SellerAttentionPanel() {
  let tasks: Awaited<ReturnType<typeof getSellerTaskList>>;
  try {
    tasks = await getSellerTaskList();
  } catch {
    return <ErrorState message="We couldn't load your tasks right now." />;
  }

  return (
    <SellerAttentionToggle
      tasks={tasks}
      summary={summarizeSellerTasks(tasks)}
      allClearHref={ROUTES.sellerOrders}
    />
  );
}

export function SellerAttentionPanelSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4" role="status">
      <span className="sr-only">Loading your tasks</span>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
