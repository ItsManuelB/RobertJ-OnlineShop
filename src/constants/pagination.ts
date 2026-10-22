export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 12,
  /** Shop product listing: 5 rows of the 4-column desktop grid. */
  catalogPageSize: 20,
  maxPageSize: 60,
  pageSizeOptions: [12, 24, 48] as const,
} as const;
