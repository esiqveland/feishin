import { ServerListItem, Song } from '/@/renderer/api/types';

export interface PersistenceStats {
    quotaBytes: number;
    usageBytes: number;
}

export class PersistenceStore {
    private server: ServerListItem;

    private storage: StorageManager;

    private handle: FileSystemDirectoryHandle;

    constructor(
        storage: StorageManager,
        server: ServerListItem,
        directoryHandle: FileSystemDirectoryHandle,
    ) {
        this.server = server;
        this.storage = storage;
        this.handle = directoryHandle;
    }

    public async stats(): Promise<PersistenceStats> {
        const stats = await this.storage.estimate();
        return {
            quotaBytes: stats.quota!,
            usageBytes: stats.usage!,
        };
    }

    public async storeSong(song: Song) {
        // TODO(persistence): we likely need a format / file extension for a song
        const songPath = `${song.id}`;
        const fileHandle = await this.handle.getFileHandle(songPath, {
            create: true,
        });
        const syncHandle = await fileHandle.createSyncAccessHandle();

        const writable = await fileHandle.createWritable({ keepExistingData: false });
        const res = await fetch(song.streamUrl, {
            method: 'GET',
        });
        if (res.status !== 200 || !res.body) {
            throw new Error(
                `Unable to retrieve stream: ${song.streamUrl} statusCode: ${res.status}`,
            );
        }
        try {
            // Stream the response into the file.
            await res.body.pipeTo(writable);
            await writable.close();
            syncHandle.close();
        } catch (error) {
            await writable.abort();
            await this.handle.removeEntry(songPath);
        }
    }
}

export interface PersistenceSuccess {
    result: 'success';
    store: PersistenceStore;
}

export interface PersistenceUnsupported {
    result: 'unsupported';
}

export interface PersistencePermissionDenied {
    result: 'permission-denied';
}

export type PersistenceResult =
    | PersistenceSuccess
    | PersistenceUnsupported
    | PersistencePermissionDenied;

export async function create(
    storage: StorageManager,
    server: ServerListItem,
): Promise<PersistenceSuccess> {
    const directoryHandle = await storage.getDirectory();
    const feishinDirectory = await directoryHandle.getDirectoryHandle('feishin', {
        create: true,
    });
    const serverDirectory = await feishinDirectory.getDirectoryHandle(server.id, {
        create: true,
    });
    const persistence = new PersistenceStore(storage, server, serverDirectory);
    return {
        result: 'success',
        store: persistence,
    };
}

export type PersistenceState = 'access-granted' | 'no-access' | 'unsupported';

export async function checkPersistence(): Promise<PersistenceState> {
    // check if we already have been granted access:
    // this should be silent to the user
    if (navigator.storage && navigator.storage.persisted) {
        const isEnabled = await navigator.storage.persisted();
        if (isEnabled) {
            return 'access-granted';
        }
        return 'no-access';
    }
    return 'unsupported';
}

export async function initPersistence(server: ServerListItem): Promise<PersistenceResult> {
    // check if we already have been granted access:
    if (navigator.storage && navigator.storage.persisted) {
        const isEnabled = await navigator.storage.persisted();
        if (isEnabled) {
            return create(navigator.storage, server);
        }
    }

    // ask for permission to persist:
    if (navigator.storage && navigator.storage.persist) {
        // this requests permission to use persistent storage
        const isEnabled = await navigator.storage.persist();
        if (!isEnabled) {
            return {
                result: 'permission-denied',
            };
        }
        return create(navigator.storage, server);
    }

    return {
        result: 'unsupported',
    };
}
