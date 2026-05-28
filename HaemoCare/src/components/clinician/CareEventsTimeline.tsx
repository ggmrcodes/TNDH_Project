import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import { formatDate } from '../../utils/dateHelpers';
import type { CareEvent } from '../../utils/careEventsTimeline';
import FullScreenImageViewer from '../common/FullScreenImageViewer';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';

export interface CareEventsTimelineProps {
  events: CareEvent[];
  totalInWindow: number;
  language: 'th' | 'en';
}

type RenderedRow = {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  line: string;
  reaction: boolean;
};

const OUTCOME_KEY: Record<'normal' | 'monitor' | 'urgent', TranslationKey> = {
  normal: 'clinician.detail.timeline.outcome.normal' as TranslationKey,
  monitor: 'clinician.detail.timeline.outcome.monitor' as TranslationKey,
  urgent: 'clinician.detail.timeline.outcome.urgent' as TranslationKey,
};

function topThreeSymptoms(log: {
  symptoms: string[];
  severity_scores: Record<string, number>;
}): string[] {
  const sevs = log.severity_scores ?? {};
  return [...(log.symptoms ?? [])]
    .sort((a, b) => (sevs[b] ?? 0) - (sevs[a] ?? 0))
    .slice(0, 3);
}

export default function CareEventsTimeline({
  events,
  totalInWindow,
  language,
}: CareEventsTimelineProps) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const extra = Math.max(0, totalInWindow - events.length);
  // Tap-to-view state for the per-row "scanned document" affordance on
  // transfusion rows whose patient attached a photo.
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoadingFor, setViewerLoadingFor] = useState<string | null>(null);

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

  function renderRow(event: CareEvent): RenderedRow {
    if (event.kind === 'transfusion' && event.transfusion) {
      const tx = event.transfusion;
      const pre = tx.pre_hb_g_dl;
      const post = tx.post_hb_g_dl;
      const hospital = tx.hospital ?? '';
      const base = t('clinician.detail.timeline.tx' as TranslationKey, {
        units: tx.units_received ?? '—',
        hospital,
      });
      const hbSuffix =
        pre != null && post != null
          ? ' · ' +
            t('clinician.detail.timeline.tx.hb' as TranslationKey, { pre, post })
          : '';
      const reaction = tx.reaction_noted === true;
      return {
        icon: 'droplet',
        tint: reaction ? COLORS.statusUrgent ?? '#DC3B3B' : COLORS.primary ?? '#0B6E6E',
        line: base + hbSuffix,
        reaction,
      };
    }

    if (event.kind === 'symptom_log' && event.log) {
      const log = event.log;
      const symptoms = topThreeSymptoms(log).join(', ');
      const outcome = log.outcome;
      const tint =
        outcome === 'urgent'
          ? COLORS.statusUrgent ?? '#DC3B3B'
          : outcome === 'monitor'
            ? COLORS.statusMonitor ?? '#E8933A'
            : COLORS.statusNormal ?? '#0EA572';
      const summary = `${symptoms} (${t(OUTCOME_KEY[outcome])})`;
      return {
        icon: 'activity',
        tint,
        line: t('clinician.detail.timeline.log' as TranslationKey, { summary }),
        reaction: false,
      };
    }

    if (event.kind === 'appointment' && event.appointment) {
      const hospital = event.appointment.hospital ?? '';
      return {
        icon: 'calendar',
        tint: COLORS.textSecondary ?? '#5C6678',
        line: t('clinician.detail.timeline.appt' as TranslationKey, { hospital }),
        reaction: false,
      };
    }

    return {
      icon: 'circle',
      tint: COLORS.textLight,
      line: '',
      reaction: false,
    };
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name="clock" size={14} color={COLORS.textLight} />
        <Text style={styles.sectionLabel}>
          {t('clinician.detail.timeline.title' as TranslationKey).toUpperCase()}
        </Text>
      </View>
      <View style={styles.sectionBody}>
        {events.length === 0 ? (
          <Text style={styles.empty}>
            {t('clinician.detail.timeline.empty' as TranslationKey)}
          </Text>
        ) : (
          <View>
            {events.map((evt, i) => {
              const { icon, tint, line, reaction } = renderRow(evt);
              const txPhoto =
                evt.kind === 'transfusion' && evt.transfusion?.document_photo_url
                  ? { stored: evt.transfusion.document_photo_url, id: evt.transfusion.id }
                  : null;
              return (
                <View key={i} style={styles.row}>
                  <View style={styles.iconWrap}>
                    {reaction && <View style={styles.reactionDot} />}
                    <Feather name={icon} size={16} color={tint} />
                  </View>
                  <Text style={styles.line} numberOfLines={1} ellipsizeMode="tail">
                    {line}
                  </Text>
                  {txPhoto && (
                    <TouchableOpacity
                      onPress={() => openTransfusionPhoto(txPhoto.stored, txPhoto.id)}
                      hitSlop={8}
                      style={styles.photoBtn}
                      accessibilityRole="button"
                      accessibilityLabel={t('transfusion.documentPhoto.viewFull' as TranslationKey)}
                    >
                      <Feather
                        name="image"
                        size={14}
                        color={viewerLoadingFor === txPhoto.id ? COLORS.textLight : COLORS.primary}
                      />
                    </TouchableOpacity>
                  )}
                  <Text style={styles.date}>{formatDate(evt.date, language)}</Text>
                </View>
              );
            })}
            {extra > 0 && (
              <View style={styles.moreRow}>
                <Text style={styles.moreText}>
                  {t('clinician.detail.timeline.more' as TranslationKey, { count: extra })}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
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
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  sectionBody: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  reactionDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    zIndex: 1,
  },
  line: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  photoBtn: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { fontSize: 11, color: COLORS.textLight },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  moreRow: {
    paddingVertical: SPACING.xs,
  },
  moreText: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },
});
