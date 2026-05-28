import Badge from './Badge';

function ResultsList({ selectedBrand, payload }) {
  if (!payload) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Select a brand and run a check to view top 10 results.
      </div>
    );
  }

  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    return (
      <div className="rounded-md border border-slate-300 bg-white p-6 text-sm text-slate-600">
        No top 10 results were returned for this search. Try another query, device, or country if this looks unexpected.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        OWN results are based only on domains saved for the selected brand.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-slate-200 text-sm table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-10 px-4 py-3 text-left font-semibold">#</th>
              <th className="w-1/2 px-4 py-3 text-left font-semibold">Title & Link</th>
              <th className="w-36 px-4 py-3 text-left font-semibold">Domain</th>
              <th className="w-36 px-4 py-3 text-left font-semibold">Matched Added Domain</th>
              <th className="w-24 px-4 py-3 text-left font-semibold">Badge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payload.results.map((row) => (
            <tr
              key={`${row.rank}-${row.link}`}
              className={row.badge === 'OWN' ? 'bg-emerald-100/90 hover:bg-emerald-100' : ''}
            >
              <td className="px-4 py-3 font-semibold">{row.rank}</td>
              <td className="px-4 py-3">
                <a
                  href={row.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-700 hover:underline line-clamp-2"
                >
                  {row.title}
                </a>
                {row.snippet && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-700">
                    {row.snippet}
                  </p>
                )}
                <p className="mt-1 truncate text-xs text-slate-500">{row.link}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs truncate">{row.domainHost || '-'}</td>
              <td className="px-4 py-3 text-xs text-slate-700 truncate">
                {row.matchedDomain?.domain || '-'}
              </td>
              <td className="px-4 py-3">
                <Badge
                  badge={row.badge}
                  selectedBrandColor={selectedBrand?.color}
                />
              </td>
            </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ResultsList;
