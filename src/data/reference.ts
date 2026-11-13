// Справочник во вкладке «Буквы»: огласовки и цифры.
// Арабский текст здесь мой, его проверяет автор курса, как и остальные тексты.

export type Mark = {
  id: string;
  /** Название по-русски */
  name: string;
  /** Арабское название */
  arName: string;
  /** Знак на букве ب */
  sample: string;
  /** Как читается образец */
  reads: string;
  /** Что делает знак */
  rule: string;
  example: { ar: string; ru: string };
};

export const MARKS: Mark[] = [
  {
    id: 'fatha',
    name: 'Фатха',
    arName: 'فَتْحَة',
    sample: 'بَ',
    reads: 'ба',
    rule: 'Чёрточка над буквой. Даёт короткий звук «а».',
    example: { ar: 'كَتَبَ', ru: 'он написал' },
  },
  {
    id: 'kasra',
    name: 'Кясра',
    arName: 'كَسْرَة',
    sample: 'بِ',
    reads: 'би',
    rule: 'Чёрточка под буквой. Даёт короткий звук «и».',
    example: { ar: 'بِنْتٌ', ru: 'девочка' },
  },
  {
    id: 'damma',
    name: 'Дамма',
    arName: 'ضَمَّة',
    sample: 'بُ',
    reads: 'бу',
    rule: 'Маленькая вау над буквой. Даёт короткий звук «у».',
    example: { ar: 'كُتُبٌ', ru: 'книги' },
  },
  {
    id: 'sukun',
    name: 'Сукун',
    arName: 'سُكُون',
    sample: 'بْ',
    reads: 'б',
    rule: 'Кружок над буквой. Гласного нет: буква читается коротко и примыкает к предыдущему слогу.',
    example: { ar: 'مِنْ', ru: 'из, от' },
  },
  {
    id: 'shadda',
    name: 'Шадда',
    arName: 'شَدَّة',
    sample: 'بَّ',
    reads: 'бба',
    rule: 'Знак, похожий на маленькую «ш». Буква удваивается и звучит дольше и сильнее.',
    example: { ar: 'مُدَرِّسٌ', ru: 'учитель' },
  },
  {
    id: 'tanwin-u',
    name: 'Танвин дамма',
    arName: 'تَنْوِينُ الضَّمِّ',
    sample: 'بٌ',
    reads: 'бун',
    rule: 'Двойная дамма на конце слова. Даёт «ун».',
    example: { ar: 'كِتَابٌ', ru: 'книга' },
  },
  {
    id: 'tanwin-a',
    name: 'Танвин фатха',
    arName: 'تَنْوِينُ الْفَتْحِ',
    sample: 'بًا',
    reads: 'бан',
    rule: 'Двойная фатха на конце слова. Даёт «ан», после неё обычно пишут алиф, который не читается.',
    example: { ar: 'شُكْرًا', ru: 'спасибо' },
  },
  {
    id: 'tanwin-i',
    name: 'Танвин кясра',
    arName: 'تَنْوِينُ الْكَسْرِ',
    sample: 'بٍ',
    reads: 'бин',
    rule: 'Двойная кясра на конце слова. Даёт «ин».',
    example: { ar: 'فِي بَيْتٍ', ru: 'в доме' },
  },
  {
    id: 'long-a',
    name: 'Долгое «а»',
    arName: 'مَدٌّ بِالْأَلِف',
    sample: 'بَا',
    reads: 'баа',
    rule: 'Фатха и после неё алиф. Звук «а» тянется вдвое дольше.',
    example: { ar: 'بَابٌ', ru: 'дверь' },
  },
  {
    id: 'long-i',
    name: 'Долгое «и»',
    arName: 'مَدٌّ بِالْيَاء',
    sample: 'بِي',
    reads: 'бии',
    rule: 'Кясра и после неё йа с сукуном или без знака. Звук «и» тянется вдвое дольше.',
    example: { ar: 'كَبِيرٌ', ru: 'большой' },
  },
  {
    id: 'long-u',
    name: 'Долгое «у»',
    arName: 'مَدٌّ بِالْوَاو',
    sample: 'بُو',
    reads: 'буу',
    rule: 'Дамма и после неё вау. Звук «у» тянется вдвое дольше.',
    example: { ar: 'نُورٌ', ru: 'свет' },
  },
];

export type Numeral = {
  /** Арабская цифра */
  digit: string;
  /** Обычная цифра */
  value: string;
  /** Число словом */
  word: string;
  /** Как читается */
  reads: string;
};

export const NUMERALS_REF: Numeral[] = [
  { digit: '٠', value: '0', word: 'صِفْرٌ', reads: 'сифр' },
  { digit: '١', value: '1', word: 'وَاحِدٌ', reads: 'вахид' },
  { digit: '٢', value: '2', word: 'اِثْنَانِ', reads: 'иснани' },
  { digit: '٣', value: '3', word: 'ثَلَاثَةٌ', reads: 'саляса' },
  { digit: '٤', value: '4', word: 'أَرْبَعَةٌ', reads: 'арбаа' },
  { digit: '٥', value: '5', word: 'خَمْسَةٌ', reads: 'хамса' },
  { digit: '٦', value: '6', word: 'سِتَّةٌ', reads: 'ситта' },
  { digit: '٧', value: '7', word: 'سَبْعَةٌ', reads: 'сабаа' },
  { digit: '٨', value: '8', word: 'ثَمَانِيَةٌ', reads: 'саманийа' },
  { digit: '٩', value: '9', word: 'تِسْعَةٌ', reads: 'тисаа' },
  { digit: '١٠', value: '10', word: 'عَشَرَةٌ', reads: 'ашара' },
  { digit: '٢٠', value: '20', word: 'عِشْرُونَ', reads: 'ишруна' },
  { digit: '١٠٠', value: '100', word: 'مِائَةٌ', reads: 'миа' },
  { digit: '١٠٠٠', value: '1000', word: 'أَلْفٌ', reads: 'альф' },
];

export type NumberSample = { digits: string; value: string; ru: string };

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** 2026 → ٢٠٢٦ */
export const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

const UNITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const THOUSANDS = ['', 'тысяча', 'две тысячи', 'три тысячи', 'четыре тысячи', 'пять тысяч', 'шесть тысяч', 'семь тысяч', 'восемь тысяч', 'девять тысяч'];

/** Число от 0 до 9999 словами по-русски: 786 → «семьсот восемьдесят шесть» */
export function russianNumber(n: number): string {
  if (n === 0) return UNITS[0];
  const words: string[] = [];
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (th) words.push(THOUSANDS[th]);
  if (h) words.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]);
  else {
    if (rest >= 20) words.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) words.push(UNITS[rest % 10]);
  }
  return words.join(' ');
}

const sample = (n: number): NumberSample => ({ digits: toArabicDigits(n), value: String(n), ru: russianNumber(n) });

/** Четыре новых числа: двузначное, ещё одно двузначное, трёхзначное и четырёхзначное */
export function randomSamples(random: () => number): NumberSample[] {
  const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  return [sample(between(11, 49)), sample(between(50, 99)), sample(between(100, 999)), sample(between(1000, 9999))];
}

/** Примеры, чтобы потренироваться читать числа */
export const NUMBER_SAMPLES: NumberSample[] = [
  { digits: '٢٠٢٦', value: '2026', ru: 'год' },
  { digits: '١٤', value: '14', ru: 'четырнадцать' },
  { digits: '٣٥', value: '35', ru: 'тридцать пять' },
  { digits: '٧٨٦', value: '786', ru: 'семьсот восемьдесят шесть' },
];
