import { format, formatDistanceToNow, differenceInHours, differenceInDays, parseISO, isValid } from 'date-fns';
import { th as thLocale, enUS } from 'date-fns/locale';

function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const d = parseISO(input);
  return isValid(d) ? d : new Date(input);
}

export function formatDate(date: string | Date, language: 'th' | 'en'): string {
  const d = toDate(date);
  const locale = language === 'th' ? thLocale : enUS;
  return format(d, 'd MMM yyyy', { locale });
}

export function formatDateTime(date: string | Date, language: 'th' | 'en'): string {
  const d = toDate(date);
  const locale = language === 'th' ? thLocale : enUS;
  return format(d, 'd MMM yyyy, HH:mm', { locale });
}

export function formatTime(date: string | Date): string {
  return format(toDate(date), 'HH:mm');
}

export function isWithin72Hours(date: string | Date): boolean {
  const hours = differenceInHours(new Date(), toDate(date));
  return hours >= 0 && hours <= 72;
}

export function hoursRemaining72(date: string | Date): number {
  const hours = differenceInHours(new Date(), toDate(date));
  return Math.max(0, 72 - hours);
}

export function daysSince(date: string | Date): number {
  return differenceInDays(new Date(), toDate(date));
}

export function daysUntil(date: string | Date): number {
  return differenceInDays(toDate(date), new Date());
}

export function relativeTime(date: string | Date, language: 'th' | 'en'): string {
  const locale = language === 'th' ? thLocale : enUS;
  return formatDistanceToNow(toDate(date), { addSuffix: true, locale });
}
