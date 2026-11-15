// Pomocné dátumové funkcie poradcu (dátumy ako ISO reťazec „yyyy-mm-dd“, bez časových pásiem).

export const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const todayIso = (now: Date) => iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
export const lastDayOfMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
