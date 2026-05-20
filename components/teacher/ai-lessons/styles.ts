import { StyleSheet } from 'react-native';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { margin: 16, borderRadius: 24, padding: 24, overflow: 'hidden' },
  sparkleRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.85)',
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 8,
  },
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 6, marginTop: 14,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  content: { paddingHorizontal: 16 },

  composerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl,
    ...tokens.shadow.brand,
  },
  composerHeaderTitle: {
    fontSize: tokens.font.size.lg, fontWeight: '800', color: '#fff',
  },
  inputCard: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: tokens.radius.xl, borderBottomRightRadius: tokens.radius.xl,
    padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  inputLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8, gap: 8,
  },
  inputLabel: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  subjectBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E0F2FE', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#7DD3FC',
  },
  subjectBadgeText: { fontSize: 10, fontWeight: '700', color: '#0369A1' },
  inputArea: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 13, fontWeight: '600', color: Colors.text,
    minHeight: 160, textAlignVertical: 'top',
  },
  inputFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 8, paddingHorizontal: 4,
  },
  charCount: { fontSize: 11, fontWeight: '700' },

  samplesBox: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  samplesTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    textAlign: 'right', marginBottom: 8,
  },
  samplesChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sampleChip: {
    backgroundColor: '#EEF2FF', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  sampleChipText: { fontSize: 11, color: '#4338CA', fontWeight: '600' },

  generateBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    marginTop: 14,
  },
  genHint: {
    fontSize: 10, color: Colors.textMuted, textAlign: 'center',
    marginTop: 8, fontStyle: 'italic',
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  genRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },

  savedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17, fontWeight: '900', color: Colors.text, textAlign: 'right',
  },
  count: {
    backgroundColor: Colors.primary, color: '#fff', fontSize: 11,
    fontWeight: '800', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2,
  },

  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: { backgroundColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 8 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  emptyText: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

  skeletonCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  skeletonThumb: {
    width: 68, height: 68, borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  skeletonLine: {
    height: 14, backgroundColor: '#F1F5F9', borderRadius: 6,
  },
  skeletonChip: {
    height: 18, backgroundColor: '#F1F5F9', borderRadius: 100,
  },

  lessonCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  lessonHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  lessonThumb: {
    width: 68, height: 68, borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#F1F5F9', position: 'relative',
  },
  lessonThumbOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  lessonThumbBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#7C3AED', width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  quickStats: {
    flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4,
  },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F1F5F9', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  quickChipText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 4, paddingBottom: 10,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    backgroundColor: '#F1F5F9',
  },
  tabActive: { backgroundColor: Colors.primary },
  tabLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  lessonTitle: {
    fontSize: 14, fontWeight: '800', color: Colors.text,
    textAlign: 'right',
  },
  lessonMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
  },
  lessonDate: { fontSize: 10, color: Colors.textMuted },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusText: { fontSize: 10, fontWeight: '700' },

  lessonBody: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 10,
  },

  section: {
    backgroundColor: '#FAFBFC', borderRadius: 12, padding: 12,
    borderRightWidth: 3, borderRightColor: Colors.primary,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'flex-end',
  },
  sectionCardTitle: { fontSize: 13, fontWeight: '800' },

  bullet: {
    flexDirection: 'row', gap: 6, paddingVertical: 3,
    justifyContent: 'flex-end',
  },
  bulletDot: { fontSize: 12, color: Colors.primary, fontWeight: '800', marginTop: 2 },
  bulletText: {
    flex: 1, fontSize: 12, color: Colors.text, textAlign: 'right', lineHeight: 20,
  },

  summaryText: {
    fontSize: 13, color: Colors.text, textAlign: 'right',
    lineHeight: 22, fontWeight: '500',
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4,
  },
  statBox: {
    flex: 1, minWidth: 100,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '900', color: '#B45309' },
  statLabel: { fontSize: 10, color: '#92400E', textAlign: 'center' },

  conceptBox: {
    backgroundColor: '#FDF2F8', borderRadius: 10, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: '#FBCFE8',
  },
  conceptTerm: {
    fontSize: 12, fontWeight: '900', color: '#BE185D', textAlign: 'right',
  },
  conceptDef: {
    fontSize: 11, color: Colors.text, textAlign: 'right',
    lineHeight: 18, marginTop: 3,
  },

  quizBox: {
    marginBottom: 10, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  quizQ: {
    fontSize: 13, fontWeight: '800', color: Colors.text,
    textAlign: 'right', marginBottom: 8,
  },
  quizOpt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  quizOptCorrect: { backgroundColor: Colors.success, borderColor: Colors.success },
  quizOptWrong: { backgroundColor: Colors.error, borderColor: Colors.error },
  quizOptText: { fontSize: 12, color: Colors.text, textAlign: 'right', flex: 1 },
  quizLegacyItem: {
    fontSize: 12, color: Colors.text, textAlign: 'right',
    lineHeight: 22, paddingVertical: 3,
  },
  explainBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 8, padding: 8, marginTop: 6,
  },
  explainText: {
    flex: 1, fontSize: 11, color: '#4338CA', textAlign: 'right', lineHeight: 18,
  },

  flashCard: {
    backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14,
    marginBottom: 6, borderWidth: 1, borderColor: '#BAE6FD',
    minHeight: 70,
  },
  flashCardBack: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  flashFace: {
    fontSize: 13, fontWeight: '700', color: Colors.text,
    textAlign: 'right', lineHeight: 20, flex: 1,
  },
  legacyFlash: {
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  legacyFlashText: {
    fontSize: 12, color: Colors.text, textAlign: 'right', fontWeight: '600',
  },

  faqBox: {
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: '#DDD6FE',
  },
  faqQ: {
    fontSize: 12, fontWeight: '900', color: '#6D28D9',
    textAlign: 'right', marginBottom: 4,
  },
  faqA: {
    fontSize: 11, color: Colors.text, textAlign: 'right', lineHeight: 18,
  },

  actionsRow: {
    flexDirection: 'row', gap: 8, marginTop: 6,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, flex: 1,
  },
  deleteBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  deleteBtnText: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  pdfBtn: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  pdfBtnText: { fontSize: 13, fontWeight: '800', color: '#B45309' },
  dupBtn: { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' },
  dupBtnText: { fontSize: 13, fontWeight: '800', color: '#0369A1' },

  engagementRow: {
    flexDirection: 'row', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  engagementBox: {
    flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4,
  },
  engagementValue: {
    fontSize: 16, fontWeight: '900', color: Colors.text,
  },
  engagementLabel: {
    fontSize: 9, color: Colors.textMuted, fontWeight: '700',
  },
  publishBtn: { flex: 2 },
  publishBtnText: { fontSize: 13, fontWeight: '800' },
});
