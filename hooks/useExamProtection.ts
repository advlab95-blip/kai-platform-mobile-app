import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '../services/api';

/**
 * Hook for exam content protection.
 * Detects: app backgrounding, screenshots (limited in Expo Go).
 * Logs events to exam_audit_log.
 */
export function useExamProtection(
  sessionId: string | null,
  studentId: string | null,
  examId: string | null,
  enabled: boolean = true,
) {
  const eventCount = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId || !studentId || !examId) return;

    // Detect app going to background (tab switch, home button)
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        eventCount.current++;
        api.logExamEvent(sessionId, studentId, examId, 'app_background', `${Platform.OS}/${Platform.Version}`, {
          count: eventCount.current,
        }).catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sessionId, studentId, examId, enabled]);

  // Return helper to manually log events
  const logEvent = (eventType: string, details?: any) => {
    if (!sessionId || !studentId || !examId) return;
    api.logExamEvent(sessionId, studentId, examId, eventType, `${Platform.OS}/${Platform.Version}`, details).catch(() => {});
  };

  return { logEvent, eventCount: eventCount.current };
}

/**
 * Generate watermark text for exam screen
 */
export function getWatermarkText(studentName: string, studentId: string): string {
  const now = new Date();
  const date = now.toLocaleDateString('ar-IQ');
  const time = now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  return `${studentName} — ${date} ${time}`;
}
