// payroll — institute admin payroll management.
//
// Two-tab screen (الموظفون | الدفعات) built on instituteAdminService:
//   - Employees: list / search / create / edit / delete (PayrollEmployee).
//   - Payments: monthly view, summary cards, create payment, mark paid.
//
// Multi-tenant: every call hands the resolved userInstituteId to the service
// layer; we never trust an institute_id from a row's payload when re-saving
// (we re-stamp the current institute on every upsert).
//
// RTL: row-reverse layouts; text alignment "right" everywhere; numbers
// formatted with toLocaleString('ar-IQ') + ' د.ع'.
//
// No date-picker libraries: hire_date is a YYYY-MM-DD TextInput with a tiny
// regex validation, matching the pattern already used by exam-schedule-builder
// (which also takes free-form YYYY-MM-DD).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SectionLabel from '../../components/institute/SectionLabel';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import FadeSlideIn from '../../components/animated/FadeSlideIn';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { haptics } from '../../utils/haptics';
import { confirmAlert, errorAlert, successAlert } from '../../utils/alerts';

import {
  listEmployees, upsertEmployee, deleteEmployee,
  listPayments, upsertPayment, markPaymentPaid,
  type PayrollEmployee, type PayrollPayment, type ContractType, type PaymentStatus,
} from '../../services/instituteAdminService';

// ─────────── helpers ───────────

function fmtIQ(n: number | null | undefined): string {
  const v = Math.round(Number(n || 0));
  return v.toLocaleString('ar-IQ');
}

const MONTHS_AR = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

const CONTRACT_OPTIONS: { key: ContractType; label: string }[] = [
  { key: 'monthly',   label: 'شهري' },
  { key: 'hourly',    label: 'بالساعة' },
  { key: 'contract',  label: 'عقد' },
  { key: 'freelance', label: 'مستقل' },
];

const PAY_METHODS = ['cash', 'bank', 'wallet'] as const;
const PAY_METHOD_LABEL: Record<(typeof PAY_METHODS)[number], string> = {
  cash: 'نقداً', bank: 'تحويل بنكي', wallet: 'محفظة',
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'معلّق', paid: 'مدفوع', cancelled: 'ملغى',
};

function getInitial(name: string): string {
  const t = (name || '').trim();
  if (!t) return '?';
  // For Arabic names, take the first character of the first word.
  return Array.from(t)[0] || '?';
}

// Loose YYYY-MM-DD check (admin types the date — same approach used by
// exam-schedule-builder for consistency, no new picker libs).
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─────────── screen ───────────

type Tab = 'employees' | 'payments';

export default function InstitutePayroll() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [tab, setTab] = useState<Tab>('employees');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // employees
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [q, setQ] = useState('');
  const [showEmpSheet, setShowEmpSheet] = useState(false);
  const [editingEmp, setEditingEmp] = useState<PayrollEmployee | null>(null);

  // payments — period state defaults to "today"
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [editingPay, setEditingPay] = useState<PayrollPayment | null>(null);

  // mark-paid mini sheet
  const [markPayTarget, setMarkPayTarget] = useState<PayrollPayment | null>(null);

  // ─────────── data load ───────────

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const [emps, pays] = await Promise.all([
        listEmployees(userInstituteId),
        listPayments(userInstituteId, { year, month }),
      ]);
      setEmployees(emps);
      setPayments(pays);
    } catch (err) {
      if (__DEV__) console.error('payroll load', err);
      errorAlert('خطأ', 'تعذّر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId, year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // ─────────── derived ───────────

  const filteredEmployees = useMemo(() => {
    const nq = q.trim();
    if (!nq) return employees;
    return employees.filter((e) =>
      (e.full_name || '').includes(nq) || (e.job_title || '').includes(nq),
    );
  }, [q, employees]);

  const payStats = useMemo(() => {
    const totalGross = payments.reduce((s, p) => s + Number(p.gross_amount || 0), 0);
    const totalPaid = payments
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const pendingCount = payments.filter((p) => p.status === 'pending').length;
    return { totalGross, totalPaid, pendingCount };
  }, [payments]);

  // ─────────── handlers ───────────

  const openNewEmployee = () => {
    haptics.light();
    setEditingEmp(null);
    setShowEmpSheet(true);
  };

  const openEditEmployee = (e: PayrollEmployee) => {
    haptics.light();
    setEditingEmp(e);
    setShowEmpSheet(true);
  };

  const handleDeleteEmployee = (e: PayrollEmployee) => {
    confirmAlert(
      'حذف الموظف',
      `هل تريد حذف ${e.full_name}؟`,
      async () => {
        try {
          await deleteEmployee(e.id);
          setShowEmpSheet(false);
          setEditingEmp(null);
          await load();
          successAlert('تم', 'تم حذف الموظف.');
        } catch (err: any) {
          errorAlert('خطأ', err?.message || 'تعذّر الحذف.');
        }
      },
      true,
    );
  };

  const openNewPayment = () => {
    haptics.light();
    setEditingPay(null);
    setShowPaySheet(true);
  };

  // ─────────── render ───────────

  if (!userInstituteId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الرواتب"
        subtitle="إدارة الموظفين والدفعات"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(47,47,186,0.30)"
      />

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TabButton
          label="الموظفون"
          icon="people-outline"
          count={employees.length}
          active={tab === 'employees'}
          onPress={() => { haptics.selection(); setTab('employees'); }}
        />
        <TabButton
          label="الدفعات"
          icon="cash-outline"
          count={payments.length}
          active={tab === 'payments'}
          onPress={() => { haptics.selection(); setTab('payments'); }}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        >
          {tab === 'employees' ? (
            <EmployeesTab
              employees={filteredEmployees}
              total={employees.length}
              q={q}
              setQ={setQ}
              onAdd={openNewEmployee}
              onEdit={openEditEmployee}
            />
          ) : (
            <PaymentsTab
              year={year}
              month={month}
              setYear={setYear}
              setMonth={setMonth}
              stats={payStats}
              payments={payments}
              employees={employees}
              onAdd={openNewPayment}
              onEdit={(p) => { haptics.light(); setEditingPay(p); setShowPaySheet(true); }}
              onMarkPaid={(p) => { haptics.light(); setMarkPayTarget(p); }}
            />
          )}
        </KeyboardAwareScroll>
      )}

      {/* Employee form sheet */}
      <EmployeeFormSheet
        visible={showEmpSheet}
        instituteId={userInstituteId}
        initial={editingEmp}
        onClose={() => { setShowEmpSheet(false); setEditingEmp(null); }}
        onSaved={async () => {
          setShowEmpSheet(false);
          setEditingEmp(null);
          await load();
        }}
        onDelete={editingEmp ? () => handleDeleteEmployee(editingEmp) : undefined}
      />

      {/* Payment form sheet */}
      <PaymentFormSheet
        visible={showPaySheet}
        instituteId={userInstituteId}
        initial={editingPay}
        defaultYear={year}
        defaultMonth={month}
        employees={employees.filter((e) => e.is_active !== false)}
        onClose={() => { setShowPaySheet(false); setEditingPay(null); }}
        onSaved={async () => {
          setShowPaySheet(false);
          setEditingPay(null);
          await load();
        }}
      />

      {/* Mark-paid mini sheet */}
      <MarkPaidSheet
        target={markPayTarget}
        onClose={() => setMarkPayTarget(null)}
        onConfirmed={async () => {
          setMarkPayTarget(null);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

// ─────────── tab button ───────────

function TabButton({
  label, icon, count, active, onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? tokens.brand[500] : tokens.text[3]}
      />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 ? (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─────────── Employees tab ───────────

function EmployeesTab({
  employees, total, q, setQ, onAdd, onEdit,
}: {
  employees: PayrollEmployee[];
  total: number;
  q: string;
  setQ: (s: string) => void;
  onAdd: () => void;
  onEdit: (e: PayrollEmployee) => void;
}) {
  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <SectionLabel title="الموظفون" icon="people-outline" />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={tokens.text[4]} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="ابحث بالاسم أو الوظيفة..."
          placeholderTextColor={tokens.text[4]}
          style={styles.searchInput}
          textAlign="right"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={16} color={tokens.text[4]} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.addBtn} activeOpacity={0.9} onPress={onAdd}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>إضافة موظف</Text>
      </TouchableOpacity>

      {employees.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="people-outline" size={36} color={tokens.brand[500]} />
          </View>
          <Text style={styles.emptyTitle}>
            {total === 0 ? 'لا يوجد موظفون بعد' : 'لا نتائج للبحث'}
          </Text>
          <Text style={styles.emptyHint}>
            {total === 0 ? 'اضغط "إضافة موظف" لإنشاء أول سجل.' : 'جرّب كلمة بحث أخرى.'}
          </Text>
        </View>
      ) : (
        employees.map((e, i) => (
          <FadeSlideIn key={e.id} delay={Math.min(i * 25, 300)} translateFrom={8}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onEdit(e)}
              style={styles.row}
            >
              <View style={styles.avatarInitial}>
                <Text style={styles.avatarInitialText}>{getInitial(e.full_name)}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>{e.full_name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {e.job_title || '—'}{e.department ? ` · ${e.department}` : ''}
                </Text>
                <View style={styles.rowBadgeRow}>
                  <View style={styles.contractBadge}>
                    <Text style={styles.contractBadgeText}>
                      {CONTRACT_OPTIONS.find((c) => c.key === e.contract_type)?.label || e.contract_type}
                    </Text>
                  </View>
                  {e.is_active === false ? (
                    <View style={[styles.contractBadge, { backgroundColor: tokens.semantic.dangerBg }]}>
                      <Text style={[styles.contractBadgeText, { color: tokens.semantic.danger }]}>
                        موقوف
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.amountWrap}>
                <Text style={[styles.amountValue, { color: tokens.text[1] }]}>
                  {fmtIQ(e.base_salary)}
                </Text>
                <Text style={styles.amountLabel}>{e.currency || 'IQD'} · د.ع</Text>
              </View>
            </TouchableOpacity>
          </FadeSlideIn>
        ))
      )}
    </>
  );
}

// ─────────── Payments tab ───────────

function PaymentsTab({
  year, month, setYear, setMonth, stats, payments, employees, onAdd, onEdit, onMarkPaid,
}: {
  year: number;
  month: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
  stats: { totalGross: number; totalPaid: number; pendingCount: number };
  payments: PayrollPayment[];
  employees: PayrollEmployee[];
  onAdd: () => void;
  onEdit: (p: PayrollPayment) => void;
  onMarkPaid: (p: PayrollPayment) => void;
}) {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <SectionLabel title="الفترة" icon="calendar-outline" />
      </View>

      {/* Year chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ flexGrow: 0, marginBottom: 8 }}
      >
        {yearOptions.map((y) => (
          <TouchableOpacity
            key={y}
            onPress={() => { haptics.selection(); setYear(y); }}
            style={[styles.chip, year === y && styles.chipActive]}
          >
            <Text style={[styles.chipText, year === y && styles.chipTextActive]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ flexGrow: 0, marginBottom: 12 }}
      >
        {MONTHS_AR.map((label, idx) => {
          const m = idx + 1;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => { haptics.selection(); setMonth(m); }}
              style={[styles.chip, month === m && styles.chipActive]}
            >
              <Text style={[styles.chipText, month === m && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Summary cards */}
      <View style={styles.statsGrid}>
        <FadeSlideIn delay={0} translateFrom={10}>
          <View style={[styles.statCard, { backgroundColor: tokens.brand[100] }]}>
            <Ionicons name="cash-outline" size={22} color={tokens.brand[500]} />
            <Text style={[styles.statValue, { color: tokens.brand[500] }]}>
              {fmtIQ(stats.totalGross)}
            </Text>
            <Text style={styles.statLabel}>إجمالي الإجمالي</Text>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={60} translateFrom={10}>
          <View style={[styles.statCard, { backgroundColor: tokens.semantic.successBg }]}>
            <Ionicons name="checkmark-done-outline" size={22} color={tokens.semantic.success} />
            <Text style={[styles.statValue, { color: tokens.semantic.success }]}>
              {fmtIQ(stats.totalPaid)}
            </Text>
            <Text style={styles.statLabel}>المدفوع (صافي)</Text>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={120} translateFrom={10}>
          <View style={[styles.statCard, { backgroundColor: tokens.semantic.warningBg }]}>
            <Ionicons name="time-outline" size={22} color={tokens.semantic.warning} />
            <Text style={[styles.statValue, { color: tokens.semantic.warning }]}>
              {stats.pendingCount.toLocaleString('ar-IQ')}
            </Text>
            <Text style={styles.statLabel}>دفعات معلّقة</Text>
          </View>
        </FadeSlideIn>
      </View>

      <TouchableOpacity style={styles.addBtn} activeOpacity={0.9} onPress={onAdd}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>سجّل دفعة</Text>
      </TouchableOpacity>

      <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
        <SectionLabel title={`دفعات ${MONTHS_AR[month - 1]} ${year}`} icon="receipt-outline" />
      </View>

      {payments.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="receipt-outline" size={36} color={tokens.brand[500]} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد دفعات لهذه الفترة</Text>
          <Text style={styles.emptyHint}>
            {employees.length === 0
              ? 'أضف موظفاً أولاً ثم سجّل دفعة له.'
              : 'اضغط "سجّل دفعة" لتسجيل أول دفعة في هذه الفترة.'}
          </Text>
        </View>
      ) : (
        payments.map((p, i) => (
          <FadeSlideIn key={p.id} delay={Math.min(i * 25, 300)} translateFrom={8}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onEdit(p)}
              style={styles.row}
            >
              <View style={styles.avatarInitial}>
                <Text style={styles.avatarInitialText}>
                  {getInitial(p.employee_name || '?')}
                </Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {p.employee_name || '—'}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {p.employee_title || '—'}
                </Text>
                <View style={styles.rowBadgeRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      p.status === 'paid' && { backgroundColor: tokens.semantic.successBg },
                      p.status === 'pending' && { backgroundColor: tokens.semantic.warningBg },
                      p.status === 'cancelled' && { backgroundColor: tokens.semantic.dangerBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        p.status === 'paid' && { color: tokens.semantic.success },
                        p.status === 'pending' && { color: tokens.semantic.warning },
                        p.status === 'cancelled' && { color: tokens.semantic.danger },
                      ]}
                    >
                      {STATUS_LABEL[p.status]}
                    </Text>
                  </View>
                  {p.status === 'pending' ? (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); onMarkPaid(p); }}
                      style={styles.markPaidBtn}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle" size={14} color={tokens.semantic.success} />
                      <Text style={styles.markPaidText}>تم الدفع</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <View style={styles.amountWrap}>
                <Text style={[styles.amountValue, { color: tokens.semantic.success }]}>
                  {fmtIQ(p.net_amount)}
                </Text>
                <Text style={styles.amountLabel}>صافي · د.ع</Text>
              </View>
            </TouchableOpacity>
          </FadeSlideIn>
        ))
      )}
    </>
  );
}

// ─────────── Employee form sheet ───────────

function EmployeeFormSheet({
  visible, instituteId, initial, onClose, onSaved, onDelete,
}: {
  visible: boolean;
  instituteId: string;
  initial: PayrollEmployee | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [contractType, setContractType] = useState<ContractType>('monthly');
  const [baseSalary, setBaseSalary] = useState('');
  const [currency, setCurrency] = useState('IQD');
  const [hireDate, setHireDate] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset / hydrate whenever the sheet opens
  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setFullName(initial.full_name || '');
      setNationalId(initial.national_id || '');
      setJobTitle(initial.job_title || '');
      setDepartment(initial.department || '');
      setContractType(initial.contract_type || 'monthly');
      setBaseSalary(String(initial.base_salary ?? ''));
      setCurrency(initial.currency || 'IQD');
      setHireDate(initial.hire_date || '');
      setBankAccount(initial.bank_account || '');
      setPhone(initial.phone || '');
      setNotes(initial.notes || '');
      setIsActive(initial.is_active !== false);
    } else {
      setFullName(''); setNationalId(''); setJobTitle(''); setDepartment('');
      setContractType('monthly'); setBaseSalary(''); setCurrency('IQD');
      setHireDate(''); setBankAccount(''); setPhone(''); setNotes('');
      setIsActive(true);
    }
  }, [visible, initial]);

  const save = async () => {
    const name = fullName.trim();
    const job = jobTitle.trim();
    if (!name) { errorAlert('تنبيه', 'الاسم الكامل مطلوب.'); return; }
    if (!job)  { errorAlert('تنبيه', 'المسمى الوظيفي مطلوب.'); return; }
    const salary = Number(baseSalary || 0);
    if (Number.isNaN(salary) || salary < 0) {
      errorAlert('تنبيه', 'الراتب الأساسي غير صالح.'); return;
    }
    if (hireDate && !DATE_REGEX.test(hireDate.trim())) {
      errorAlert('تنبيه', 'صيغة تاريخ التعيين غير صحيحة (YYYY-MM-DD).'); return;
    }
    setSaving(true);
    try {
      // institute_id is re-stamped from the resolved userInstituteId — never
      // taken from the initial row's payload. This prevents a stale or
      // malformed `initial` from writing to a wrong tenant.
      await upsertEmployee({
        id: initial?.id,
        institute_id: instituteId,
        full_name: name,
        national_id: nationalId.trim() || null,
        job_title: job,
        department: department.trim() || null,
        contract_type: contractType,
        base_salary: salary,
        currency: currency.trim() || 'IQD',
        hire_date: hireDate.trim() || null,
        bank_account: bankAccount.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      });
      successAlert('تم', initial ? 'تم تحديث الموظف.' : 'تم إضافة الموظف.', onSaved);
    } catch (err: any) {
      errorAlert('خطأ', err?.message || 'تعذّر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92}>
      <View style={sheetStyles.header}>
        <TouchableOpacity onPress={onClose} style={sheetStyles.iconBtn}>
          <Ionicons name="close" size={22} color={tokens.text[2]} />
        </TouchableOpacity>
        <Text style={sheetStyles.title}>
          {initial ? 'تعديل موظف' : 'إضافة موظف'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={sheetStyles.body} keyboardShouldPersistTaps="handled">
        <Field label="الاسم الكامل *">
          <TextInput
            value={fullName} onChangeText={setFullName}
            placeholder="مثال: أحمد محمد علي"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <View style={sheetStyles.twoCol}>
          <Field label="الرقم الوطني" style={sheetStyles.colHalf}>
            <TextInput
              value={nationalId} onChangeText={setNationalId}
              placeholder="—"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              keyboardType="number-pad"
            />
          </Field>
          <Field label="رقم الهاتف" style={sheetStyles.colHalf}>
            <TextInput
              value={phone} onChangeText={setPhone}
              placeholder="07XXXXXXXXX"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              keyboardType="phone-pad"
            />
          </Field>
        </View>

        <Field label="المسمى الوظيفي *">
          <TextInput
            value={jobTitle} onChangeText={setJobTitle}
            placeholder="مثال: أستاذ رياضيات / موظف استقبال"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <Field label="القسم">
          <TextInput
            value={department} onChangeText={setDepartment}
            placeholder="مثال: التعليم الثانوي / الإدارة"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <Field label="نوع العقد">
          <View style={sheetStyles.chipsRow}>
            {CONTRACT_OPTIONS.map((opt) => {
              const active = contractType === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => { haptics.selection(); setContractType(opt.key); }}
                  style={[sheetStyles.smallChip, active && sheetStyles.smallChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[sheetStyles.smallChipText, active && sheetStyles.smallChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <View style={sheetStyles.twoCol}>
          <Field label="الراتب الأساسي" style={sheetStyles.colHalf}>
            <TextInput
              value={baseSalary} onChangeText={setBaseSalary}
              placeholder="0"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              keyboardType="decimal-pad"
            />
          </Field>
          <Field label="العملة" style={sheetStyles.colHalf}>
            <TextInput
              value={currency} onChangeText={setCurrency}
              placeholder="IQD"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              autoCapitalize="characters"
            />
          </Field>
        </View>

        <Field label="تاريخ التعيين (YYYY-MM-DD)">
          <TextInput
            value={hireDate} onChangeText={setHireDate}
            placeholder="2024-01-15"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="center"
          />
        </Field>

        <Field label="الحساب البنكي">
          <TextInput
            value={bankAccount} onChangeText={setBankAccount}
            placeholder="—"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <Field label="ملاحظات">
          <TextInput
            value={notes} onChangeText={setNotes}
            placeholder="—"
            placeholderTextColor={tokens.text[4]}
            style={[sheetStyles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            textAlign="right"
            multiline
          />
        </Field>

        {initial ? (
          <View style={sheetStyles.switchRow}>
            <Switch value={isActive} onValueChange={setIsActive} />
            <Text style={sheetStyles.switchLabel}>الموظف فعّال</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={sheetStyles.saveBtnText}>
                  {initial ? 'تحديث' : 'حفظ'}
                </Text>
              </>
          }
        </TouchableOpacity>

        {initial && onDelete ? (
          <TouchableOpacity
            style={sheetStyles.deleteBtn}
            onPress={onDelete}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color={tokens.semantic.danger} />
            <Text style={sheetStyles.deleteBtnText}>حذف الموظف</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SwipeableSheet>
  );
}

// ─────────── Payment form sheet ───────────

function PaymentFormSheet({
  visible, instituteId, initial, defaultYear, defaultMonth, employees, onClose, onSaved,
}: {
  visible: boolean;
  instituteId: string;
  initial: PayrollPayment | null;
  defaultYear: number;
  defaultMonth: number;
  employees: PayrollEmployee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [grossAmount, setGrossAmount] = useState('');
  const [deductions, setDeductions] = useState('0');
  const [bonuses, setBonuses] = useState('0');
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setEmployeeId(initial.employee_id || '');
      setGrossAmount(String(initial.gross_amount ?? ''));
      setDeductions(String(initial.deductions ?? '0'));
      setBonuses(String(initial.bonuses ?? '0'));
      setStatus(initial.status || 'pending');
      setPaymentMethod(initial.payment_method || 'cash');
      setReferenceNo(initial.reference_no || '');
      setNotes(initial.notes || '');
    } else {
      setEmployeeId('');
      setGrossAmount('');
      setDeductions('0');
      setBonuses('0');
      setStatus('pending');
      setPaymentMethod('cash');
      setReferenceNo('');
      setNotes('');
    }
  }, [visible, initial]);

  // Auto-fill gross from selected employee's base salary (only when creating
  // a NEW payment AND the user hasn't typed an amount yet).
  const pickEmployee = (e: PayrollEmployee) => {
    haptics.selection();
    setEmployeeId(e.id);
    if (!initial && (!grossAmount || grossAmount === '0')) {
      setGrossAmount(String(e.base_salary ?? ''));
    }
  };

  const gross = Number(grossAmount || 0) || 0;
  const ded   = Number(deductions || 0)  || 0;
  const bon   = Number(bonuses || 0)     || 0;
  const net   = Math.max(0, gross + bon - ded);

  const save = async () => {
    if (!employeeId) { errorAlert('تنبيه', 'اختر الموظف.'); return; }
    if (!grossAmount || Number.isNaN(gross) || gross <= 0) {
      errorAlert('تنبيه', 'المبلغ الإجمالي مطلوب.'); return;
    }
    setSaving(true);
    try {
      // Note on net_amount: the service layer doesn't compute it for us, so
      // we ship the computed value alongside the components. If the DB has a
      // generated column for net_amount it will override; otherwise our
      // value is stored as-is.
      await upsertPayment({
        id: initial?.id,
        institute_id: instituteId,
        employee_id: employeeId,
        period_year: initial?.period_year ?? defaultYear,
        period_month: initial?.period_month ?? defaultMonth,
        gross_amount: gross,
        deductions: ded,
        bonuses: bon,
        net_amount: net,
        status,
        payment_method: status === 'paid' ? paymentMethod : null,
        reference_no: referenceNo.trim() || null,
        notes: notes.trim() || null,
      });
      successAlert('تم', initial ? 'تم تحديث الدفعة.' : 'تم إنشاء الدفعة.', onSaved);
    } catch (err: any) {
      errorAlert('خطأ', err?.message || 'تعذّر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92}>
      <View style={sheetStyles.header}>
        <TouchableOpacity onPress={onClose} style={sheetStyles.iconBtn}>
          <Ionicons name="close" size={22} color={tokens.text[2]} />
        </TouchableOpacity>
        <Text style={sheetStyles.title}>
          {initial ? 'تعديل دفعة' : 'تسجيل دفعة'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={sheetStyles.body} keyboardShouldPersistTaps="handled">
        <Field label="الموظف *">
          {employees.length === 0 ? (
            <Text style={sheetStyles.muted}>لا يوجد موظفون فعّالون. أضف موظفاً أولاً.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {employees.map((e) => {
                const active = employeeId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => pickEmployee(e)}
                    style={[sheetStyles.empChip, active && sheetStyles.empChipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[sheetStyles.empChipText, active && sheetStyles.empChipTextActive]}>
                      {e.full_name}
                    </Text>
                    <Text style={[sheetStyles.empChipSub, active && { color: '#fff' }]}>
                      {e.job_title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Field>

        <View style={sheetStyles.periodInfo}>
          <Ionicons name="calendar-outline" size={14} color={tokens.text[3]} />
          <Text style={sheetStyles.periodInfoText}>
            الفترة: {MONTHS_AR[(initial?.period_month ?? defaultMonth) - 1]}{' '}
            {initial?.period_year ?? defaultYear}
          </Text>
        </View>

        <View style={sheetStyles.twoCol}>
          <Field label="المبلغ الإجمالي *" style={sheetStyles.colHalf}>
            <TextInput
              value={grossAmount} onChangeText={setGrossAmount}
              placeholder="0"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              keyboardType="decimal-pad"
            />
          </Field>
          <Field label="الاستقطاعات" style={sheetStyles.colHalf}>
            <TextInput
              value={deductions} onChangeText={setDeductions}
              placeholder="0"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="right"
              keyboardType="decimal-pad"
            />
          </Field>
        </View>

        <Field label="العلاوات / المكافآت">
          <TextInput
            value={bonuses} onChangeText={setBonuses}
            placeholder="0"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
            keyboardType="decimal-pad"
          />
        </Field>

        <View style={sheetStyles.netBox}>
          <Text style={sheetStyles.netLabel}>الصافي (حساب لحظي)</Text>
          <Text style={sheetStyles.netValue}>
            {fmtIQ(net)} <Text style={sheetStyles.netUnit}>د.ع</Text>
          </Text>
        </View>

        <Field label="الحالة">
          <View style={sheetStyles.chipsRow}>
            {(['pending', 'paid'] as PaymentStatus[]).map((s) => {
              const active = status === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => { haptics.selection(); setStatus(s); }}
                  style={[sheetStyles.smallChip, active && sheetStyles.smallChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[sheetStyles.smallChipText, active && sheetStyles.smallChipTextActive]}>
                    {STATUS_LABEL[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        {status === 'paid' ? (
          <>
            <Field label="طريقة الدفع">
              <View style={sheetStyles.chipsRow}>
                {PAY_METHODS.map((m) => {
                  const active = paymentMethod === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => { haptics.selection(); setPaymentMethod(m); }}
                      style={[sheetStyles.smallChip, active && sheetStyles.smallChipActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[sheetStyles.smallChipText, active && sheetStyles.smallChipTextActive]}>
                        {PAY_METHOD_LABEL[m]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            <Field label="رقم المرجع">
              <TextInput
                value={referenceNo} onChangeText={setReferenceNo}
                placeholder="رقم الإيصال / المعاملة"
                placeholderTextColor={tokens.text[4]}
                style={sheetStyles.input} textAlign="right"
              />
            </Field>
          </>
        ) : null}

        <Field label="ملاحظات">
          <TextInput
            value={notes} onChangeText={setNotes}
            placeholder="—"
            placeholderTextColor={tokens.text[4]}
            style={[sheetStyles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            textAlign="right"
            multiline
          />
        </Field>

        <TouchableOpacity
          style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={sheetStyles.saveBtnText}>
                  {initial ? 'تحديث' : 'حفظ'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </SwipeableSheet>
  );
}

// ─────────── Mark-paid mini sheet ───────────

function MarkPaidSheet({
  target, onClose, onConfirmed,
}: {
  target: PayrollPayment | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [method, setMethod] = useState<string>('cash');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) { setMethod('cash'); setRef(''); }
  }, [target]);

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await markPaymentPaid(target.id, method, ref.trim() || undefined);
      successAlert('تم', 'تم تسجيل الدفع.', onConfirmed);
    } catch (err: any) {
      errorAlert('خطأ', err?.message || 'تعذّر التحديث.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={!!target} onClose={onClose} maxHeight={0.55}>
      <View style={sheetStyles.header}>
        <TouchableOpacity onPress={onClose} style={sheetStyles.iconBtn}>
          <Ionicons name="close" size={22} color={tokens.text[2]} />
        </TouchableOpacity>
        <Text style={sheetStyles.title}>تأكيد الدفع</Text>
      </View>

      <ScrollView contentContainerStyle={sheetStyles.body} keyboardShouldPersistTaps="handled">
        {target ? (
          <View style={sheetStyles.confirmRow}>
            <Text style={sheetStyles.confirmName}>{target.employee_name}</Text>
            <Text style={sheetStyles.confirmAmount}>
              {fmtIQ(target.net_amount)} د.ع
            </Text>
          </View>
        ) : null}

        <Field label="طريقة الدفع">
          <View style={sheetStyles.chipsRow}>
            {PAY_METHODS.map((m) => {
              const active = method === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => { haptics.selection(); setMethod(m); }}
                  style={[sheetStyles.smallChip, active && sheetStyles.smallChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[sheetStyles.smallChipText, active && sheetStyles.smallChipTextActive]}>
                    {PAY_METHOD_LABEL[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="رقم المرجع (اختياري)">
          <TextInput
            value={ref} onChangeText={setRef}
            placeholder="رقم الإيصال / المعاملة"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <TouchableOpacity
          style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={sheetStyles.saveBtnText}>تأكيد الدفع</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </SwipeableSheet>
  );
}

// ─────────── Field helper ───────────

function Field({
  label, children, style,
}: {
  label: string;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={sheetStyles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─────────── styles ───────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  // Tabs
  tabsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tokens.surface.bg,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[1],
  },
  tabBtnActive: {
    backgroundColor: tokens.brand[100],
    borderColor: tokens.brand[500],
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[3],
  },
  tabTextActive: {
    color: tokens.brand[500],
  },
  tabBadge: {
    minWidth: 22, paddingHorizontal: 6,
    height: 20, borderRadius: 10,
    backgroundColor: tokens.border[1],
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: tokens.brand[500] },
  tabBadgeText: { fontSize: 11, color: tokens.text[3], fontWeight: '700' },
  tabBadgeTextActive: { color: '#fff' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    width: '31%',
    padding: 12,
    borderRadius: tokens.radius.lg,
    gap: 4,
    minHeight: 96,
    ...tokens.shadow.xs,
  },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10, color: tokens.text[3], fontWeight: '600' },

  // Search / inputs
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    ...tokens.shadow.xs,
  },
  searchInput: { flex: 1, fontSize: 13, color: tokens.text[1], padding: 0 },

  // Period chips
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[1],
  },
  chipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },

  // Add button
  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    marginBottom: 10,
    ...tokens.shadow.xs,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Row card (shared by both tabs)
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  avatarInitial: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitialText: {
    fontSize: 15, fontWeight: '800', color: tokens.brand[500],
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  rowMeta: { fontSize: 11, color: tokens.text[3], fontWeight: '500', textAlign: 'right', marginTop: 2 },
  rowBadgeRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  contractBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: tokens.brand[100],
  },
  contractBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.brand[500],
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: tokens.border[1],
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  markPaidBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: tokens.semantic.successBg,
  },
  markPaidText: { fontSize: 11, fontWeight: '700', color: tokens.semantic.success },
  amountWrap: { alignItems: 'flex-start', minWidth: 80 },
  amountValue: { fontSize: 14, fontWeight: '800' },
  amountLabel: { fontSize: 10, color: tokens.text[4], fontWeight: '600' },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
});

const sheetStyles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.surface.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'right',
  },
  body: { padding: 16, paddingTop: 8, gap: 4 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: tokens.text[2],
    textAlign: 'right', marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: tokens.text[1],
  },
  twoCol: { flexDirection: 'row-reverse', gap: 10 },
  colHalf: { flex: 1 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  smallChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[1],
  },
  smallChipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  smallChipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  smallChipTextActive: { color: '#fff' },
  empChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[1],
    minWidth: 140,
  },
  empChipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  empChipText: { fontSize: 13, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  empChipTextActive: { color: '#fff' },
  empChipSub: { fontSize: 10, color: tokens.text[3], fontWeight: '500', textAlign: 'right', marginTop: 2 },
  periodInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.brand[100],
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    marginBottom: 12,
  },
  periodInfoText: { fontSize: 12, fontWeight: '700', color: tokens.brand[500] },
  netBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.semantic.successBg,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  netLabel: { fontSize: 12, fontWeight: '700', color: tokens.semantic.success },
  netValue: { fontSize: 18, fontWeight: '900', color: tokens.semantic.success },
  netUnit: { fontSize: 11, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    marginTop: 4,
  },
  switchLabel: { fontSize: 13, fontWeight: '600', color: tokens.text[1] },
  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    paddingVertical: 13,
    borderRadius: tokens.radius.md,
    marginTop: 8,
    ...tokens.shadow.xs,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  deleteBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.semantic.dangerBg,
    paddingVertical: 11,
    borderRadius: tokens.radius.md,
    marginTop: 8,
  },
  deleteBtnText: { color: tokens.semantic.danger, fontWeight: '800', fontSize: 13 },
  muted: { fontSize: 12, color: tokens.text[3], fontWeight: '500', textAlign: 'right' },
  confirmRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.brand[100],
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    marginBottom: 12,
  },
  confirmName: { fontSize: 14, fontWeight: '800', color: tokens.brand[500] },
  confirmAmount: { fontSize: 16, fontWeight: '900', color: tokens.brand[500] },
});
