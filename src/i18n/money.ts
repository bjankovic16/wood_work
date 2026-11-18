/** Prices belong to the project, not the interface language. */
export const CURRENCY = 'RSD';

export const formatMoney = (locale: string) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: CURRENCY, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format;
