import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, addMonths, isSameMonth } from 'date-fns';
import { th as thLocale, enUS } from 'date-fns/locale';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import { formatDate } from '../../utils/dateHelpers';
import type { CareEvent } from '../../utils/careEventsTimeline';
import {
  buildMonthGrid,
  getEventsForLocalDay,
  countHiddenNormalLogsInMonth,
  computeHbDelta,
  findMostRecentActivityMonth,
  cellTintForMonthCell,
  type MonthCell,
  type TimelineFilters,
  type CellTint,
} from '../../utils/careEventsGrouping';
import FullScreenImageViewer from '../common/FullScreenImageViewer';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';

export interface CareEventsTimelineProps {
  events: CareEvent[];
  totalInWindow: number;
  language: 'th' | 'en';
}

const OUTCOME_KEY: Record<'normal' | 'monitor' | 'urgent', TranslationKey> = {
  normal: 'clinician.detail.timeline.outcome.normal' as TranslationKey,
  monitor: 'clinician.detail.timeline.outcome.monitor' as TranslationKey,
  urgent: 'clinician.detail.timeline.outcome.urgent' as TranslationKey,
};

const WEEKDAY_KEYS: ReadonlyArray<TranslationKey> = [
  'clinician.detail.timeline.cal.weekday.sun' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.mon' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.tue' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.wed' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.thu' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.fri' as TranslationKey,
  'clinician.detail.timeline.cal.weekday.sat' as TranslationKey,
];

function outcomeTint(outcome: 'normal' | 'monitor' | 'urgent'): string {
  if (outcome === 'urgent') return COLORS.statusUrgent;
  if (outcome === 'monitor') return COLORS.statusMonitor;
  return COLORS.statusNormal;
}

function cellBgFor(tint: CellTint): string {
  // Mid-saturation Tint tier (not the very-faint Bg tier). The Bg colors
  // are designed for small inline chips against a white surface; on a
  // whole calendar cell at 42px they wash out to near-white. Tint sits
  // between Bg and the saturated source, readable as a fill without
  // overpowering the day number text.
  if (tint === 'urgent') return COLORS.statusUrgentTint;
  if (tint === 'monitor') return COLORS.statusMonitorTint;
  if (tint === 'normal') return COLORS.statusNormalTint;
  if (tint === 'tx') return COLORS.primaryMuted;
  return COLORS.surface;
}

export default function CareEventsTimeline({
  events,
  totalInWindow,
  language,
}: CareEventsTimelineProps) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();

  const today = useMemo(() => new Date(), []);
  // Open on the most-recent-activity month so the clinician sees content
  // immediately. If today's month is empty but last month was busy, we
  // land on last month and the "Today" button surfaces for quick return.
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    findMostRecentActivityMonth(events, today)
  );
  // True once the clinician has used prev/next/Today. Locks out further
  // auto-jumps so realtime event arrivals don't yank them off their
  // chosen month mid-task.
  const userNavigatedRef = useRef(false);
  // Track the events array identity so we can re-jump when the parent
  // supplies an entirely different patient's events (the parent also
  // passes a key={userId} so the component fully remounts on patient
  // switch; this effect is the safety net for in-place hydration).
  useEffect(() => {
    if (userNavigatedRef.current) return;
    if (events.length === 0) return;
    const target = findMostRecentActivityMonth(events, today);
    setViewMonth((prev) => (isSameMonth(prev, target) ? prev : target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [showNormalsInline, setShowNormalsInline] = useState(false);
  const [filters, setFilters] = useState<TimelineFilters>({
    showNormals: false,
    urgentOnly: false,
    // windowDays is kept on the shape for type compat with the grouping
    // helpers (the calendar replaces window-based filtering — see month nav).
    windowDays: 0,
  });
  const [configOpen, setConfigOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoadingFor, setViewerLoadingFor] = useState<string | null>(null);

  const effectiveShowNormals = filters.showNormals || showNormalsInline;

  // Pre-filter events once. Used by both grid painting and day-detail
  // expansion so the two views stay consistent.
  const filteredEvents = useMemo(
    () =>
      events.filter((ev) => {
        if (filters.urgentOnly) {
          return ev.kind === 'symptom_log' && ev.log?.outcome === 'urgent';
        }
        if (
          !effectiveShowNormals &&
          ev.kind === 'symptom_log' &&
          ev.log?.outcome === 'normal'
        ) {
          return false;
        }
        return true;
      }),
    [events, filters.urgentOnly, effectiveShowNormals]
  );

  const grid = useMemo(
    () => buildMonthGrid(viewMonth, today, filteredEvents, 0),
    [viewMonth, today, filteredEvents]
  );

  const selectedEvents = useMemo(
    () =>
      selectedDayKey
        ? getEventsForLocalDay(filteredEvents, selectedDayKey)
        : [],
    [selectedDayKey, filteredEvents]
  );

  const hiddenNormalCount = useMemo(
    () =>
      countHiddenNormalLogsInMonth(events, viewMonth, {
        showNormals: effectiveShowNormals,
        urgentOnly: filters.urgentOnly,
      }),
    [events, viewMonth, effectiveShowNormals, filters.urgentOnly]
  );

  const locale = language === 'th' ? thLocale : enUS;
  const monthLabel = format(viewMonth, 'MMMM yyyy', { locale });
  const onCurrentMonth = isSameMonth(viewMonth, today);

  const prevMonth = () => {
    userNavigatedRef.current = true;
    setViewMonth((m) => addMonths(m, -1));
    setSelectedDayKey(null);
  };
  const nextMonth = () => {
    userNavigatedRef.current = true;
    setViewMonth((m) => addMonths(m, 1));
    setSelectedDayKey(null);
  };
  const goToday = () => {
    userNavigatedRef.current = true;
    setViewMonth(today);
    setSelectedDayKey(null);
  };

  const onCellTap = (cell: MonthCell) => {
    setSelectedDayKey((cur) => (cur === cell.dayKey ? null : cell.dayKey));
  };

  const openTransfusionPhoto = async (storedValue: string, txId: string) => {
    if (viewerLoadingFor) return;
    setViewerLoadingFor(txId);
    try {
      const svc = isMockMode ? mockServices : realTransfusionService;
      const uri = await svc.getTransfusionDocumentPhotoSignedUrl(storedValue);
      if (uri) setViewerUri(uri);
    } finally {
      setViewerLoadingFor(null);
    }
  };

  const symptomLabel = (raw: string): string => {
    const translated = t(('symptom.' + raw) as TranslationKey);
    return translated.startsWith('symptom.') ? raw : translated;
  };

  return (
    <View style={styles.section}>
      {/* Header — title + filter pill + gear */}
      <View style={styles.sectionHeader}>
        <Feather name="clock" size={14} color={COLORS.textLight} />
        <Text style={styles.sectionLabel}>
          {t('clinician.detail.timeline.title' as TranslationKey).toUpperCase()}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setFilters((f) => ({ ...f, urgentOnly: !f.urgentOnly }))}
            style={[styles.filterPill, filters.urgentOnly && styles.filterPillActive]}
            accessibilityRole="button"
            accessibilityLabel={t(
              'clinician.detail.timeline.filter.urgentOnly' as TranslationKey
            )}
            accessibilityState={{ selected: filters.urgentOnly }}
          >
            <Feather
              name="alert-triangle"
              size={11}
              color={filters.urgentOnly ? COLORS.statusUrgentText : COLORS.textSecondary}
            />
            <Text
              style={[
                styles.filterPillText,
                filters.urgentOnly && styles.filterPillTextActive,
              ]}
            >
              {t('clinician.detail.timeline.filter.urgentOnly' as TranslationKey)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfigOpen(true)}
            style={styles.configBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t(
              'clinician.detail.timeline.config.title' as TranslationKey
            )}
          >
            <Feather name="sliders" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity
          onPress={prevMonth}
          style={styles.monthNavBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Feather name="chevron-left" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={nextMonth}
          style={styles.monthNavBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Feather name="chevron-right" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        {!onCurrentMonth && (
          <TouchableOpacity
            onPress={goToday}
            style={styles.todayBtn}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.todayBtnText}>
              {t('clinician.detail.timeline.cal.today' as TranslationKey)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Weekday header */}
      <View style={styles.weekdayRow}>
        {WEEKDAY_KEYS.map((k, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {t(k)}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell) => {
              const isSelected = cell.dayKey === selectedDayKey;
              const dimmed = !cell.inViewMonth;
              const tint = cellTintForMonthCell(cell);
              const bg = cellBgFor(tint);
              // Slightly fade tinted cells in spillover months so the
              // current month still reads as the focal area.
              return (
                <TouchableOpacity
                  key={cell.dayKey}
                  onPress={() => onCellTap(cell)}
                  activeOpacity={0.7}
                  style={[
                    styles.cell,
                    { backgroundColor: bg },
                    dimmed && styles.cellDimmed,
                    isSelected && styles.cellSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={cell.dayKey}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.cellTop}>
                    <View
                      style={[
                        styles.dayNumWrap,
                        cell.isToday && styles.dayNumToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          dimmed && styles.dayNumDimmed,
                          cell.isToday && styles.dayNumTodayText,
                        ]}
                      >
                        {cell.dayNumber}
                      </Text>
                    </View>
                    <View style={styles.cellTopRight}>
                      {cell.hasReaction && <View style={styles.reactionDot} />}
                      {cell.hasTransfusion && (
                        <Feather name="droplet" size={9} color={COLORS.primary} />
                      )}
                      {cell.hasAppointment && (
                        <Feather
                          name="calendar"
                          size={9}
                          color={COLORS.textSecondary}
                          style={{ marginLeft: 1 }}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Day detail */}
      {selectedDayKey && (
        <View style={styles.dayDetail}>
          <View style={styles.dayDetailHeader}>
            <Text style={styles.dayDetailTitle}>
              {formatDate(selectedDayKey + 'T12:00:00Z', language)}
            </Text>
            <Text style={styles.dayDetailCount}>
              {selectedEvents.length > 0
                ? t('clinician.detail.timeline.cal.day.eventCount' as TranslationKey, {
                    count: selectedEvents.length,
                  })
                : ''}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedDayKey(null)}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Feather name="x" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          {selectedEvents.length === 0 ? (
            <Text style={styles.dayDetailEmpty}>
              {t('clinician.detail.timeline.cal.day.empty' as TranslationKey)}
            </Text>
          ) : (
            <View style={styles.dayDetailBody}>
              {selectedEvents.map((ev) => {
                const rowKey = selectedDayKey + ':' + ev.id;

                if (ev.kind === 'transfusion' && ev.transfusion) {
                  const tx = ev.transfusion;
                  const delta = computeHbDelta(tx);
                  const reaction = tx.reaction_noted === true;
                  const photo = tx.document_photo_url
                    ? { stored: tx.document_photo_url, id: tx.id }
                    : null;
                  return (
                    <View key={rowKey} style={styles.row}>
                      <View style={styles.iconWrap}>
                        {reaction && <View style={styles.rowReactionDot} />}
                        <Feather
                          name="droplet"
                          size={16}
                          color={reaction ? COLORS.statusUrgent : COLORS.primary}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {t('clinician.detail.timeline.tx' as TranslationKey, {
                            units: tx.units_received ?? '—',
                            hospital: tx.hospital ?? '',
                          })}
                        </Text>
                        {delta && (
                          <View style={styles.hbRow}>
                            <View style={styles.hbChip}>
                              <Text style={styles.hbChipText}>
                                {(delta.delta >= 0 ? '+' : '') + delta.delta.toFixed(1)}
                              </Text>
                            </View>
                            <Text style={styles.hbSubtext} numberOfLines={1}>
                              {t(
                                'clinician.detail.timeline.tx.hbDetail' as TranslationKey,
                                {
                                  pre: delta.pre.toFixed(1),
                                  post: delta.post.toFixed(1),
                                }
                              )}
                            </Text>
                          </View>
                        )}
                      </View>
                      {photo && (
                        <TouchableOpacity
                          onPress={() => openTransfusionPhoto(photo.stored, photo.id)}
                          hitSlop={8}
                          style={styles.photoBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'transfusion.documentPhoto.viewFull' as TranslationKey
                          )}
                        >
                          <Feather
                            name="image"
                            size={14}
                            color={
                              viewerLoadingFor === photo.id
                                ? COLORS.textLight
                                : COLORS.primary
                            }
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }

                if (ev.kind === 'symptom_log' && ev.log) {
                  const log = ev.log;
                  const tint = outcomeTint(log.outcome);
                  const localized = (log.symptoms ?? []).map(symptomLabel);
                  const hasSymptoms = localized.length > 0;
                  return (
                    <View key={rowKey} style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Feather name="activity" size={16} color={tint} />
                      </View>
                      <View style={styles.rowBody}>
                        <View style={styles.logTitleRow}>
                          <Text style={[styles.outcomeBadge, { color: tint }]}>
                            {t(OUTCOME_KEY[log.outcome])}
                          </Text>
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {hasSymptoms
                              ? localized.join(' · ')
                              : t(
                                  'clinician.detail.timeline.log.noSymptoms' as TranslationKey
                                )}
                          </Text>
                        </View>
                        {log.notes ? (
                          <Text style={styles.rowSubtext} numberOfLines={2}>
                            {log.notes}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                }

                if (ev.kind === 'appointment' && ev.appointment) {
                  return (
                    <View key={rowKey} style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Feather name="calendar" size={16} color={COLORS.textSecondary} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {t('clinician.detail.timeline.appt' as TranslationKey, {
                            hospital: ev.appointment.hospital ?? '',
                          })}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return null;
              })}
            </View>
          )}
        </View>
      )}

      {/* Hidden normals footer */}
      {hiddenNormalCount > 0 && !showNormalsInline && !filters.showNormals && (
        <TouchableOpacity
          onPress={() => setShowNormalsInline(true)}
          style={styles.hiddenNormalsRow}
          accessibilityRole="button"
        >
          <Feather name="eye" size={11} color={COLORS.textLight} />
          <Text style={styles.hiddenNormalsText}>
            {t(
              'clinician.detail.timeline.cal.hiddenNormalsMonth' as TranslationKey,
              { count: hiddenNormalCount }
            )}
          </Text>
        </TouchableOpacity>
      )}

      {/* Off-screen "older events" footer — kept for parity with the legacy
          card; totalInWindow includes events outside the current month so
          the count is informational, not navigational. */}
      {totalInWindow > 0 && (
        <Text style={styles.cohortNote}>
          {t('clinician.detail.timeline.more' as TranslationKey, { count: totalInWindow })}
        </Text>
      )}

      {/* Config bottom sheet */}
      <Modal
        visible={configOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfigOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setConfigOpen(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t('clinician.detail.timeline.config.title' as TranslationKey)}
              </Text>
              <TouchableOpacity onPress={() => setConfigOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setFilters((f) => ({ ...f, showNormals: !f.showNormals }))}
              style={styles.toggleRow}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: filters.showNormals }}
            >
              <Feather
                name={filters.showNormals ? 'check-square' : 'square'}
                size={16}
                color={filters.showNormals ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={styles.toggleText}>
                {t('clinician.detail.timeline.config.showNormals' as TranslationKey)}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <FullScreenImageViewer
        visible={viewerUri != null}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </View>
  );
}

const CELL_HEIGHT = 44;
const DAY_NUM_SIZE = 20;

const styles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight, flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.borderLight,
  },
  filterPillActive: { backgroundColor: COLORS.statusUrgentBg },
  filterPillText: { fontSize: 11, color: COLORS.textSecondary },
  filterPillTextActive: { color: COLORS.statusUrgentText, fontWeight: '600' },
  configBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },

  monthNav: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  monthNavBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  monthLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
  },
  todayBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },

  weekdayRow: { flexDirection: 'row', gap: 2 },
  weekdayLabel: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textLight,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  grid: { gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 3,
    justifyContent: 'space-between',
  },
  cellDimmed: { opacity: 0.55 },
  cellSelected: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  cellTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cellTopRight: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  dayNumWrap: {
    width: DAY_NUM_SIZE,
    height: DAY_NUM_SIZE,
    borderRadius: DAY_NUM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumToday: { backgroundColor: COLORS.primary },
  dayNum: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  dayNumDimmed: { color: COLORS.textLight },
  dayNumTodayText: { color: COLORS.white, fontWeight: '700' },
  reactionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.statusUrgent,
  },
  dayDetail: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  dayDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  dayDetailTitle: { fontSize: 13, color: COLORS.text, fontWeight: '600', flex: 1 },
  dayDetailCount: { fontSize: 11, color: COLORS.textLight },
  dayDetailEmpty: { fontSize: 12, color: COLORS.textLight, fontStyle: 'italic' },
  dayDetailBody: { gap: SPACING.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 2,
  },
  rowReactionDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.statusUrgent,
    zIndex: 1,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 13, color: COLORS.text, lineHeight: 18, flexShrink: 1 },
  logTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  outcomeBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowSubtext: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  hbRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 },
  hbChip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  hbChipText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
  hbSubtext: { flex: 1, fontSize: 11, color: COLORS.textSecondary },

  photoBtn: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hiddenNormalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  hiddenNormalsText: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },

  cohortNote: { fontSize: 10, color: COLORS.textLight, fontStyle: 'italic', textAlign: 'center' },

  // Config sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { ...TYPOGRAPHY.h3, color: COLORS.text },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  toggleText: { fontSize: 13, color: COLORS.text },
});
