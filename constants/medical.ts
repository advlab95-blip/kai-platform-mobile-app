// Shared constants for the medical role.
// Consumed by app/(medical)/records.tsx and app/(medical)/reports.tsx.
// De-duplicates the blood-type and health-field maps that previously lived in both files.

import { tokens } from './designTokens';

export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type BloodType = typeof BLOOD_TYPES[number];

export const BLOOD_TYPE_COLORS: Record<string, string> = {
  'O+':  tokens.color.btOpos,  'O-': tokens.color.btOneg,
  'A+':  tokens.color.btApos,  'A-': tokens.color.btAneg,
  'B+':  tokens.color.btBpos,  'B-': tokens.color.btBneg,
  'AB+': tokens.color.btABpos, 'AB-': tokens.color.btABneg,
};

export type HealthFieldKey =
  | 'blood_pressure'
  | 'sugar_level'
  | 'eyes'
  | 'dental'
  | 'allergies'
  | 'chronic_conditions';

export interface HealthField {
  key: HealthFieldKey;
  labelKey: string;
  icon: string;
  color: string;
  bg: string;
}

export const HEALTH_FIELDS: readonly HealthField[] = [
  { key: 'blood_pressure',     labelKey: 'medical.bloodPressure',   icon: 'heart',        color: tokens.color.fieldHeart,   bg: tokens.color.fieldHeartBg },
  { key: 'sugar_level',        labelKey: 'medical.sugarLevel',      icon: 'thermometer',  color: tokens.color.fieldThermo,  bg: tokens.color.fieldThermoBg },
  { key: 'eyes',               labelKey: 'medical.eyeHealth',       icon: 'eye',          color: tokens.color.fieldEye,     bg: tokens.color.fieldEyeBg },
  { key: 'dental',             labelKey: 'medical.dentalHealth',    icon: 'happy',        color: tokens.color.fieldDental,  bg: tokens.color.fieldDentalBg },
  { key: 'allergies',          labelKey: 'medical.drugAllergies',   icon: 'alert-circle', color: tokens.color.fieldAllergy, bg: tokens.color.fieldAllergyBg },
  { key: 'chronic_conditions', labelKey: 'medical.chronicDiseases', icon: 'fitness',      color: tokens.color.fieldChronic, bg: tokens.color.fieldChronicBg },
] as const;
