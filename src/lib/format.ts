export const formatBDT = (n: number | string) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(n));

export const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank: "Bank",
  other: "Other",
};
