export const formatCurrency = (value, currency = "JMD") =>
  new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);

export const formatNumber = (value) =>
  new Intl.NumberFormat("en-US").format(value || 0);
