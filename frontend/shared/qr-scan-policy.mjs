export const QR_SCAN_ATTEMPT_DELAY_MS = 100;
export const QR_SCAN_SUCCESS_DELAY_MS = 100;
export const QR_SCAN_REARM_DELAY_MS = 300;

export function shouldRearmRepeatedQr(lastSeenAt, now) {
  return now - lastSeenAt >= QR_SCAN_REARM_DELAY_MS;
}
