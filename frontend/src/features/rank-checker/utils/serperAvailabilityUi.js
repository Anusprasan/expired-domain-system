const WARNING_CODES = new Set(['serper_no_active_key']);

export function getSerperAvailabilityTone(availability) {
  if (!availability || availability.available !== false) {
    return null;
  }

  return WARNING_CODES.has(String(availability.code || '').trim()) ? 'warning' : 'danger';
}

export function getSerperAvailabilityAlertClassName(availability) {
  const tone = getSerperAvailabilityTone(availability);

  if (tone === 'warning') {
    return 'border border-amber-200 bg-amber-50 text-amber-900';
  }

  return 'border border-red-200 bg-red-50 text-red-700';
}

export function shouldHideDuplicateSerperError(errorMessage, availability) {
  if (!errorMessage || availability?.available !== false) {
    return false;
  }

  return String(errorMessage).trim() === String(availability?.message || '').trim();
}
