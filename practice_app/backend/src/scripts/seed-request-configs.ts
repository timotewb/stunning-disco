/**
 * Seeds default taxonomy config values for Work Requests.
 * Only inserts if the table is empty — fully idempotent.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SOURCES = [
  { name: 'MS Teams',              color: 'indigo',  orderIndex: 0 },
  { name: 'Slack',                 color: 'green',   orderIndex: 1 },
  { name: 'Jira',                  color: 'blue',    orderIndex: 2 },
  { name: 'Asana',                 color: 'teal',    orderIndex: 3 },
  { name: 'Phone / Video Call',    color: 'purple',  orderIndex: 4 },
  { name: 'In-person / Chat',      color: 'amber',   orderIndex: 5 },
  { name: 'Quarterly / Sprint Planning', color: 'rose', orderIndex: 6 },
  { name: 'Email',                 color: 'cyan',    orderIndex: 7 },
  { name: 'Other',                 color: 'gray',    orderIndex: 8 },
];

const DEFAULT_TYPES = [
  { name: 'New Feature / Enhancement', color: 'indigo',  orderIndex: 0 },
  { name: 'Bug Fix',                   color: 'rose',    orderIndex: 1 },
  { name: 'Advice / Consultation',     color: 'amber',   orderIndex: 2 },
  { name: 'Operational Support',       color: 'orange',  orderIndex: 3 },
  { name: 'Infrastructure / Platform', color: 'blue',    orderIndex: 4 },
  { name: 'Planning / Strategy',       color: 'purple',  orderIndex: 5 },
  { name: 'Research / Discovery',      color: 'teal',    orderIndex: 6 },
  { name: 'Other',                     color: 'gray',    orderIndex: 7 },
];

const DEFAULT_PRIORITIES = [
  { name: 'Critical', color: 'rose',   orderIndex: 0 },
  { name: 'High',     color: 'amber',  orderIndex: 1 },
  { name: 'Medium',   color: 'indigo', orderIndex: 2 },
  { name: 'Low',      color: 'gray',   orderIndex: 3 },
];

const DEFAULT_STATUSES = [
  { name: 'draft',     color: 'amber',  orderIndex: 0 },
  { name: 'new',       color: 'blue',   orderIndex: 1 },
  { name: 'assessed',  color: 'indigo', orderIndex: 2 },
  { name: 'in-flight', color: 'green',  orderIndex: 3 },
  { name: 'resolved',  color: 'teal',   orderIndex: 4 },
  { name: 'deferred',  color: 'gray',   orderIndex: 5 },
  { name: 'rejected',  color: 'rose',   orderIndex: 6 },
];

const DEFAULT_EFFORTS = [
  { name: 'XS — hours',            value: 'xs', orderIndex: 0 },
  { name: 'S — 1–2 days',          value: 's',  orderIndex: 1 },
  { name: 'M — up to a week',      value: 'm',  orderIndex: 2 },
  { name: 'L — up to a month',     value: 'l',  orderIndex: 3 },
  { name: 'XL — multiple months',  value: 'xl', orderIndex: 4 },
];

export async function seedRequestConfigs() {
  const [
    sourceCount,
    typeCount,
    priorityCount,
    statusCount,
    effortCount,
  ] = await Promise.all([
    prisma.requestSourceConfig.count(),
    prisma.requestTypeConfig.count(),
    prisma.requestPriorityConfig.count(),
    prisma.requestStatusConfig.count(),
    prisma.requestEffortConfig.count(),
  ]);

  await Promise.all([
    sourceCount === 0
      ? prisma.requestSourceConfig.createMany({ data: DEFAULT_SOURCES })
      : Promise.resolve(),
    typeCount === 0
      ? prisma.requestTypeConfig.createMany({ data: DEFAULT_TYPES })
      : Promise.resolve(),
    priorityCount === 0
      ? prisma.requestPriorityConfig.createMany({ data: DEFAULT_PRIORITIES })
      : Promise.resolve(),
    statusCount === 0
      ? prisma.requestStatusConfig.createMany({ data: DEFAULT_STATUSES })
      : Promise.resolve(),
    effortCount === 0
      ? prisma.requestEffortConfig.createMany({ data: DEFAULT_EFFORTS })
      : Promise.resolve(),
  ]);

  console.log('[startup] request config seeding complete');
}

seedRequestConfigs()
  .catch((e) => console.error('[startup] seed-request-configs failed:', e))
  .finally(() => prisma.$disconnect());
