// Model sizes arrive in billions of parameters and context lengths in
// thousands of tokens. 0 means unknown (e.g. a closed model).

const compact = (value: number) => Number(value.toPrecision(3)).toString();

/** 552 -> "552B", 2800 -> "2.8T". */
export const formatBillions = (billions: number): string =>
  billions >= 1000 ? `${compact(billions / 1000)}T` : `${compact(billions)}B`;

/** "—" when unknown; "active / total" for mixture-of-experts models. */
export const formatParams = (params: number, activeParams?: number | null): string =>
  !params
    ? "—"
    : activeParams
      ? `${formatBillions(activeParams)} / ${formatBillions(params)}`
      : formatBillions(params);

/** 128 -> "128K", 1000 -> "1M"; "" when unknown. */
export const formatContext = (thousands: number): string =>
  !thousands ? "" : thousands >= 1000 ? `${compact(thousands / 1000)}M` : `${compact(thousands)}K`;
