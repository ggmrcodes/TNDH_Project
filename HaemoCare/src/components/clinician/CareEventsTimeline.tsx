import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import { formatDate } from '../../utils/dateHelpers';
import type { CareEvent } from '../../utils/careEventsTimeline';
import {
  groupEventsByDay,
  applyTimelineFilters,
  computeHbDelta,
  countHiddenNormalLogs,
  buildStripCells,
  type DayGroup,
  type TimelineFilters,
  type DayOutcome,
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

const WINDOW_OPTIONS: ReadonlyArray<{ days: number; key: TranslationKey }> = [
  { days: 7, key: 'clinician.detail.timeline.window.7d' as TranslationKey },
  { days: 30, key: 'clinician.detail.timeline.window.30d' as TranslationKey },
  { days: 90, key: 'clinician.detail.timeline.window.90d' as TranslationKey },
];

function outcomeTint(outcome: 'normal' | 'monitor' | 'urgent'): string {
  if (outcome === 'urgent') return COLORS.statusUrgent;
  if (outcome === 'monitor') return COLORS.statusMonitor;
  return COLORS.statusNormal;
}

function dayOutcomeTint(o: DayOutcome): string {
  if (o == null) return COLORS.borderLight;
  return outcomeTint(o);
}

export default function CareEventsTimeline({
  events,
  totalInWindow,
  language,
}: CareEventsTimelineProps) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();

  // Filters live in component state so each clinician can shape the view
  // for the patient they're currently looking at. Defaults: 30-day window,
  // normals auto-collapsed, no urgent-only filter.
  const [filters, setFilters] = useState<TimelineFilters>({
    showNormals: false,
    urgentOnly: false,
    windowDays: 30,
  });
  // Tap-the-footer to surface hidden normals without flipping the config.
  const [showNormalsInline, setShowNormalsInline] = useState(false);
  // Day-group expand/collapse — opaque tokens keyed by dayKey.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  // Collapse token for the latest day (which starts expanded by default).
  const [collapsedLatest, setCollapsedLatest] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoadingFor, setViewerLoadingFor] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  const effectiveFilters = useMemo<TimelineFilters>(
    () => ({ ...filters, showNormals: filters.showNormals || showNormalsInline }),
    [filters, showNormalsInline]
  );

  const visibleEvents = useMemo(
    () => applyTimelineFilters(events, effectiveFilters, today),
    [events, effectiveFilters, today]
  );
  const dayGroups = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  const stripCells = useMemo(
    () => buildStripCells(events, today, filters.windowDays),
    [events, today, filters.windowDays]
  );
  const hiddenNormalCount = useMemo(
    () => countHiddenNormalLogs(events, filters, today),
    [events, filters, today]
  );
  const extraOlder = Math.max(0, totalInWindow - visibleEvents.length - hiddenNormalCount);

  const isDayExpanded = (dayKey: string, idx: number): boolean => {
    if (idx === 0) return !collapsedLatest;
    return expandedDays.has(dayKey);
  };

  const toggleDay = (dayKey: string, idx: number) => {
    if (idx === 0) {
      setCollapsedLatest((v) => !v);
      return;
    }
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
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

  // Localized symptom name with a graceful fallback when the i18n entry
  // is missing (returned key starts with 'symptom.').
  const symptomLabel = (raw: string): string => {
    const translated = t(('symptom.' + raw) as TranslationKey);
    return translated.startsWith('symptom.') ? raw : translated;
  };

  const summarizeDay = (g: DayGroup): string => {
    const parts: string[] = [];
    if (g.hasTransfusion) {
      parts.push(t('clinician.detail.timeline.summary.tx' as TranslationKey));
    }
    if (g.hasAppointment) {
      parts.push(t('clinician.detail.timeline.summary.appt' as TranslationKey));
    }
    if (g.symptomLogCount > 0) {
      parts.push(
        t('clinician.detail.timeline.summary.logs' as TranslationKey, {
          count: g.symptomLogCount,
        })
      );
    }
    return parts.join(' · ');
  };

  return (
    <View style={styles.section}>
      {/* Header — title + filter pill + config gear */}
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
            accessibilityLabel={t('clinician.detail.timeline.filter.urgentOnly' as TranslationKey)}
            accessibilityState={{ selected: filters.urgentOnly }}
          >
            <Feather
              name="alert-triangle"
              size={11}
              color={filters.urgentOnly ? COLORS.statusUrgentText : COLORS.textSecondary}
            />
            <Text style={[styles.filterPillText, filters.urgentOnly && styles.filterPillTextActive]}>
              {t('clinician.detail.timeline.filter.urgentOnly' as TranslationKey)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfigOpen(true)}
            style={styles.configBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('clinician.detail.timeline.config.title' as TranslationKey)}
          >
            <Feather name="sliders" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 30-day mini strip — oldest at left, today at right */}
      <View style={styles.strip}>
        <View style={styles.stripBars}>
          {stripCells.map((cell) => {
            const tint = cell.hasTransfusion
              ? COLORS.primary
              : cell.worstOutcome != null
                ? dayOutcomeTint(cell.worstOutcome)
                : cell.hasAppointment
                  ? COLORS.textSecondary
                  : COLORS.borderLight;
            return (
              <View
                key={cell.dayKey}
                style={[
                  styles.stripBar,
                  { backgroundColor: tint },
                  cell.isToday && styles.stripBarToday,
                ]}
              />
            );
          })}
        </View>
        <Text style={styles.stripLegend}>
          {t('clinician.detail.timeline.window.label' as TranslationKey, {
            days: filters.windowDays,
          })}
        </Text>
      </View>

      {/* Body — day-grouped collapsible rows */}
      <View style={styles.sectionBody}>
        {dayGroups.length === 0 ? (
          <Text style={styles.empty}>
            {filters.urgentOnly
              ? t('clinician.detail.timeline.empty.urgentOnly' as TranslationKey)
              : t('clinician.detail.timeline.empty' as TranslationKey)}
          </Text>
        ) : (
          dayGroups.map((g, idx) => {
            const expanded = isDayExpanded(g.dayKey, idx);
            const summaryDot = g.hasUrgentLog
              ? COLORS.statusUrgent
              : g.worstOutcome != null
                ? dayOutcomeTint(g.worstOutcome)
                : g.hasTransfusion
                  ? COLORS.primary
                  : g.hasAppointment
                    ? COLORS.textSecondary
                    : COLORS.textLight;
            return (
              <View key={g.dayKey} style={styles.dayGroup}>
                <TouchableOpacity
                  onPress={() => toggleDay(g.dayKey, idx)}
                  activeOpacity={0.7}
                  style={styles.dayHeader}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <Feather
                    name={expanded ? 'chevron-down' : 'chevron-right'}
                    size={14}
                    color={COLORS.textLight}
                  />
                  <View style={[styles.daySummaryDot, { backgroundColor: summaryDot }]} />
                  <Text style={styles.dayDate}>{formatDate(g.date, language)}</Text>
                  <Text style={styles.daySummaryText} numberOfLines={1}>
                    {summarizeDay(g)}
                  </Text>
                </TouchableOpacity>

                {expanded && (
                  <View style={styles.dayBody}>
                    {g.events.map((ev) => {
                      const rowKey = g.dayKey + ':' + ev.id;

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
                              {reaction && <View style={styles.reactionDot} />}
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
                                    {t('clinician.detail.timeline.tx.hbDetail' as TranslationKey, {
                                      pre: delta.pre.toFixed(1),
                                      post: delta.post.toFixed(1),
                                    })}
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
                                accessibilityLabel={t('transfusion.documentPhoto.viewFull' as TranslationKey)}
                              >
                                <Feather
                                  name="image"
                                  size={14}
                                  color={viewerLoadingFor === photo.id ? COLORS.textLight : COLORS.primary}
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
                                    : t('clinician.detail.timeline.log.noSymptoms' as TranslationKey)}
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
            );
          })
        )}

        {hiddenNormalCount > 0 && !showNormalsInline && !filters.showNormals && (
          <TouchableOpacity
            onPress={() => setShowNormalsInline(true)}
            style={styles.hiddenNormalsRow}
            accessibilityRole="button"
          >
            <Feather name="eye" size={11} color={COLORS.textLight} />
            <Text style={styles.hiddenNormalsText}>
              {t('clinician.detail.timeline.hiddenNormals' as TranslationKey, {
                count: hiddenNormalCount,
              })}
            </Text>
          </TouchableOpacity>
        )}

        {extraOlder > 0 && (
          <View style={styles.moreRow}>
            <Text style={styles.moreText}>
              {t('clinician.detail.timeline.more' as TranslationKey, { count: extraOlder })}
            </Text>
          </View>
        )}
      </View>

      {/* Config sheet (bottom sheet modal) */}
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
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t('clinician.detail.timeline.config.title' as TranslationKey)}
              </Text>
              <TouchableOpacity onPress={() => setConfigOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSectionLabel}>
              {t('clinician.detail.timeline.config.windowLabel' as TranslationKey)}
            </Text>
            <View style={styles.windowRow}>
              {WINDOW_OPTIONS.map((opt) => {
                const active = filters.windowDays === opt.days;
                return (
                  <TouchableOpacity
                    key={opt.days}
                    onPress={() => setFilters((f) => ({ ...f, windowDays: opt.days }))}
                    style={[styles.windowPill, active && styles.windowPillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.windowPillText, active && styles.windowPillTextActive]}>
                      {t(opt.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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

  strip: { gap: 4 },
  stripBars: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'stretch',
    height: 24,
  },
  stripBar: { flex: 1, borderRadius: 1.5 },
  stripBarToday: { borderWidth: 1.5, borderColor: COLORS.primary },
  stripLegend: { fontSize: 10, color: COLORS.textLight, alignSelf: 'flex-end' },

  sectionBody: { gap: SPACING.xs },
  dayGroup: { gap: 4 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 4,
  },
  daySummaryDot: { width: 8, height: 8, borderRadius: 4 },
  dayDate: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  daySummaryText: { flex: 1, fontSize: 12, color: COLORS.textSecondary },

  dayBody: {
    paddingLeft: SPACING.md,
    gap: SPACING.xs,
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.borderLight,
    marginLeft: SPACING.xs * 2,
  },

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
  reactionDot: {
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
  logTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs, flexWrap: 'wrap' },
  outcomeBadge: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowSubtext: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  hbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 4,
  },
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
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  hiddenNormalsText: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },

  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  moreRow: { paddingVertical: SPACING.xs },
  moreText: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },

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
  sheetSectionLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  windowRow: { flexDirection: 'row', gap: SPACING.xs },
  windowPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.borderLight,
  },
  windowPillActive: { backgroundColor: COLORS.primaryLight },
  windowPillText: { fontSize: 13, color: COLORS.textSecondary },
  windowPillTextActive: { color: COLORS.primary, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  toggleText: { fontSize: 13, color: COLORS.text },
});
