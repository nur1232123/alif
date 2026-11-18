// Дата по хиджре по табличному календарю. Может расходиться с официальной на день:
// начало месяца в разных странах объявляют по наблюдению луны

export const HIJRI_MONTHS = [
  'мухаррам', 'сафар', 'раби аль-авваль', 'раби ас-сани', 'джумада аль-уля', 'джумада ас-сания',
  'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа',
];
export const HIJRI_MONTHS_AR = ['مُحَرَّم', 'صَفَر', 'رَبِيع الأَوَّل', 'رَبِيع الآخِر', 'جُمَادَى الأُولَى', 'جُمَادَى الآخِرَة', 'رَجَب', 'شَعْبَان', 'رَمَضَان', 'شَوَّال', 'ذُو القَعْدَة', 'ذُو الحِجَّة'];

export type Hijri = { day: number; month: number; year: number };

/** Григорианская дата → хиджра (месяц от 1 до 12) */
export function toHijri(date: Date): Hijri {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  // Юлианский день
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jd = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  // Табличный исламский календарь (эпоха 16 июля 622 года)
  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j = Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) + Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 = l1 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l2) / 709);
  const day = l2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month, year };
}

export const fmtHijri = (h: Hijri) => `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`;
