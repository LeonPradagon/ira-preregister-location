// Producers and workers must use the same names when creating BullMQ queues.
export const queueNames = {
  outbox: 'ira_preregist-outbox',
  reminders: 'ira_preregist-reminders',
  campaignMaterialization: 'ira_preregist-campaign-materialization',
  campaignSend: 'ira_preregist-campaign-send',
  metrics: 'ira_preregist-metrics',
  imports: 'ira_preregist-imports',
  coordinateAudit: 'ira_preregist-coordinate-audit',
} as const;
