import AsyncStorage from "@react-native-async-storage/async-storage";

const DELETED_RECORDS_KEY =
    "mandal_cloud_deleted_records";

export type SyncCollection =
    | "members"
    | "obligations"
    | "payments";

export type DeletedRecord = {
    collection: SyncCollection;
    id: string;
    deletedAt: string;
};

async function getDeletedRecords(): Promise<
    DeletedRecord[]
> {
    const json =
        await AsyncStorage.getItem(
            DELETED_RECORDS_KEY
        );

    if (!json) {
        return [];
    }

    try {
        const parsed = JSON.parse(json);

        return Array.isArray(parsed)
            ? parsed
            : [];
    } catch {
        return [];
    }
}

async function saveDeletedRecords(
    records: DeletedRecord[]
) {
    await AsyncStorage.setItem(
        DELETED_RECORDS_KEY,
        JSON.stringify(records)
    );
}

export async function recordDeletedRecord(
    collection: SyncCollection,
    id: string
) {
    if (!id) {
        return;
    }

    const records =
        await getDeletedRecords();

    const alreadyExists =
        records.some(
            (record) =>
                record.collection ===
                collection &&
                record.id === id
        );

    if (alreadyExists) {
        return;
    }

    records.push({
        collection,
        id,
        deletedAt:
            new Date().toISOString(),
    });

    await saveDeletedRecords(records);
}

export async function getDeletedRecordsForSync() {
    return getDeletedRecords();
}

export async function removeDeletedRecord(
    collection: SyncCollection,
    id: string
) {
    const records =
        await getDeletedRecords();

    const remaining =
        records.filter(
            (record) =>
                !(
                    record.collection ===
                    collection &&
                    record.id === id
                )
        );

    await saveDeletedRecords(
        remaining
    );
}