"use server";

import { DASHBOARD_ROLES } from "@/constants/roles";
import * as queries from "@/lib/supabase/queries";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import type { ActionResult } from "@/types/action.types";

import { TOP_PRODUCTS_LIMIT } from "../constants/report.constants";
import { reportFiltersSchema } from "../schemas/report.schema";
import type { ReportFilters } from "../types/report.types";
import { buildReportCsv, fillTrendGaps } from "../utils/report-range";

export interface ReportCsvExport {
  filename: string;
  csv: string;
}

/**
 * Builds a CSV of the sales summary + trend for the given filters. Reuses the
 * exact RLS/DEFINER-scoped service reads (no separate data path), so a seller
 * can only ever export their own shop's numbers. Returns the CSV text; the
 * client turns it into a download.
 */
export async function exportSalesReportAction(
  filters: ReportFilters,
): Promise<ActionResult<ReportCsvExport>> {
  const parsed = reportFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return fromZodError(parsed.error);
  }

  try {
    await queries.requireRole(DASHBOARD_ROLES);

    const resolved: ReportFilters = {
      from: parsed.data.from,
      to: parsed.data.to,
      granularity: parsed.data.granularity,
      shopId: parsed.data.shopId,
    };

    const [summary, series, paymentSources, statuses, categories, topProducts, pipeline] = await Promise.all([
      queries.getSalesSummary(resolved.from, resolved.to, resolved.shopId),
      queries.getSalesTimeseries(
        resolved.from,
        resolved.to,
        resolved.granularity,
        resolved.shopId,
      ),
      queries.getPaymentSourceSummary(resolved.from, resolved.to, resolved.shopId),
      queries.getOrderStatusBreakdown(resolved.from, resolved.to, resolved.shopId),
      queries.getRevenueByCategory(resolved.from, resolved.to, resolved.shopId),
      queries.getTopProducts(resolved.from, resolved.to, TOP_PRODUCTS_LIMIT, resolved.shopId),
      queries.getRefundPipeline({ from: resolved.from, to: resolved.to }, resolved.shopId),
    ]);

    const trend = fillTrendGaps(series, resolved);
    const categoryTotal = categories.reduce((sum, row) => sum + row.revenueCents, 0);
    const csv = buildReportCsv(resolved, summary, trend, paymentSources, {
      statuses,
      categories,
      categoryRemainderCents: summary.grossRevenueCents - categoryTotal,
      topProducts,
      refundsInProgress: {
        count: pipeline.pendingCount + pipeline.attentionCount,
        cents: pipeline.pendingCents + pipeline.attentionCents,
      },
    });
    const filename = `roberj-sales-${resolved.from}_to_${resolved.to}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "We couldn't export the report.",
    );
  }
}
