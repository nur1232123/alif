import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import type { Week } from '@/data/types';
import { dayKey } from './progress';
import { E2E, setRcUser, TEST_MODE } from './server';

/** Бесплатно: этапы 1–2 (алфавит и чтение). С этапа 3 нужен Премиум */
export const FREE_STAGES = 2;
/** Сколько вопросов ИИ-учителю в день без подписки */
export const FREE_TUTOR_PER_DAY = 3;
/** Название доступа в RevenueCat */
export const ENTITLEMENT = 'premium';

export const isPaidWeek = (week: Pick<Week, 'stageId'>) => week.stageId > FREE_STAGES;

// Публичные ключи RevenueCat. Они созданы для приложения, секретов в них нет
const RC_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
  default: '',
}) ?? '';
const storeReady = Platform.OS !== 'web' && RC_KEY.length > 0;

export type PlanId = 'annual' | 'monthly';
export type Plan = {
  id: PlanId;
  /** Цена в валюте магазина, например «$29.99» */
  price: string;
  /** Для годовой: сколько выходит в месяц */
  perMonth: string | null;
  /** Бесплатный период, например «7 дней», если магазин его даёт */
  trial: string | null;
  pkg: PurchasesPackage | null;
};

// Цены по умолчанию, пока магазин не прислал свои (и в режиме проверки)
const FALLBACK: Plan[] = [
  { id: 'annual', price: '$29.99', perMonth: '$2.50', trial: '7 дней', pkg: null },
  { id: 'monthly', price: '$4.99', perMonth: null, trial: '7 дней', pkg: null },
];

export type PurchaseResult = 'ok' | 'cancelled' | 'unavailable' | 'error';

type Saved = {
  /** Последний известный статус подписки, чтобы без интернета не закрывать уроки */
  active: boolean;
  tutor: { day: string; count: number } | null;
  /** Режим проверки: включён ли Премиум */
  testPremium: boolean;
};

const KEY = 'alif.premium.v1';
const EMPTY: Saved = { active: false, tutor: null, testPremium: true };

type Ctx = {
  isPremium: boolean;
  plans: Plan[];
  /** Магазин подключён: можно оплатить по-настоящему */
  storeReady: boolean;
  purchase: (id: PlanId) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  tutorLeft: number;
  spendTutor: () => void;
  testPremium: boolean;
  setTestPremium: (on: boolean) => void;
};

const PremiumContext = createContext<Ctx | null>(null);

const UNITS: Record<string, [string, string, string]> = {
  DAY: ['день', 'дня', 'дней'],
  WEEK: ['неделя', 'недели', 'недель'],
  MONTH: ['месяц', 'месяца', 'месяцев'],
  YEAR: ['год', 'года', 'лет'],
};

/** «7 дней», «1 неделя»: русские окончания для срока пробного периода */
export function periodText(count: number, unit: string) {
  const forms = UNITS[unit] ?? UNITS.DAY;
  const n10 = count % 10;
  const n100 = count % 100;
  const form = n10 === 1 && n100 !== 11 ? forms[0] : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? forms[1] : forms[2];
  return `${count} ${form}`;
}

function planFrom(id: PlanId, pkg: PurchasesPackage): Plan {
  const product = pkg.product;
  // iPhone: бесплатный период в introPrice. Android: в бесплатной фазе предложения по умолчанию
  const intro = product.introPrice;
  const free = product.defaultOption?.freePhase?.billingPeriod;
  const trial =
    intro && intro.price === 0
      ? periodText(intro.periodNumberOfUnits, intro.periodUnit)
      : free
        ? periodText(free.value, free.unit)
        : null;
  const perMonth = id === 'annual' && product.pricePerMonthString ? product.pricePerMonthString : null;
  return { id, price: product.priceString, perMonth, trial, pkg };
}

const activeIn = (info: CustomerInfo) => info.entitlements.active[ENTITLEMENT] !== undefined;

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK);
  const latest = useRef(saved);

  const write = useCallback((next: Saved) => {
    latest.current = next;
    setSaved(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const next = { ...EMPTY, ...(JSON.parse(raw) as Partial<Saved>) };
        latest.current = next;
        setSaved(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    const onInfo = (info: CustomerInfo) => write({ ...latest.current, active: activeIn(info) });
    try {
      Purchases.configure({ apiKey: RC_KEY });
      Purchases.addCustomerInfoUpdateListener(onInfo);
      Purchases.getCustomerInfo().then(onInfo).catch(() => {});
      // Сервер по этому номеру сам проверяет Премиум, подделать его в приложении нельзя
      Purchases.getAppUserID().then(setRcUser).catch(() => {});
      Purchases.getOfferings()
        .then((offerings) => {
          const current = offerings.current;
          if (!current) return;
          const next: Plan[] = [];
          if (current.annual) next.push(planFrom('annual', current.annual));
          if (current.monthly) next.push(planFrom('monthly', current.monthly));
          if (next.length) setPlans(next);
        })
        .catch(() => {});
    } catch {
      // Магазин недоступен (например, Expo Go без ключа): работаем как бесплатная версия
    }
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(onInfo);
      } catch {}
    };
  }, [write]);

  const testOverride = TEST_MODE || E2E;
  const isPremium = testOverride ? saved.testPremium : saved.active;

  const purchase = useCallback(
    async (id: PlanId): Promise<PurchaseResult> => {
      const plan = plans.find((p) => p.id === id);
      if (!storeReady || !plan?.pkg) {
        // В режиме проверки покупка изображается, чтобы посмотреть, что откроется
        if (testOverride) {
          write({ ...latest.current, testPremium: true });
          return 'ok';
        }
        return 'unavailable';
      }
      try {
        const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
        const active = activeIn(customerInfo);
        write({ ...latest.current, active });
        return active ? 'ok' : 'error';
      } catch (error) {
        return (error as { userCancelled?: boolean })?.userCancelled ? 'cancelled' : 'error';
      }
    },
    [plans, testOverride, write],
  );

  const restore = useCallback(async () => {
    if (!storeReady) return testOverride ? latest.current.testPremium : false;
    try {
      const info = await Purchases.restorePurchases();
      const active = activeIn(info);
      write({ ...latest.current, active });
      return active;
    } catch {
      return false;
    }
  }, [testOverride, write]);

  const today = dayKey(new Date());
  const usedToday = saved.tutor?.day === today ? saved.tutor.count : 0;
  const tutorLeft = isPremium ? Infinity : Math.max(0, FREE_TUTOR_PER_DAY - usedToday);

  const spendTutor = useCallback(() => {
    if (isPremium) return;
    const day = dayKey(new Date());
    const prev = latest.current.tutor;
    const count = prev?.day === day ? prev.count + 1 : 1;
    write({ ...latest.current, tutor: { day, count } });
  }, [isPremium, write]);

  const setTestPremium = useCallback((on: boolean) => write({ ...latest.current, testPremium: on }), [write]);

  const value = useMemo<Ctx>(
    () => ({ isPremium, plans, storeReady, purchase, restore, tutorLeft, spendTutor, testPremium: saved.testPremium, setTestPremium }),
    [isPremium, plans, purchase, restore, tutorLeft, spendTutor, saved.testPremium, setTestPremium],
  );
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium вне PremiumProvider');
  return ctx;
}
