import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  backupDatabaseAsync,
  deserializeDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DATABASE_SCHEMA_VERSION, initializeDatabase } from './database';

const BACKUP_FORMAT = 'solepos-backup';
const DATABASE_ENTRY = 'database.sqlite';
const MANIFEST_ENTRY = 'manifest.json';
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  databaseVersion: typeof DATABASE_SCHEMA_VERSION;
  createdAt: string;
  receipts: { path: string; sourceUri: string }[];
};

function inspectZipDirectory(archive: Uint8Array): Set<string> {
  if (archive.byteLength < 22) throw new Error('Selected file is not a supported backup archive.');
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const minimumEndRecordOffset = Math.max(0, archive.byteLength - 65_557);
  let endRecordOffset = -1;
  for (let offset = archive.byteLength - 22; offset >= minimumEndRecordOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0) throw new Error('Selected file is not a supported backup archive.');

  const diskNumber = view.getUint16(endRecordOffset + 4, true);
  const directoryDisk = view.getUint16(endRecordOffset + 6, true);
  const entriesOnDisk = view.getUint16(endRecordOffset + 8, true);
  const entryCount = view.getUint16(endRecordOffset + 10, true);
  const directorySize = view.getUint32(endRecordOffset + 12, true);
  const directoryOffset = view.getUint32(endRecordOffset + 16, true);
  const commentLength = view.getUint16(endRecordOffset + 20, true);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount > 10_002 ||
    directoryOffset + directorySize !== endRecordOffset ||
    endRecordOffset + 22 + commentLength !== archive.byteLength
  ) {
    throw new Error('Backup archive structure is unsupported or invalid.');
  }

  const paths = new Set<string>();
  let expandedBytes = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endRecordOffset || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Backup archive directory is corrupt.');
    }
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const entryEnd = offset + 46 + fileNameLength + extraLength + fileCommentLength;
    if (entryEnd > endRecordOffset || (flags & 1) !== 0 || (compressionMethod !== 0 && compressionMethod !== 8)) {
      throw new Error('Backup contains an encrypted or unsupported archive entry.');
    }

    const path = strFromU8(archive.subarray(offset + 46, offset + 46 + fileNameLength));
    if (
      path !== DATABASE_ENTRY &&
      path !== MANIFEST_ENTRY &&
      path !== 'receipts/' &&
      !/^receipts\/\d{6}\.(jpg|png|webp)$/.test(path)
    ) {
      throw new Error('Backup contains an unsupported file.');
    }
    if (paths.has(path)) throw new Error('Backup contains duplicate file entries.');
    paths.add(path);
    expandedBytes += expandedSize;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('Backup expands beyond the 256 MB safety limit.');
    }
    if (path.startsWith('receipts/') && path !== 'receipts/' && expandedSize > MAX_RECEIPT_BYTES) {
      throw new Error('A backup receipt exceeds the 8 MB safety limit.');
    }

    if (
      localHeaderOffset + 30 > directoryOffset ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      throw new Error('Backup archive entry has an invalid local header.');
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const localPath = strFromU8(archive.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength));
    if (localPath !== path || dataOffset + compressedSize > directoryOffset) {
      throw new Error('Backup archive entry is truncated or inconsistent.');
    }
    offset = entryEnd;
  }
  if (offset !== directoryOffset + directorySize) throw new Error('Backup archive directory length is invalid.');
  return paths;
}

function getReceiptExtension(uri: string): 'jpg' | 'png' | 'webp' {
  const extension = uri.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  if (extension === 'png' || extension === 'webp') return extension;
  return 'jpg';
}

async function getReceiptUris(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ uri: string }>(`
    SELECT receipt_uri AS uri FROM sales WHERE receipt_uri IS NOT NULL
    UNION
    SELECT receipt_uri AS uri FROM expenses WHERE receipt_uri IS NOT NULL
    UNION
    SELECT receipt_uri AS uri FROM procurements WHERE receipt_uri IS NOT NULL
  `);
  return rows.map(({ uri }) => uri);
}

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const receiptUris = await getReceiptUris(db);
  if (receiptUris.length > 10_000) throw new Error('Backup contains more receipts than the export limit.');
  const databaseBytes = await db.serializeAsync('main');
  if (databaseBytes.byteLength > MAX_EXPANDED_BYTES) {
    throw new Error('The database is larger than the 256 MB backup limit.');
  }
  const archiveEntries: Record<string, Uint8Array> = {
    [DATABASE_ENTRY]: databaseBytes,
  };
  const receipts: BackupManifest['receipts'] = [];
  let expandedBytes = databaseBytes.byteLength;

  for (const [index, uri] of receiptUris.entries()) {
    const receipt = new File(uri);
    if (!receipt.exists) {
      throw new Error(`A receipt referenced by the database is missing: ${receipt.name}`);
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      throw new Error(`Receipt ${receipt.name} is larger than the backup limit.`);
    }
    const path = `receipts/${String(index).padStart(6, '0')}.${getReceiptExtension(uri)}`;
    const receiptBytes = await receipt.bytes();
    expandedBytes += receiptBytes.byteLength;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('Backup contents exceed the 256 MB safety limit.');
    }
    archiveEntries[path] = receiptBytes;
    receipts.push({ path, sourceUri: uri });
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    databaseVersion: DATABASE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    receipts,
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  expandedBytes += manifestBytes.byteLength;
  if (expandedBytes > MAX_EXPANDED_BYTES) {
    throw new Error('Backup contents exceed the 256 MB safety limit.');
  }
  archiveEntries[MANIFEST_ENTRY] = manifestBytes;

  const archive = zipSync(archiveEntries, { level: 1 });
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Backup is larger than the 128 MB export limit.');
  }

  const backupFile = new File(Paths.cache, `solepos-backup-${Date.now()}.zip`);
  try {
    backupFile.write(archive);
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('File sharing is not available on this device.');
    }
    await Sharing.shareAsync(backupFile.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Export SolePOS backup',
      UTI: 'public.zip-archive',
    });
  } finally {
    if (backupFile.exists) backupFile.delete();
  }
}

function parseManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('Backup manifest is invalid.');
  const candidate = value as Partial<BackupManifest>;
  if (
    candidate.format !== BACKUP_FORMAT ||
    candidate.databaseVersion !== DATABASE_SCHEMA_VERSION ||
    !Array.isArray(candidate.receipts) ||
    typeof candidate.createdAt !== 'string'
  ) {
    throw new Error('This backup is not compatible with this app version.');
  }

  const usedPaths = new Set<string>();
  const usedUris = new Set<string>();
  const receipts = candidate.receipts.map((receipt) => {
    if (
      !receipt ||
      typeof receipt.path !== 'string' ||
      !/^receipts\/\d{6}\.(jpg|png|webp)$/.test(receipt.path) ||
      typeof receipt.sourceUri !== 'string' ||
      receipt.sourceUri.length === 0 ||
      usedPaths.has(receipt.path) ||
      usedUris.has(receipt.sourceUri)
    ) {
      throw new Error('Backup contains an invalid receipt reference.');
    }
    usedPaths.add(receipt.path);
    usedUris.add(receipt.sourceUri);
    return { path: receipt.path, sourceUri: receipt.sourceUri };
  });

  return {
    format: BACKUP_FORMAT,
    databaseVersion: DATABASE_SCHEMA_VERSION,
    createdAt: candidate.createdAt,
    receipts,
  };
}

function validateArchiveEntries(entries: Record<string, Uint8Array>): void {
  const paths = Object.keys(entries);
  if (!entries[DATABASE_ENTRY] || !entries[MANIFEST_ENTRY]) {
    throw new Error('Backup is missing its database or manifest.');
  }

  let expandedBytes = 0;
  for (const path of paths) {
    if (
      path !== DATABASE_ENTRY &&
      path !== MANIFEST_ENTRY &&
      path !== 'receipts/' &&
      !/^receipts\/\d{6}\.(jpg|png|webp)$/.test(path)
    ) {
      throw new Error('Backup contains an unsupported file.');
    }
    const data = entries[path];
    expandedBytes += data.byteLength;
    if (path.startsWith('receipts/') && path !== 'receipts/' && data.byteLength > MAX_RECEIPT_BYTES) {
      throw new Error('A backup receipt exceeds the 8 MB limit.');
    }
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('Backup expands beyond the 256 MB safety limit.');
    }
  }
}

async function validateDatabase(database: SQLiteDatabase): Promise<void> {
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version !== DATABASE_SCHEMA_VERSION) {
    throw new Error('Backup database version is not compatible with this app.');
  }
  const integrity = await database.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') {
    throw new Error('Backup database failed its SQLite integrity check.');
  }
  const foreignKeyErrors = await database.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
  if (foreignKeyErrors.length > 0) {
    throw new Error(`Backup database has invalid references in ${foreignKeyErrors[0].table}.`);
  }
}

export async function importBackup(db: SQLiteDatabase): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return false;

  const archiveFile = new File(picked.assets[0].uri);
  if (archiveFile.size > MAX_ARCHIVE_BYTES) {
    throw new Error('Backup is larger than the 128 MB import limit.');
  }
  const archive = await archiveFile.bytes();
  const expectedPaths = inspectZipDirectory(archive);
  const entries = unzipSync(archive);
  validateArchiveEntries(entries);
  if (Object.keys(entries).length !== expectedPaths.size || [...expectedPaths].some((path) => !entries[path])) {
    throw new Error('Backup archive entries do not match its directory.');
  }

  let manifest: BackupManifest;
  try {
    manifest = parseManifest(JSON.parse(strFromU8(entries[MANIFEST_ENTRY])));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backup')) throw error;
    throw new Error('Backup manifest is unreadable.');
  }

  if (Object.keys(entries).filter((path) => path.startsWith('receipts/') && path !== 'receipts/').length !== manifest.receipts.length) {
    throw new Error('Backup receipt files do not match its manifest.');
  }

  const restored = await deserializeDatabaseAsync(entries[DATABASE_ENTRY]);
  const createdReceiptFiles: File[] = [];
  try {
    await validateDatabase(restored);
    const referencedUris = new Set(await getReceiptUris(restored));
    const manifestUris = new Set(manifest.receipts.map(({ sourceUri }) => sourceUri));
    if (
      referencedUris.size !== manifestUris.size ||
      [...referencedUris].some((uri) => !manifestUris.has(uri))
    ) {
      throw new Error('Backup receipt list does not match the database.');
    }

    const receiptsDirectory = new Directory(Paths.document, 'receipts');
    receiptsDirectory.create({ idempotent: true, intermediates: true });
    for (const receipt of manifest.receipts) {
      const extension = receipt.path.split('.').pop();
      const destination = new File(receiptsDirectory, `${Crypto.randomUUID()}.${extension}`);
      destination.write(entries[receipt.path]);
      createdReceiptFiles.push(destination);

      await restored.runAsync(
        'UPDATE sales SET receipt_uri = ? WHERE receipt_uri = ?',
        destination.uri,
        receipt.sourceUri,
      );
      await restored.runAsync(
        'UPDATE expenses SET receipt_uri = ? WHERE receipt_uri = ?',
        destination.uri,
        receipt.sourceUri,
      );
      await restored.runAsync(
        'UPDATE procurements SET receipt_uri = ? WHERE receipt_uri = ?',
        destination.uri,
        receipt.sourceUri,
      );
    }
    await validateDatabase(restored);

    const currentData = await db.serializeAsync('main');
    const rollbackDatabase = await deserializeDatabaseAsync(currentData);
    try {
      try {
        await backupDatabaseAsync({ sourceDatabase: restored, destDatabase: db });
        await initializeDatabase(db);
      } catch (restoreError) {
        try {
          await backupDatabaseAsync({ sourceDatabase: rollbackDatabase, destDatabase: db });
          await initializeDatabase(db);
        } catch (rollbackError) {
          throw new Error(
            `Restore failed and the previous database could not be recovered. Restore error: ${
              restoreError instanceof Error ? restoreError.message : String(restoreError)
            }. Recovery error: ${
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            }.`,
          );
        }
        throw restoreError;
      }
    } finally {
      await rollbackDatabase.closeAsync();
    }
  } catch (error) {
    for (const file of createdReceiptFiles) {
      if (file.exists) file.delete();
    }
    throw error;
  } finally {
    await restored.closeAsync();
  }
  return true;
}
