// Peňažné pomocné funkcie. Počítame v centoch, aby sedeli zaokrúhlenia.

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** centy s odstránením chýb plávajúcej čiarky (30,97 nesmie byť 30,969999…) */
const cents = (x: number) => Math.round(x * 100 * 1e4) / 1e4;
export const floor2 = (x: number) => Math.floor(cents(x)) / 100;
export const ceil2 = (x: number) => Math.ceil(cents(x)) / 100;

export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));

const eurFmt = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** suma s nezalomiteľnou medzerou pred € (číslo a € sa nerozdelia na dva riadky) */
export const eur = (x: number) => `${eurFmt.format(round2(x))}\u00a0€`;
export const pct = (r: number) => `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 2 }).format(r * 100)}\u00a0%`;
