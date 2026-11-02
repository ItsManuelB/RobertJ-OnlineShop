import { Suspense } from "react";

import { getSessionUser, listMyConversations } from "@/lib/supabase/queries";
import { GlobalInboxDock } from "@/features/messages/components/GlobalInboxDock";

export interface GlobalInboxProps {
  /** Renders through the Admin/Seller portal tokens; omit for the buyer surfaces. */
  themed?: boolean;
}

/**
 * Server entry for the global messages inbox — mounted once per surface
 * (buyer SiteHeader; seller/admin portal layouts). Loads the signed-in user's
 * conversations for the launcher badge + first paint, then hands off to the
 * client dock. Renders nothing for guests or deactivated sessions; a failed
 * read degrades to an empty inbox rather than breaking the page chrome.
 */
export async function GlobalInbox({ themed = false }: GlobalInboxProps) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return null;

  const conversations = await listMyConversations().catch(() => []);
  return (
    // `GlobalInboxDock` reads `useSearchParams` (the `?chat=` deep link); a
    // Suspense boundary keeps that off the static-prerender path.
    <Suspense fallback={null}>
      <GlobalInboxDock themed={themed} initialConversations={conversations} />
    </Suspense>
  );
}
