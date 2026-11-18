import { useEffect, useState } from 'react';
import { Linking, Modal, View } from 'react-native';
import { checkAppUpdate, snoozeAppUpdate, type AppRelease } from '@/lib/app-update';
import { Fox } from './fox';
import { Button, T } from './kit';
import { useColors } from './theme';

/** Окно «Вышла новая версия» со ссылкой прямо на APK, без захода на сайт */
export function UpdateBanner() {
  const c = useColors();
  const [rel, setRel] = useState<AppRelease | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { checkAppUpdate().then((r) => { if (alive) setRel(r); }); }, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  if (!rel) return null;
  const later = () => { snoozeAppUpdate(); setRel(null); };
  const download = () => { setStarted(true); Linking.openURL(rel.apk).catch(() => {}); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: c.bg, borderRadius: 28, padding: 22, gap: 12, alignItems: 'center' }} testID="update-banner">
          <Fox pose={started ? 'happy' : 'wow'} size={110} />
          <T size={22} weight="bold" style={{ textAlign: 'center' }}>Вышла новая версия {rel.version}</T>
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            {rel.notes.slice(0, 5).map((n) => <T key={n} size={15} style={{ lineHeight: 21 }}>• {n}</T>)}
          </View>
          {started ? (
            <T size={14} tone="muted" style={{ textAlign: 'center', lineHeight: 20 }}>
              Когда файл скачается, откройте его и нажмите «Установить». Если телефон предупредит, нажмите «Всё равно установить». Прогресс сохранится.
            </T>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <Button label={started ? 'Скачать ещё раз' : 'Скачать обновление'} onPress={download} testID="update-download" />
            <Button label="Потом" kind="quiet" onPress={later} testID="update-later" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
