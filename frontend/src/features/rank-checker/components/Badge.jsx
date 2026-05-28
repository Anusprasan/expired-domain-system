function Badge({ badge, selectedBrandColor }) {
  if (badge === 'OWN') {
    return (
      <span
        className="inline-flex items-center rounded-md border-l-4 border-green-700 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700"
        style={{ borderLeftColor: selectedBrandColor || '#15803d' }}
      >
        OWN
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
      UNKNOWN
    </span>
  );
}

export default Badge;
