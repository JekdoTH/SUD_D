import { v4 as uuidv4 } from 'uuid';
import type {
  ConnectionProfile,
  ConnectionProfileUpdate,
  ConnectionProvider,
  ConnectionTransport,
  NewConnectionProfile,
} from '@sud-d/domain';
import type { Db } from './database.js';

interface ConnectionProfileRow {
  profile_id: string;
  display_name: string;
  provider: string;
  transport: string;
  device_name: string;
  auto_start: number;
  auto_restart: number;
  tunnel_reference: string | null;
  created_at: string;
  updated_at: string;
}

function rowToConnectionProfile(row: ConnectionProfileRow): ConnectionProfile {
  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    provider: row.provider as ConnectionProvider,
    transport: row.transport as ConnectionTransport,
    deviceName: row.device_name,
    autoStart: row.auto_start === 1,
    autoRestart: row.auto_restart === 1,
    ...(row.tunnel_reference === null ? {} : { tunnelReference: row.tunnel_reference }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface ConnectionProfileRepository {
  list(): ConnectionProfile[];
  findById(profileId: string): ConnectionProfile | undefined;
  save(input: NewConnectionProfile): ConnectionProfile;
  update(profileId: string, update: ConnectionProfileUpdate): ConnectionProfile | undefined;
}

export function createConnectionProfileRepository(db: Db): ConnectionProfileRepository {
  const list = (): ConnectionProfile[] => {
    const rows = db
      .prepare('SELECT * FROM connection_profiles ORDER BY created_at ASC, profile_id ASC')
      .all() as ConnectionProfileRow[];
    return rows.map(rowToConnectionProfile);
  };

  const findById = (profileId: string): ConnectionProfile | undefined => {
    const row = db
      .prepare('SELECT * FROM connection_profiles WHERE profile_id = ?')
      .get(profileId) as ConnectionProfileRow | undefined;
    return row ? rowToConnectionProfile(row) : undefined;
  };

  return {
    list,
    findById,

    save(input: NewConnectionProfile): ConnectionProfile {
      const profileId = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO connection_profiles(
          profile_id, display_name, provider, transport, device_name,
          auto_start, auto_restart, tunnel_reference, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        profileId,
        input.displayName,
        input.provider,
        input.transport,
        input.deviceName,
        input.autoStart ? 1 : 0,
        input.autoRestart ? 1 : 0,
        input.tunnelReference ?? null,
        now,
        now,
      );
      return findById(profileId) as ConnectionProfile;
    },

    update(profileId: string, update: ConnectionProfileUpdate): ConnectionProfile | undefined {
      const current = findById(profileId);
      if (!current) return undefined;

      const now = new Date().toISOString();
      const tunnelReference =
        update.tunnelReference === undefined
          ? current.tunnelReference
          : update.tunnelReference ?? undefined;

      db.prepare(
        `UPDATE connection_profiles
         SET display_name = ?, device_name = ?, auto_start = ?, auto_restart = ?,
             tunnel_reference = ?, updated_at = ?
         WHERE profile_id = ?`,
      ).run(
        update.displayName ?? current.displayName,
        update.deviceName ?? current.deviceName,
        (update.autoStart ?? current.autoStart) ? 1 : 0,
        (update.autoRestart ?? current.autoRestart) ? 1 : 0,
        tunnelReference ?? null,
        now,
        profileId,
      );

      return findById(profileId);
    },
  };
}
