import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';
import WhatsAppButton from '../../../shared/WhatsAppButton';
import { ROLE_BG, PICKER_STAGES, parsePickerClass, generateCode } from '../_helpers';
import { styles } from '../_styles';
import AssignmentSheet, { type PickedAssignment } from '../AssignmentSheet';

type TeacherAssignment = { subjectId: string; gradeId: string; sectionIds: string[] };

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedUser: any;
  institutes: any[];
  // Whether the platform admin is allowed to view/edit the raw login code
  // (gated by the per-institute admin_view_user_codes feature flag).
  canViewCodes?: boolean;
  // Editable form state
  editName: string;
  setEditName: (v: string) => void;
  editCode: string;
  setEditCode: (v: string) => void;
  userPhone: string;
  setUserPhone: (v: string) => void;
  // Class picker state (kept at parent level, original behavior)
  pickerStage: string;
  setPickerStage: (v: string) => void;
  pickerGrade: string;
  setPickerGrade: (v: string) => void;
  pickerBranch: string;
  setPickerBranch: (v: string) => void;
  userClassOptions: any[];
  userClasses: string[];
  setUserClasses: React.Dispatch<React.SetStateAction<string[]>>;
  // Notification panel state
  showNotifInput: boolean;
  setShowNotifInput: (v: boolean) => void;
  notifText: string;
  setNotifText: (v: string) => void;
  sendingNotif: boolean;
  // Loading flags
  savingDetail: boolean;
  freezingUser: boolean;
  // Teacher assignments state
  editTeacherAssignments: TeacherAssignment[];
  setEditTeacherAssignments: React.Dispatch<React.SetStateAction<TeacherAssignment[]>>;
  wizardSchoolStructure: any;
  // Handlers
  onSaveAll: () => void;
  onSendNotif: () => void;
  onToggleFreeze: () => void;
  onDelete: () => void;
  // Labels
  roleLabelFor: (role: string) => string;
  // i18n labels
  userDetailsLabel: string;
  nameLabel: string;
  fullNameLabel: string;
  loginCodeLabel: string;
  writeOrGenerateCodeLabel: string;
  phoneLabel: string;
  phoneOptionalLabel: string;
  classesEnrolledLabel: string;
  saveChangesLabel: string;
  sendNotificationLabel: string;
  notificationTextLabel: string;
  sendLabel: string;
  teachingAssignmentsLabel: string;
  addNewAssignmentLabel: string;
  activateAccountLabel: string;
  freezeAccountLabel: string;
  deleteUserLabel: string;
  closeLabel: string;
  institutionTypeLabel: string;
};

export default function UserDetailSheet({
  visible,
  onClose,
  selectedUser,
  institutes,
  canViewCodes = false,
  // Note: instituteType is derived inside the component via `institutes` lookup
  // so we don't need to thread it through every caller. Defaults to 'institute'
  // when the institutes list is still loading.
  editName,
  setEditName,
  editCode,
  setEditCode,
  userPhone,
  setUserPhone,
  pickerStage,
  setPickerStage,
  pickerGrade,
  setPickerGrade,
  pickerBranch,
  setPickerBranch,
  userClassOptions,
  userClasses,
  setUserClasses,
  showNotifInput,
  setShowNotifInput,
  notifText,
  setNotifText,
  sendingNotif,
  savingDetail,
  freezingUser,
  editTeacherAssignments,
  setEditTeacherAssignments,
  wizardSchoolStructure,
  onSaveAll,
  onSendNotif,
  onToggleFreeze,
  onDelete,
  roleLabelFor,
  userDetailsLabel,
  nameLabel,
  fullNameLabel,
  loginCodeLabel,
  writeOrGenerateCodeLabel,
  phoneLabel,
  phoneOptionalLabel,
  classesEnrolledLabel,
  saveChangesLabel,
  sendNotificationLabel,
  notificationTextLabel,
  sendLabel,
  teachingAssignmentsLabel,
  addNewAssignmentLabel,
  activateAccountLabel,
  freezeAccountLabel,
  deleteUserLabel,
  closeLabel,
  institutionTypeLabel,
}: Props) {
  // Local-only state — the AssignmentSheet toggle. Lives here (instead of the
  // parent screen) because nothing outside this sheet cares whether the inner
  // picker is showing. Parent prop drilling already 25+ levels deep — adding
  // one more boolean would be noise.
  const [showAssignSheet, setShowAssignSheet] = useState(false);

  // Derive institute type for this user from the institutes catalog. Schools
  // get the full stage→grade→section walk; institutes get the flat class walk.
  const userInst = selectedUser ? institutes.find((i) => i.id === selectedUser.institute_id) : null;
  const userInstType: 'school' | 'institute' = (userInst?.type === 'school') ? 'school' : 'institute';

  // Convert one AssignmentSheet pick into the parent's editTeacherAssignments
  // shape. We merge into an existing { subject + grade } row when one exists
  // so the saved teacher_assignments table doesn't double-up the same combo.
  const handlePickedAssignment = (picked: PickedAssignment) => {
    setEditTeacherAssignments((prev) => {
      const sid = picked.sectionId || picked.classId;
      if (!sid) return prev;
      // Group by subject + grade (or subject only for institutes — no grade exists)
      const gradeKey = picked.gradeId || '';
      const existingIdx = prev.findIndex((a) => a.subjectId === picked.subjectId && (a.gradeId || '') === gradeKey);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        if (existing.sectionIds.includes(sid)) return prev; // already there — silently no-op
        const next = [...prev];
        next[existingIdx] = { ...existing, sectionIds: [...existing.sectionIds, sid] };
        return next;
      }
      return [...prev, { subjectId: picked.subjectId, gradeId: gradeKey, sectionIds: [sid] }];
    });
  };

  return (
    <>
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92} minHeight={0.7}>
      <View style={styles.sheetBody}>
        {selectedUser && (
          <KeyboardAwareScroll showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{userDetailsLabel}</Text>
            </View>

            {/* Role + Institute badges */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
              <View style={[styles.roleBadge, { backgroundColor: ROLE_BG[selectedUser.role]?.bg || '#F1F5F9' }]}>
                <Text style={[styles.roleBadgeText, { color: ROLE_BG[selectedUser.role]?.text || Colors.textMuted }]}>
                  {roleLabelFor(selectedUser.role)}
                </Text>
              </View>
              {selectedUser.institute_id && (
                <View style={[styles.roleBadge, { backgroundColor: '#EEF2FF' }]}>
                  <Text style={[styles.roleBadgeText, { color: Colors.primary }]}>
                    {institutes.find((i) => i.id === selectedUser.institute_id)?.name || institutionTypeLabel}
                  </Text>
                </View>
              )}
            </View>

            {/* Editable Name */}
            <Text style={styles.fieldLabel}>{nameLabel}</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              textAlign="right"
              placeholder={fullNameLabel}
              placeholderTextColor={Colors.textMuted}
            />

            {/* Editable Code — gated by admin_view_user_codes feature flag */}
            {canViewCodes ? (
              <>
                <Text style={styles.fieldLabel}>{loginCodeLabel}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setEditCode(generateCode())}
                  >
                    <Ionicons name="refresh" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 0 }]}
                    value={editCode}
                    onChangeText={(t) => setEditCode(t.toUpperCase())}
                    textAlign="left"
                    placeholder={writeOrGenerateCodeLabel}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </>
            ) : null}

            {/* Phone */}
            <Text style={styles.fieldLabel}>{phoneLabel}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={userPhone}
                onChangeText={setUserPhone}
                textAlign="right"
                placeholder={phoneOptionalLabel}
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
              />
              <WhatsAppButton phone={userPhone} size="md" />
            </View>

            {/* Class Assignment — hierarchical: Stage → Grade → Section */}
            {selectedUser && ['student', 'teacher'].includes(selectedUser.role) && userClassOptions.length > 0 && (() => {
              const activeStage = PICKER_STAGES.find(s => s.key === pickerStage);

              const filteredClasses = userClassOptions.filter((cls: any) => {
                const p = parsePickerClass(cls.name);
                if (pickerStage && p.stageKey !== pickerStage) return false;
                if (pickerGrade && !cls.name.includes(pickerGrade)) return false;
                if (pickerBranch && !cls.name.includes(pickerBranch)) return false;
                return true;
              });

              const selectedClasses = userClassOptions.filter((cls: any) => userClasses.includes(cls.id));

              return (
                <View style={{ marginTop: 12, marginBottom: 4 }}>
                  <Text style={styles.fieldLabel}>{classesEnrolledLabel}</Text>

                  {/* Selected classes chips */}
                  {selectedClasses.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, justifyContent: 'flex-end' }}>
                      {selectedClasses.map((cls: any) => (
                        <TouchableOpacity
                          key={cls.id}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, borderColor: Colors.primary }}
                          onPress={() => setUserClasses(prev => prev.filter(id => id !== cls.id))}
                        >
                          <Ionicons name="close-circle" size={14} color={Colors.primary} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>{cls.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Step 1: Stage */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, justifyContent: 'center' }}>
                    {PICKER_STAGES.map(s => (
                      <TouchableOpacity
                        key={s.key}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: pickerStage === s.key ? s.color : '#F1F5F9', alignItems: 'center' }}
                        onPress={() => { setPickerStage(pickerStage === s.key ? '' : s.key); setPickerGrade(''); setPickerBranch(''); }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: pickerStage === s.key ? '#fff' : Colors.text }}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Step 2: Grade */}
                  {activeStage && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {activeStage.grades.map(g => (
                          <TouchableOpacity
                            key={g}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: pickerGrade === g ? activeStage.color : '#F8FAFC', borderWidth: 1.5, borderColor: pickerGrade === g ? activeStage.color : '#E2E8F0' }}
                            onPress={() => { setPickerGrade(pickerGrade === g ? '' : g); setPickerBranch(''); }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: pickerGrade === g ? '#fff' : Colors.text }}>{g}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}

                  {/* Step 2.5: Branch for secondary */}
                  {activeStage?.key === 'secondary' && pickerGrade && (activeStage as any).branches && (
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, justifyContent: 'center' }}>
                      {((activeStage as any).branches || []).map((b: string) => (
                        <TouchableOpacity
                          key={b}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: pickerBranch === b ? (b === 'الأدبي' ? '#B45309' : '#7C3AED') : '#F1F5F9', alignItems: 'center' }}
                          onPress={() => setPickerBranch(pickerBranch === b ? '' : b)}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: pickerBranch === b ? '#fff' : Colors.text }}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Step 3: Sections/Classes to pick */}
                  {pickerStage && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                      {filteredClasses.map((cls: any) => {
                        const isAssigned = userClasses.includes(cls.id);
                        const stageColor = activeStage?.color || '#64748B';
                        return (
                          <TouchableOpacity
                            key={cls.id}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                              backgroundColor: isAssigned ? `${stageColor}15` : '#fff',
                              borderWidth: 2, borderColor: isAssigned ? stageColor : '#E2E8F0',
                            }}
                            onPress={() => setUserClasses(prev => prev.includes(cls.id) ? prev.filter(id => id !== cls.id) : [...prev, cls.id])}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isAssigned ? stageColor : Colors.textMuted }}>
                              {isAssigned ? '✓ ' : ''}{cls.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {filteredClasses.length === 0 && (
                        <Text style={{ fontSize: 11, color: Colors.textMuted, padding: 8 }}>لا توجد صفوف بهذا التصنيف</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Single Save All Button */}
            <TouchableOpacity
              style={[styles.detailBtn, { backgroundColor: Colors.primary, marginTop: 12 }, savingDetail && { opacity: 0.6 }]}
              onPress={onSaveAll}
              disabled={savingDetail}
            >
              {savingDetail ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.detailBtnText}>{saveChangesLabel}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Notification Section */}
            <TouchableOpacity
              style={[styles.detailBtn, { backgroundColor: '#EEF2FF' }]}
              onPress={() => setShowNotifInput(!showNotifInput)}
            >
              <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
              <Text style={[styles.detailBtnText, { color: Colors.primary }]}>{sendNotificationLabel}</Text>
            </TouchableOpacity>

            {showNotifInput && (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  style={styles.modalInput}
                  value={notifText}
                  onChangeText={setNotifText}
                  textAlign="right"
                  placeholder={notificationTextLabel}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.detailBtn, { backgroundColor: '#059669' }, sendingNotif && { opacity: 0.6 }]}
                  onPress={onSendNotif}
                  disabled={sendingNotif}
                >
                  {sendingNotif ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={14} color="#fff" />
                      <Text style={styles.detailBtnText}>{sendLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Teacher Assignment Editor — list of current assignments + Add button.
                The hierarchical AssignmentSheet (opened via the Add button) walks the
                admin through stage → grade → section → subject (school) or
                class → subject (institute). Each pick is merged into the local
                editTeacherAssignments list and persisted by the parent's
                "Save All" handler via api.setTeacherAssignments. */}
            {selectedUser && selectedUser.role === 'teacher' && (
              <View style={{ marginTop: 12, marginBottom: 4 }}>
                <Text style={styles.fieldLabel}>{teachingAssignmentsLabel}</Text>
                {editTeacherAssignments.length === 0 ? (
                  <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', paddingVertical: 6 }}>
                    لا توجد تعيينات — أضف تعييناً جديداً
                  </Text>
                ) : (
                  editTeacherAssignments.map((asn, idx) => {
                    const subjects = wizardSchoolStructure?.subjects || [];
                    const sections = wizardSchoolStructure?.sections || [];
                    const grades = wizardSchoolStructure?.grades || [];
                    const subName = subjects.find((s: any) => s.id === asn.subjectId)?.name || '—';
                    const gradeName = asn.gradeId ? (grades.find((g: any) => g.id === asn.gradeId)?.name || '') : '';
                    // Resolve section/class names from either sections (school) or userClassOptions (institute)
                    const resolveName = (id: string) => {
                      const sec = sections.find((s: any) => s.id === id);
                      if (sec) return sec.name;
                      const cls = userClassOptions.find((c: any) => c.id === id);
                      return cls?.name || id.slice(0, 6);
                    };
                    const sectionNames = asn.sectionIds.map(resolveName).join('، ');
                    const isIncomplete = !asn.subjectId || asn.sectionIds.length === 0;
                    return (
                      <View key={idx} style={{ backgroundColor: isIncomplete ? '#FEF3C7' : '#F0FDF4', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: isIncomplete ? '#FCD34D' : '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setEditTeacherAssignments(prev => prev.filter((_, i) => i !== idx))}>
                          <Ionicons name="close-circle" size={22} color={Colors.error} />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' }} numberOfLines={1}>
                            {subName}
                          </Text>
                          <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                            {gradeName ? `${gradeName} — ` : ''}{sectionNames}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EEF2FF', marginTop: 4 }}
                  onPress={() => setShowAssignSheet(true)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>{addNewAssignmentLabel}</Text>
                  <Ionicons name="add-circle" size={16} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={{ fontSize: 10, color: Colors.textMuted, textAlign: 'right', marginTop: 6 }}>
                  ⚠️ تُحفظ التعيينات مع زر "حفظ كل التغييرات" بالأسفل
                </Text>
              </View>
            )}

            {/* Freeze/Unfreeze Button */}
            <TouchableOpacity
              style={[styles.detailBtn, {
                backgroundColor: selectedUser.is_frozen ? '#ECFDF5' : '#FFF7ED',
                marginTop: 16,
              }, freezingUser && { opacity: 0.5 }]}
              onPress={onToggleFreeze}
              disabled={freezingUser}
            >
              {freezingUser ? (
                <ActivityIndicator color={selectedUser.is_frozen ? '#059669' : '#F97316'} size="small" />
              ) : (
                <>
                  <Ionicons
                    name={selectedUser.is_frozen ? 'play-circle' : 'snow'}
                    size={16}
                    color={selectedUser.is_frozen ? '#059669' : '#F97316'}
                  />
                  <Text style={[styles.detailBtnText, { color: selectedUser.is_frozen ? '#059669' : '#F97316' }]}>
                    {selectedUser.is_frozen ? activateAccountLabel : freezeAccountLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Delete Button */}
            <TouchableOpacity
              style={[styles.detailBtn, { backgroundColor: '#FEF2F2', marginTop: 8 }]}
              onPress={onDelete}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={[styles.detailBtnText, { color: Colors.error }]}>{deleteUserLabel}</Text>
            </TouchableOpacity>

            {/* Close */}
            <TouchableOpacity
              style={[styles.modalCancelBtn, { marginTop: 12 }]}
              onPress={onClose}
            >
              <Text style={styles.modalCancelText}>{closeLabel}</Text>
            </TouchableOpacity>
          </KeyboardAwareScroll>
        )}
      </View>
    </SwipeableSheet>

    {/* Hierarchical assignment picker — opened from the "Add new assignment"
        button above. Rendered as a sibling Modal (not nested inside the parent
        SwipeableSheet) so its Modal layer sits cleanly above. */}
    <AssignmentSheet
      visible={showAssignSheet}
      onClose={() => setShowAssignSheet(false)}
      onPicked={handlePickedAssignment}
      instituteType={userInstType}
      stages={wizardSchoolStructure?.stages || []}
      grades={wizardSchoolStructure?.grades || []}
      sections={wizardSchoolStructure?.sections || []}
      subjects={wizardSchoolStructure?.subjects || []}
      classes={userClassOptions || []}
      teacherName={selectedUser?.full_name || null}
    />
    </>
  );
}
