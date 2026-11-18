import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ar, BackRow, Screen, T } from '@/ui/kit';
import { useColors } from '@/ui/theme';

// Слова намаза: арабский текст, чтение русскими буквами и смысл. Порядок — как в намазе

type Line = { ar: string; tr: string; ru: string };
type Part = { id: string; title: string; when: string; lines: Line[] };

const PARTS: Part[] = [
  { id: 'takbir', title: 'Такбир', when: 'В начале намаза и при каждом переходе', lines: [
    { ar: 'اللَّهُ أَكْبَرُ', tr: 'Аллаху акбар', ru: 'Аллах велик' },
  ] },
  { id: 'istiftah', title: 'Начальная мольба', when: 'После первого такбира', lines: [
    { ar: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلَا إِلَٰهَ غَيْرُكَ', tr: 'Субханака-Ллахумма ва бихамдика, ва табаракя-смука, ва та‘аля джаддука, ва ля иляха гайрук', ru: 'Пречист Ты, о Аллах, и хвала Тебе. Благословенно имя Твоё, превыше всего величие Твоё, и нет божества, кроме Тебя' },
  ] },
  { id: 'fatiha', title: 'Сура аль-Фатиха', when: 'В каждом ракаате', lines: [
    { ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', tr: 'Бисмилляхи-р-рахмани-р-рахим', ru: 'Во имя Аллаха, Милостивого, Милосердного' },
    { ar: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', tr: 'Аль-хамду лилляхи раббиль-‘алямин', ru: 'Хвала Аллаху, Господу миров' },
    { ar: 'الرَّحْمَٰنِ الرَّحِيمِ', tr: 'Ар-рахмани-р-рахим', ru: 'Милостивому, Милосердному' },
    { ar: 'مَالِكِ يَوْمِ الدِّينِ', tr: 'Малики яумид-дин', ru: 'Властелину Дня воздаяния' },
    { ar: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', tr: 'Ийяка на‘буду ва ийяка наста‘ин', ru: 'Тебе одному мы поклоняемся и у Тебя одного просим помощи' },
    { ar: 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ', tr: 'Ихдина-с-сырата-ль-мустакым', ru: 'Веди нас прямым путём' },
    { ar: 'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ', tr: 'Сырата-ллязина ан‘амта ‘алейхим, гайриль-магдуби ‘алейхим ва ля-д-даллин', ru: 'путём тех, кого Ты облагодетельствовал, — не тех, на кого пал гнев, и не заблудших' },
  ] },
  { id: 'ruku', title: 'Поясной поклон (руку‘)', when: 'Три раза в поклоне', lines: [
    { ar: 'سُبْحَانَ رَبِّيَ الْعَظِيمِ', tr: 'Субхана раббияль-‘азым', ru: 'Пречист мой Великий Господь' },
  ] },
  { id: 'rise', title: 'Выпрямление после поклона', when: 'Поднимаясь и стоя прямо', lines: [
    { ar: 'سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ', tr: 'Сами‘а-Ллаху лиман хамидах', ru: 'Аллах слышит того, кто воздаёт Ему хвалу' },
    { ar: 'رَبَّنَا وَلَكَ الْحَمْدُ', tr: 'Раббана ва лякаль-хамд', ru: 'Господь наш, Тебе хвала' },
  ] },
  { id: 'sujud', title: 'Земной поклон (суджуд)', when: 'Три раза в каждом земном поклоне', lines: [
    { ar: 'سُبْحَانَ رَبِّيَ الْأَعْلَى', tr: 'Субхана раббияль-а‘ля', ru: 'Пречист мой Всевышний Господь' },
  ] },
  { id: 'tashahhud', title: 'Ташаххуд', when: 'Сидя после второго и последнего ракаата', lines: [
    { ar: 'التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ', tr: 'Ат-тахийяту лилляхи ва-с-саляваату ва-т-таййибат', ru: 'Приветствия, молитвы и благие слова — Аллаху' },
    { ar: 'السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ', tr: 'Ас-саляму ‘алейка аййуха-н-набийю ва рахмату-Ллахи ва баракятух', ru: 'Мир тебе, о Пророк, милость Аллаха и Его благословения' },
    { ar: 'السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ', tr: 'Ас-саляму ‘алейна ва ‘аля ‘ибади-Ллахи-с-салихин', ru: 'Мир нам и праведным рабам Аллаха' },
    { ar: 'أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ', tr: 'Ашхаду ан ля иляха илля-Ллах, ва ашхаду анна Мухаммадан ‘абдуху ва расулюх', ru: 'Свидетельствую, что нет божества, кроме Аллаха, и свидетельствую, что Мухаммад — Его раб и посланник' },
  ] },
  { id: 'salam', title: 'Завершение (салям)', when: 'Поворачивая голову направо, затем налево', lines: [
    { ar: 'السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ', tr: 'Ас-саляму ‘алейкум ва рахмату-Ллах', ru: 'Мир вам и милость Аллаха' },
  ] },
];

export default function NamazScreen() {
  const c = useColors();
  const [open, setOpen] = useState<string | null>('takbir');
  const [showTr, setShowTr] = useState(true);
  return (
    <Screen testID="namaz">
      <BackRow />
      <T size={26} weight="bold">Учим намаз</T>
      <T tone="muted" style={{ lineHeight: 22 }}>
        Слова намаза по-арабски с чтением и смыслом. Это перевод смысла, а не точный перевод. Как совершать намаз по вашему мазхабу — уточняйте у имама.
      </T>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: showTr }} onPress={() => setShowTr(!showTr)} style={{ alignSelf: 'flex-start' }} testID="namaz-tr">
        <T size={14} weight="bold" tone="accent">{showTr ? 'Скрыть чтение' : 'Показать чтение'} · проверьте себя</T>
      </Pressable>
      {PARTS.map((part, i) => {
        const on = open === part.id;
        return (
          <View key={part.id} style={{ borderRadius: 20, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: c.surface, overflow: 'hidden' }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : part.id)} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} testID={`namaz-${part.id}`}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: on ? c.accent : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <T size={15} weight="bold" style={{ color: on ? c.onAccent : c.accent }}>{i + 1}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={17} weight="bold">{part.title}</T>
                <T size={13} tone="muted">{part.when}</T>
              </View>
              <T size={18} tone="muted">{on ? '▴' : '▾'}</T>
            </Pressable>
            {on ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>
                {part.lines.map((l) => (
                  <View key={l.ar} style={{ gap: 4 }}>
                    <Ar size={28} bold style={{ textAlign: 'right' }}>{l.ar}</Ar>
                    {showTr ? <T size={16} weight="bold" tone="accent">{l.tr}</T> : null}
                    <T size={15} tone="muted" style={{ lineHeight: 21 }}>{l.ru}</T>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}
