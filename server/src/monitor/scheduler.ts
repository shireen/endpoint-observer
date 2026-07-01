import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from '../logger.js';
import { runPing, type MonitorDeps } from './service.js';

/**
 * Registers the recurring ping (default: every 5 minutes) and fires one
 * immediately so the dashboard has data the moment the server boots.
 */
export function startScheduler(
  deps: MonitorDeps,
  cronExpression: string,
  logger: Logger,
): ScheduledTask {
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid PING_CRON expression: "${cronExpression}"`);
  }

  const safeRun = () =>
    runPing(deps).catch((err: unknown) => {
      // pingOnce never throws, so this only guards unexpected bugs (e.g. DB errors).
      logger.error({ err }, 'monitor cycle failed');
    });

  void safeRun();
  const task = cron.schedule(cronExpression, safeRun);
  logger.info({ cron: cronExpression, url: deps.pingUrl }, 'monitor scheduled');
  return task;
}
