import { getSyncQueue, removeFromSyncQueue } from './offlineStorage';
import { api } from './api';

/**
 * Process all pending operations in the sync queue.
 * Called automatically when connectivity is restored.
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getSyncQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of queue) {
    try {
      switch (op.type) {
        case 'attendance':
          await api.submitQRAttendance(
            op.payload.sessionToken,
            op.payload.studentId,
            op.payload.studentName,
            op.payload.instituteId
          );
          break;

        case 'message':
          await api.sendMessage(
            op.payload.senderId,
            op.payload.receiverId,
            op.payload.content
          );
          break;

        case 'justification':
          await api.createJustification(
            op.payload.studentId,
            op.payload.attendanceId,
            op.payload.reason
          );
          break;

        case 'task_submit':
          // Offline-queued payloads may have been enqueued before instituteId/fileUrl
          // fields were added. Pass them through when present so the new strict
          // institute check in api.submitTask can validate, or fall through to
          // the API's RLS-based guard when absent.
          await api.submitTask(
            op.payload.taskId,
            op.payload.studentId,
            op.payload.content,
            op.payload.fileUrl,
            op.payload.instituteId,
          );
          break;
      }

      await removeFromSyncQueue(op.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
