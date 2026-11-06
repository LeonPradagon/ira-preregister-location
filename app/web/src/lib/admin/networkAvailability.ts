export function networkAvailabilityLabel(latestCoverageStatus?: string | null, importedStatus?: string | null): string {
  if (latestCoverageStatus === 'COVERED') return 'customers.coverageAvailable';
  if (latestCoverageStatus === 'UNCOVERED') return 'customers.coverageUnavailable';
  if (latestCoverageStatus === 'QUEUED' || latestCoverageStatus === 'PROCESSING' || latestCoverageStatus === 'FAILED')
    return `coverage.status.${latestCoverageStatus}`;

  if (importedStatus === 'COVERED BTS') return 'customers.coverageAvailable';
  if (importedStatus === 'KELURAHAN BTS SAMA') return 'customers.coverageSameArea';
  if (importedStatus === 'NOT COVERED BTS') return 'customers.coverageUnavailable';
  return 'customers.coverageUnknown';
}

export function fwaCoverageLabel(latestCoverageStatus?: string | null, importedStatus?: string | null): string {
  return latestCoverageStatus && latestCoverageStatus !== 'NOT_CHECKED'
    ? `coverage.status.${latestCoverageStatus}`
    : importedStatus || '—';
}
