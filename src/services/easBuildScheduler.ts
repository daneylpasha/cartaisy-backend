import cron from 'node-cron';
import { redactEasLogText } from './easBuildClient';
import { pollInFlightEasBuilds } from './easBuildService';
import { pollInFlightStoreSubmits, redactSubmitLogText } from './easSubmitService';

/**
 * Polls in-flight Cartaisy EAS workflow runs and store submits once a minute.
 * Started with the other schedulers. Jest skips it so the process can exit.
 */
class EasBuildScheduler {
  private started = false;
  private tickInFlight = false;
  private cronJob: ReturnType<typeof cron.schedule> | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.cronJob = cron.schedule('* * * * *', async () => {
      if (this.tickInFlight) {
        return;
      }
      this.tickInFlight = true;
      try {
        await pollInFlightEasBuilds();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'poll failed';
        console.warn('[eas-build] poll error', { message: redactEasLogText(message) });
      }
      try {
        await pollInFlightStoreSubmits();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'poll failed';
        console.warn('[eas-submit] poll error', { message: redactSubmitLogText(message) });
      } finally {
        this.tickInFlight = false;
      }
    });

    this.started = true;
    console.log('[eas-build] scheduler started');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.started = false;
  }
}

export const easBuildScheduler = new EasBuildScheduler();
