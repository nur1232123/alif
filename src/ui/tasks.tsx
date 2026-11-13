import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { BuildTask, ChoiceTask, IntroTask, MatchTask, Option, ReadTask, TipTask } from '@/lib/plan';
import { playSfx } from '@/lib/sfx';
import { say, sayAll } from '@/lib/speech';
import { usePremium } from '@/lib/premium';
import { askTutor, TUTOR_ERRORS, TUTOR_LIMIT_TEXT, tutorEnabled } from '@/lib/tutor';
import { Ar, Button, GlyphCard, Khatam, ListenButton, PlayGlyph, T, useSlow, useVoiceMissing, VoiceNotice, WAKING_TEXT } from './kit';
import { fonts, useColors } from './theme';

const E2E = process.env.EXPO_PUBLIC_E2E === '1';

export type Slots = { body: React.ReactNode; footer: React.ReactNode };

/** Нижняя панель после ответа, как в уроках: зелёная или красная */
/** После ошибки ИИ-учитель объясняет, почему ответ неверный */
function WhyButton({ question }: { question: string }) {
  const c = useColors();
  const { tutorLeft, spendTutor } = usePremium();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'limit'>('idle');
  const slow = useSlow(state === 'loading');
  const [text, setText] = useState('');
  const ask = async () => {
    if (tutorLeft <= 0) {
      setState('limit');
      return;
    }
    setState('loading');
    const reply = await askTutor([{ role: 'user', text: question }]);
    if (!reply.ok && reply.reason === 'limit') {
      setState('limit');
      return;
    }
    if (reply.ok) spendTutor();
    setText(reply.ok ? reply.text : TUTOR_ERRORS[reply.reason]);
    setState('done');
  };
  if (state === 'limit') {
    return (
      <View style={{ gap: 6, padding: 12, borderRadius: 12, backgroundColor: c.surface }} testID="why-limit">
        <T size={15} style={{ lineHeight: 22 }}>{TUTOR_LIMIT_TEXT}</T>
        <Pressable accessibilityRole="button" onPress={() => router.push('/premium')} style={{ minHeight: 36, justifyContent: 'center' }} testID="why-premium">
          <T weight="bold" tone="accent">Открыть Премиум</T>
        </Pressable>
      </View>
    );
  }
  if (state === 'idle') {
    return (
      <Pressable accessibilityRole="button" onPress={ask} testID="why" style={{ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }}>
        <T weight="bold" tone="bad">Почему? Спросить ИИ-учителя</T>
      </Pressable>
    );
  }
  if (state === 'loading') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
        <ActivityIndicator color={c.bad} />
        <T tone="muted" style={{ flexShrink: 1 }}>{slow ? WAKING_TEXT : 'Учитель думает…'}</T>
      </View>
    );
  }
  return (
    <ScrollView style={{ maxHeight: 200, borderRadius: 12, backgroundColor: c.surface }} contentContainerStyle={{ padding: 12 }} testID="why-answer">
      <T size={15} style={{ lineHeight: 23 }}>{text}</T>
    </ScrollView>
  );
}

function Feedback({ correct, explainAr, explainRu, onNext, label, question }: {
  correct: boolean;
  explainAr?: string;
  explainRu?: string;
  onNext: () => void;
  label: string;
  /** Вопрос для ИИ-учителя, если ответ неверный */
  question?: string;
}) {
  const c = useColors();
  useEffect(() => {
    playSfx(correct ? 'right' : 'wrong');
  }, [correct]);
  return (
    <View
      style={{ gap: 10, marginHorizontal: -20, marginBottom: -16, marginTop: -12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, backgroundColor: correct ? c.goodSoft : c.badSoft }}
      testID={correct ? 'feedback-right' : 'feedback-wrong'}
    >
      <T weight="bold" tone={correct ? 'good' : 'bad'} size={19}>{correct ? 'Правильно' : 'Неправильно'}</T>
      {explainAr || explainRu ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10 }}>
          {explainAr ? <Ar size={24} style={{ lineHeight: 38 }}>{explainAr}</Ar> : null}
          {explainRu ? <T style={{ flexShrink: 1 }}>{explainRu}</T> : null}
        </View>
      ) : null}
      {!correct && question && tutorEnabled ? <WhyButton question={question} /> : null}
      <Button label={label} onPress={onNext} tone={correct ? 'good' : 'bad'} testID="next" />
    </View>
  );
}

const describe = (o?: Option) => [o?.ar, o?.ru, o?.say].filter(Boolean).join(' / ') || '—';

export function useTip(task: TipTask, onDone: () => void): Slots {
  const c = useColors();
  return {
    body: (
      <View style={{ gap: 16, flex: 1, justifyContent: 'center' }}>
        <Khatam size={72} fill={c.accent}>
          <T size={26} weight="bold" style={{ color: c.onAccent, lineHeight: 32 }}>!</T>
        </Khatam>
        <T size={13} weight="bold" tone="accent">{task.label ?? 'ПРАВИЛО НЕДЕЛИ'}</T>
        <T size={22} weight="bold" style={{ lineHeight: 30 }}>{task.title}</T>
        <T size={18} style={{ lineHeight: 28 }}>{task.text}</T>
        {task.example ? (
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.soft }} testID="tip-example">
            <Ar size={34} style={{ lineHeight: 58 }}>{task.example.ar}</Ar>
            <T size={16} weight="medium" style={{ textAlign: 'center' }}>{task.example.ru}</T>
            <ListenButton text={task.example.ar} testID="tip-listen" />
          </View>
        ) : null}
        <VoiceNotice />
      </View>
    ),
    footer: <Button label="Понятно" onPress={onDone} testID="next" />,
  };
}

export function useIntro(task: IntroTask, onDone: () => void): Slots {
  const c = useColors();
  const { item } = task;
  const glyph = item.ar.length <= 4 ? 120 : item.ar.length <= 10 ? 60 : 38;
  useEffect(() => {
    say(item.say);
  }, [item]);
  return {
    body: (
      <View style={{ gap: 14 }}>
        <T size={13} weight="bold" tone="accent">НОВОЕ</T>
        <View style={{ backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, boxShadow: c.shadow, paddingVertical: 18, paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
          <Ar size={glyph} bold={item.ar.length <= 4} style={item.ar.length <= 4 ? { lineHeight: Math.round(glyph * 1.55) } : undefined}>{item.ar}</Ar>
          <T size={20} weight="bold" style={{ textAlign: 'center' }}>{item.ru}</T>
          <ListenButton text={item.say} testID="listen" />
        </View>
        {item.note ? <T tone="muted" style={{ textAlign: 'center' }}>{item.note}</T> : null}
        {item.example ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Слушать слово: ${item.example.ru}`}
            onPress={() => say(item.example!.ar)}
            testID="example"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.soft, opacity: pressed ? 0.75 : 1 })}
          >
            <PlayGlyph color={c.accent} size={11} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={12} tone="muted">Слово на эту букву</T>
              <T weight="medium">{item.example.ru}</T>
            </View>
            <Ar size={30} style={{ lineHeight: 48 }}>{item.example.ar}</Ar>
          </Pressable>
        ) : null}
        {item.forms ? (
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {item.forms.map((form) => (
              <View key={form.label} style={{ flexGrow: 1, flexBasis: '22%', minWidth: 72, alignItems: 'center', borderRadius: 12, backgroundColor: c.soft, paddingVertical: 6, paddingHorizontal: 4 }}>
                <Ar size={32}>{form.ar}</Ar>
                <T size={12} tone="muted" style={{ textAlign: 'center' }}>{form.label}</T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ),
    footer: <Button label="Дальше" onPress={onDone} testID="next" />,
  };
}

export function useRead(task: ReadTask, onDone: () => void): Slots {
  const c = useColors();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const { lines } = task;
  const allShown = lines.every((_, i) => open[i]);
  return {
    body: (
      <View style={{ gap: 12 }}>
        <T size={22} weight="bold" style={{ lineHeight: 30 }}>{task.title}</T>
        <T tone="muted" size={14}>Сначала попробуйте понять сами. Нажмите на строку, чтобы увидеть перевод.</T>
        <VoiceNotice />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => sayAll(lines.map((l) => l.ar))} testID="listen-all" style={{ minHeight: 44, justifyContent: 'center' }}>
            <T weight="medium" tone="accent">Слушать всё</T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(allShown ? {} : Object.fromEntries(lines.map((_, i) => [i, true])))}
            testID="toggle-translation"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T weight="medium" tone="accent">{allShown ? 'Скрыть перевод' : 'Показать перевод'}</T>
          </Pressable>
        </View>
        {lines.map((line, i) => (
          <View
            key={i}
            style={{
              backgroundColor: line.who === 'Б' ? c.soft : c.surface,
              borderRadius: 14,
              borderWidth: line.who === 'Б' ? 0 : 1,
              borderColor: c.line,
              padding: 12,
              gap: 4,
              marginLeft: line.who === 'Б' ? 28 : 0,
              marginRight: line.who === 'А' ? 28 : 0,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Слушать" hitSlop={8} onPress={() => say(line.ar)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
                <PlayGlyph color={c.accent} size={12} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityHint="Показать перевод" onPress={() => setOpen({ ...open, [i]: !open[i] })} style={{ flex: 1, minWidth: 0 }}>
                <Ar size={25} style={{ textAlign: 'right' }}>{line.ar}</Ar>
              </Pressable>
            </View>
            {open[i] ? <T size={15} tone="muted" style={{ paddingLeft: 46 }}>{line.ru}</T> : null}
          </View>
        ))}
      </View>
    ),
    footer: <Button label="Дальше" onPress={onDone} testID="next" />,
  };
}

const HEADINGS: Record<ChoiceTask['kind'], string> = {
  'see-hear': 'Какой голос читает это правильно?',
  'hear-see': 'Что вы услышали?',
  meaning: 'Что это значит?',
  reverse: 'Выберите по-арабски',
  form: 'Какая это буква?',
  'first-letter': 'С какой буквы начинается слово?',
  text: 'Выберите правильный ответ',
  reply: 'Что ответить?',
  number: 'Какое это число?',
  'number-ar': 'Найдите это число',
};

function OptionCard({ option, index, task, selected, checked, noVoice, onPress }: {
  option: Option;
  index: number;
  task: ChoiceTask;
  selected: boolean;
  checked: boolean;
  noVoice: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const isAnswer = option.id === task.answerId;
  let border = selected ? c.accent : c.line;
  let bg = selected ? c.soft : c.surface;
  if (checked && isAnswer) { border = c.good; bg = c.goodSoft; }
  else if (checked && selected) { border = c.bad; bg = c.badSoft; }
  const audioOnly = task.kind === 'see-hear';
  const label = `${audioOnly ? 'Голос' : 'Вариант'} ${index + 1}`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: checked }}
      disabled={checked && !audioOnly}
      onPress={onPress}
      testID={E2E ? (isAnswer ? 'opt-right' : 'opt-wrong') : `opt-${index}`}
      style={({ pressed }) => ({
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: border,
        backgroundColor: bg,
        boxShadow: selected || checked ? undefined : c.shadow,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {audioOnly ? (
        <>
          <PlayGlyph color={c.accent} />
          <T weight="medium" size={17}>{label}</T>
          {noVoice ? <Ar size={26}>{option.say}</Ar> : null}
        </>
      ) : option.ar ? (
        <Ar size={option.ar.length > 12 ? 25 : 38} style={{ flexShrink: 1 }}>{option.ar}</Ar>
      ) : (
        <T weight="medium" size={17} style={{ textAlign: 'center' }}>{option.ru}</T>
      )}
    </Pressable>
  );
}

export function useChoice(task: ChoiceTask, last: boolean, onDone: (correct: boolean) => void): Slots {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const noVoice = useVoiceMissing();
  const correct = selected === task.answerId;
  const onlySound = task.kind === 'hear-see';

  useEffect(() => {
    if (onlySound && task.say) say(task.say);
  }, [task, onlySound]);

  const choose = (option: Option) => {
    if (option.say) say(option.say);
    if (!checked) setSelected(option.id);
  };

  return {
    body: (
      <View style={{ gap: 14 }}>
        <T size={20} weight="bold" style={{ lineHeight: 28 }}>{HEADINGS[task.kind]}</T>
        <VoiceNotice />
        <View style={{ alignItems: 'center', gap: 6 }}>
          {task.ar ? <GlyphCard text={task.ar} /> : null}
          {onlySound && noVoice ? <Ar size={36}>{task.say}</Ar> : null}
          {task.ru ? <T size={20} weight="medium" style={{ textAlign: 'center' }}>{task.ru}</T> : null}
          {task.say ? <ListenButton text={task.say} label={onlySound ? 'Послушать ещё раз' : 'Слушать'} testID="listen" /> : null}
          {task.kind === 'see-hear' ? <T size={14} tone="muted">Нажмите на голос, чтобы услышать его</T> : null}
        </View>
        <View style={{ gap: 10 }} accessibilityRole="radiogroup">
          {task.options.map((option, i) => (
            <OptionCard key={option.id} option={option} index={i} task={task} selected={selected === option.id} checked={checked} noVoice={noVoice} onPress={() => choose(option)} />
          ))}
        </View>
      </View>
    ),
    footer: checked ? (
      <Feedback
        correct={correct}
        explainAr={task.explainAr}
        explainRu={task.explainRu}
        label={last ? 'Завершить' : 'Дальше'}
        onNext={() => onDone(correct)}
        question={[
          `Задание: «${HEADINGS[task.kind]}».`,
          task.ar ? `На экране: ${task.ar}.` : task.say ? `Звучало: ${task.say}.` : '',
          task.ru ? `Вопрос: ${task.ru}.` : '',
          `Я выбрал: ${describe(task.options.find((o) => o.id === selected))}.`,
          `Правильно: ${describe(task.options.find((o) => o.id === task.answerId))}.`,
          'Объясни коротко, почему мой ответ неверный и как запомнить правильный.',
        ].filter(Boolean).join(' ')}
      />
    ) : (
      <Button label="Проверить" onPress={() => setChecked(true)} disabled={!selected} testID="check" />
    ),
  };
}

function Tile({ text, used, onPress, testID, arabic }: { text: string; used?: boolean; onPress: () => void; testID?: string; arabic?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: !!used }}
      disabled={used}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 52,
        minWidth: 52,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: c.line,
        backgroundColor: used ? c.line : c.surface,
        boxShadow: used ? undefined : c.shadow,
        opacity: used ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {used ? (
        <View style={{ height: 34 }} />
      ) : arabic === false ? (
        <T weight="medium" size={15} style={{ textAlign: 'center' }}>{text}</T>
      ) : (
        <Text style={{ color: c.ink, fontFamily: fonts.arabic, fontSize: 24, lineHeight: 38, writingDirection: 'rtl' }}>{text}</Text>
      )}
    </Pressable>
  );
}

export function useMatch(task: MatchTask, last: boolean, onDone: () => void): Slots {
  const c = useColors();
  const pairs = task.pairs;
  const right = useMemo(() => [...pairs].sort((a, b) => a.ru.localeCompare(b.ru)), [pairs]);
  const left = useMemo(() => [...pairs].sort((a, b) => b.id.localeCompare(a.id)), [pairs]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const finished = solved.length === pairs.length;

  const pickLeft = (id: string, text: string) => {
    say(text);
    setPicked(id);
    setWrong(null);
  };
  const pickRight = (id: string) => {
    if (!picked) return;
    if (picked === id) {
      setSolved([...solved, id]);
      setWrong(null);
    } else {
      setWrong(id);
    }
    setPicked(null);
  };

  const cell = (active: boolean, isWrong: boolean, gone: boolean) => ({
    minHeight: 64,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    boxShadow: active || isWrong || gone ? undefined : c.shadow,
    borderColor: isWrong ? c.bad : active ? c.accent : c.line,
    backgroundColor: gone ? c.goodSoft : isWrong ? c.badSoft : active ? c.soft : c.surface,
    opacity: gone ? 0.5 : 1,
  });

  return {
    body: (
      <View style={{ gap: 14 }}>
        <T size={20} weight="bold" style={{ lineHeight: 28 }}>Соедините пары</T>
        <T size={14} tone="muted">Нажмите на арабское слово, потом на его значение.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
            {right.map((x) => {
              const gone = solved.includes(x.id);
              return (
                <Pressable key={x.id} accessibilityRole="button" disabled={gone} onPress={() => pickRight(x.id)} testID={E2E ? `match-ru-${x.id}` : undefined} style={cell(false, wrong === x.id, gone)}>
                  <T weight="medium" size={15} style={{ textAlign: 'center' }}>{x.ru}</T>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
            {left.map((x) => {
              const gone = solved.includes(x.id);
              return (
                <Pressable key={x.id} accessibilityRole="button" disabled={gone} onPress={() => pickLeft(x.id, x.say)} testID={E2E ? `match-ar-${x.id}` : undefined} style={cell(picked === x.id, false, gone)}>
                  <Ar size={x.ar.length <= 4 ? 34 : x.ar.length > 12 ? 20 : 26} bold={x.ar.length <= 4} style={{ lineHeight: x.ar.length <= 4 ? 52 : 40 }}>{x.ar}</Ar>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    ),
    footer: <Button label={last ? 'Завершить' : 'Дальше'} onPress={onDone} disabled={!finished} testID="next" />,
  };
}

export function useBuild(task: BuildTask, last: boolean, onDone: (correct: boolean) => void): Slots {
  const c = useColors();
  const [chosen, setChosen] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const noVoice = useVoiceMissing();
  const answerText = task.answer.join(task.joined ? '' : ' ');
  const text = chosen.map((i) => task.bank[i]).join(task.joined ? '' : ' ');
  const correct = text === answerText;

  // Плитки для автотеста помечены порядком правильного ответа
  const tileId = (index: number) => {
    if (!E2E) return `tile-${index}`;
    const order: number[] = [];
    task.answer.forEach((part) => {
      order.push(task.bank.findIndex((t, i) => t === part && !order.includes(i)));
    });
    const place = order.indexOf(index);
    return place >= 0 ? `tile-right-${place}` : 'tile-extra';
  };

  return {
    body: (
      <View style={{ gap: 14 }}>
        <T size={20} weight="bold" style={{ lineHeight: 28 }}>{task.joined ? 'Соберите слово' : 'Соберите по-арабски'}</T>
        <VoiceNotice />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <T size={20} weight="medium" style={{ textAlign: 'center' }}>{task.ru}</T>
          {!noVoice ? <ListenButton text={task.say} testID="listen" /> : null}
        </View>
        <View style={{ minHeight: 76, borderBottomWidth: 2, borderBottomColor: c.line, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }} testID="build-answer">
          {text ? <Ar size={30}>{text}</Ar> : <T size={14} tone="muted">Нажимайте на плитки по порядку</T>}
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {task.bank.map((tile, i) => (
            <Tile key={i} text={tile} used={chosen.includes(i)} onPress={() => !checked && setChosen([...chosen, i])} testID={tileId(i)} />
          ))}
        </View>
        {chosen.length > 0 && !checked ? (
          <Pressable accessibilityRole="button" onPress={() => setChosen(chosen.slice(0, -1))} testID="tile-undo" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
            <T weight="medium" tone="accent">Убрать последнюю</T>
          </Pressable>
        ) : null}
      </View>
    ),
    footer: checked ? (
      <Feedback
        correct={correct}
        explainAr={answerText}
        explainRu={task.ru}
        label={last ? 'Завершить' : 'Дальше'}
        onNext={() => onDone(correct)}
        question={`Нужно было собрать по-арабски «${task.ru}». Правильно: ${answerText}. Я собрал: ${text || '—'}. Объясни коротко мою ошибку.`}
      />
    ) : (
      <Button label="Проверить" onPress={() => setChecked(true)} disabled={chosen.length === 0} testID="check" />
    ),
  };
}
