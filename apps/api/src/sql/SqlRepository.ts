import { DefaultAzureCredential } from '@azure/identity';
import type { Caller, Repository } from '@sic/shared';
import { SicError } from '@sic/shared';
import { run, type SqlPoolLike } from './run.js';

/**
 * SQL-backed repository. Overnight agents never construct this against live;
 * unit tests inject a fake pool. Methods throw until morning switch-over fills them in.
 */
export class SqlRepository implements Repository {
  constructor(
    private readonly pool: SqlPoolLike,
    _credential?: DefaultAzureCredential,
  ) {}

  /** Exposed for unit tests. */
  async runBatch(caller: Caller, sql: string, params?: Record<string, unknown>) {
    return run(this.pool, caller, sql, params);
  }

  private notImplemented(): never {
    throw new SicError(50000, 400, 'SqlRepository method not wired in overnight stub');
  }

  upsertUser = async () => this.notImplemented();
  getMe = async () => this.notImplemented();
  listSites = async () => this.notImplemented();
  getSiteConfig = async () => this.notImplemented();
  getSicVersion = async () => this.notImplemented();
  listDays = async () => this.notImplemented();
  getSicHours = async () => this.notImplemented();
  addComment = async () => this.notImplemented();
  listComments = async () => this.notImplemented();
  saveAction = async () => this.notImplemented();
  listActions = async () => this.notImplemented();
  getAction = async () => this.notImplemented();
  listActionUpdates = async () => this.notImplemented();
  listEscalations = async () => this.notImplemented();
  getEscalation = async () => this.notImplemented();
  ackEscalation = async () => this.notImplemented();
  listInbox = async () => this.notImplemented();
  markRead = async () => this.notImplemented();
  getSitePeople = async () => this.notImplemented();
  getSiteUsers = async () => this.notImplemented();
  saveUserSiteRole = async () => this.notImplemented();
  saveSiteSettings = async () => this.notImplemented();
  saveArea = async () => this.notImplemented();
  saveLine = async () => this.notImplemented();
  saveReasonCode = async () => this.notImplemented();
  saveEscalationRule = async () => this.notImplemented();
  saveNotificationTarget = async () => this.notImplemented();
  saveDeviceKey = async () => this.notImplemented();
  getArticleKeyGaps = async () => this.notImplemented();
  saveArticleKeyMap = async () => this.notImplemented();
  queueTestNotification = async () => this.notImplemented();
  getNotificationPreview = async () => this.notImplemented();
  resolveDeviceKey = async () => this.notImplemented();
  evaluateEscalations = async () => this.notImplemented();
  claimNotifications = async () => this.notImplemented();
  completeNotification = async () => this.notImplemented();
}
