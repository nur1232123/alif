export type Item = {
  id: string;
  /** Что видит ученик */
  ar: string;
  /** Что произносит голос. Для букв это название буквы. */
  say: string;
  /** Русское название, чтение или перевод */
  ru: string;
  /** Как произносить или что запомнить */
  note?: string;
  /** Похожие элементы: из них берутся неправильные варианты */
  family?: string;
  /** Формы буквы в слове */
  forms?: { label: string; ar: string }[];
};

export type Line = { who?: 'А' | 'Б'; ar: string; ru: string };

export type TextQuestion = { q: string; right: string; wrong: [string, string] };

export type ReplyQuestion = { line: string; right: string; wrong: [string, string] };

export type WeekKind = 'letters' | 'syllables' | 'words' | 'text' | 'dialogue';

export type Week = {
  n: number;
  stageId: number;
  title: string;
  kind: WeekKind;
  /** Короткое правило перед первым уроком недели */
  tip?: string;
  items: Item[];
  /** Неделя повторения: новых элементов нет */
  review?: boolean;
  /** Большой экзамен в конце недели */
  bigExam?: boolean;
  lines?: Line[];
  textQuestions?: TextQuestion[];
  replyQuestions?: ReplyQuestion[];
};

export type Stage = {
  id: number;
  numeral: string;
  title: string;
  ar: string;
  subtitle: string;
  weeks: Week[];
};
