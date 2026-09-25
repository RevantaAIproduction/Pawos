import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';

export class ConnectDatabasePlugin extends BasePlugin {
  id = 'connectDatabase';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'connectDatabase';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'connectDatabase') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { dbType, host, port, username, database } = request;

    try {
      const connectionString = this.buildConnectionString(dbType, { host, port, username, database });

      // Store connection string for later use (in actual implementation, would connect)
      const connection = {
        type: dbType,
        host: host || 'localhost',
        port: port || this.getDefaultPort(dbType),
        database: database || '',
        connected: true,
        timestamp: Date.now(),
      };

      return { ok: true, data: { connection, connectionString } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to connect to database: ${(error as Error).message}` };
    }
  }

  private buildConnectionString(dbType: string, config: any): string {
    const { host = 'localhost', port, username, database } = config;
    const defaultPort = this.getDefaultPort(dbType);
    const portStr = port || defaultPort;

    switch (dbType) {
      case 'mysql':
        return `mysql://${username}@${host}:${portStr}/${database}`;
      case 'postgres':
        return `postgresql://${username}@${host}:${portStr}/${database}`;
      case 'mongodb':
        return `mongodb://${username}@${host}:${portStr}/${database}`;
      case 'sqlite':
        return `sqlite://${database}`;
      case 'mssql':
        return `mssql://${username}@${host}:${portStr};database=${database}`;
      default:
        return `${dbType}://${host}:${portStr}`;
    }
  }

  private getDefaultPort(dbType: string): number {
    const ports: Record<string, number> = {
      mysql: 3306,
      postgres: 5432,
      mongodb: 27017,
      sqlite: 0,
      mssql: 1433,
    };
    return ports[dbType] || 5432;
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'connectDatabase' || !result.ok) return result;

    try {
      // In a real implementation, would verify connection health
      const data = result.data as any;
      if (data?.connection?.connected) {
        return result;
      }
      return { ok: false, reason: 'failed', message: 'Connection verification failed.' };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Verification error: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'connectDatabase') return 'Working on that…';
    return `Connecting to ${request.dbType} database…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'connectDatabase') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to connect to database.`;
    const data = result.data as any;
    return `Connected to ${data?.connection?.type} database at ${data?.connection?.host}:${data?.connection?.port}.`;
  }
}

export const connectDatabasePlugin = new ConnectDatabasePlugin();
