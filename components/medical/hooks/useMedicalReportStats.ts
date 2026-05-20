// Memoized derived stats for the medical reports screen.
// Inputs: allRecords (raw rows from useMedicalStore.allRecords) + stats (totals).
// Output: blood-type counts, condition counts (top 10 sorted), per-field with-counts,
// coveragePercent, and maxBT. All split-by-comma strings handle both ASCII (,) and Arabic (،).
// IMPORTANT: keeps the "حساسية: " prefix on parsed allergy strings — this is how the
// reports screen distinguishes allergies from chronic conditions in the common-conditions list.
import { useMemo } from 'react';

interface MedicalRecordLike {
  blood_type?: string | null;
  blood_pressure?: string | null;
  sugar_level?: string | null;
  eyes?: string | null;
  dental?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
}

interface StatsLike {
  totalStudents: number;
  withRecords: number;
}

export interface MedicalReportStats {
  bloodTypeCounts: Record<string, number>;
  maxBT: number;
  conditionCounts: Record<string, number>;
  sortedConditions: Array<[string, number]>;
  coveragePercent: number;
  withPressure: number;
  withSugar: number;
  withEyes: number;
  withDental: number;
  withAllergies: number;
  withChronic: number;
}

export function useMedicalReportStats(
  allRecords: MedicalRecordLike[],
  stats: StatsLike,
): MedicalReportStats {
  return useMemo(() => {
    const bloodTypeCounts: Record<string, number> = {};
    const conditionCounts: Record<string, number> = {};
    let withPressure = 0;
    let withSugar = 0;
    let withEyes = 0;
    let withDental = 0;
    let withAllergies = 0;
    let withChronic = 0;

    for (const r of allRecords) {
      if (r.blood_type) {
        bloodTypeCounts[r.blood_type] = (bloodTypeCounts[r.blood_type] || 0) + 1;
      }
      if (r.chronic_conditions) {
        for (const c of r.chronic_conditions.split(/[,،]/).map((s) => s.trim()).filter(Boolean)) {
          conditionCounts[c] = (conditionCounts[c] || 0) + 1;
        }
      }
      if (r.allergies) {
        for (const a of r.allergies.split(/[,،]/).map((s) => s.trim()).filter(Boolean)) {
          const key = `حساسية: ${a}`;
          conditionCounts[key] = (conditionCounts[key] || 0) + 1;
        }
      }
      if (r.blood_pressure) withPressure++;
      if (r.sugar_level) withSugar++;
      if (r.eyes) withEyes++;
      if (r.dental) withDental++;
      if (r.allergies) withAllergies++;
      if (r.chronic_conditions) withChronic++;
    }

    const maxBT = Math.max(...Object.values(bloodTypeCounts), 1);
    const sortedConditions = Object.entries(conditionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const coveragePercent =
      stats.totalStudents > 0
        ? Math.round((stats.withRecords / stats.totalStudents) * 100)
        : 0;

    return {
      bloodTypeCounts,
      maxBT,
      conditionCounts,
      sortedConditions,
      coveragePercent,
      withPressure,
      withSugar,
      withEyes,
      withDental,
      withAllergies,
      withChronic,
    };
  }, [allRecords, stats.totalStudents, stats.withRecords]);
}
