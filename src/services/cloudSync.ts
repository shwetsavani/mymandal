import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    setDoc,
    where,
} from "firebase/firestore";

import { auth, db } from "./firebase";

import {
    getDeletedRecordsForSync,
    removeDeletedRecord,
} from "./syncDeletionStorage";

const MEMBERS_KEY = "mandal_members";
const OBLIGATIONS_KEY =
    "mandal_monthly_obligations";
const PAYMENTS_KEY = "mandal_payments";
const SETUP_KEY = "mandal_setup";

type SyncCollection =
    | "members"
    | "obligations"
    | "payments";

const COLLECTION_KEYS: Record<
    SyncCollection,
    string
> = {
    members: MEMBERS_KEY,
    obligations: OBLIGATIONS_KEY,
    payments: PAYMENTS_KEY,
};

function getOwnerUid(): string {
    const uid = auth.currentUser?.uid;

    if (!uid) {
        throw new Error(
            "No authenticated Firebase account is available."
        );
    }

    return uid;
}

async function getLocalRecords(
    storageKey: string
): Promise<Record<string, any>[]> {
    const json =
        await AsyncStorage.getItem(storageKey);

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

async function uploadCollection(
    collectionName: SyncCollection
) {
    const uid = getOwnerUid();

    const records =
        await getLocalRecords(
            COLLECTION_KEYS[collectionName]
        );

    const collectionRef = collection(
        db,
        "mandals",
        uid,
        collectionName
    );

    for (const record of records) {
        if (!record?.id) {
            continue;
        }

        await setDoc(
            doc(
                collectionRef,
                String(record.id)
            ),
            {
                ...record,
                syncedAt:
                    new Date().toISOString(),
            }
        );
    }
}

/**
 * Permanently removes all cloud data belonging
 * to a deleted member.
 *
 * This handles the member itself plus all
 * historical obligations and payments.
 */
async function deleteMemberFromCloud(
    memberId: string
) {
    const uid = getOwnerUid();

    /*
     * 1. Delete the member document.
     */
    await deleteDoc(
        doc(
            db,
            "mandals",
            uid,
            "members",
            memberId
        )
    );

    /*
     * 2. Find and delete all monthly obligations
     * belonging to this member.
     */
    const obligationsRef =
        collection(
            db,
            "mandals",
            uid,
            "obligations"
        );

    const obligationsQuery =
        query(
            obligationsRef,
            where(
                "memberId",
                "==",
                memberId
            )
        );

    const obligationsSnapshot =
        await getDocs(
            obligationsQuery
        );

    for (
        const obligation
        of obligationsSnapshot.docs
        ) {
        await deleteDoc(
            obligation.ref
        );
    }

    /*
     * 3. Find and delete all payments
     * belonging to this member.
     */
    const paymentsRef =
        collection(
            db,
            "mandals",
            uid,
            "payments"
        );

    const paymentsQuery =
        query(
            paymentsRef,
            where(
                "memberId",
                "==",
                memberId
            )
        );

    const paymentsSnapshot =
        await getDocs(
            paymentsQuery
        );

    for (
        const payment
        of paymentsSnapshot.docs
        ) {
        await deleteDoc(
            payment.ref
        );
    }
}

/**
 * Processes locally recorded permanent deletions.
 *
 * A deletion marker is removed locally only after
 * the corresponding cloud deletion succeeds.
 */
async function processDeletedRecords() {
    const deletedRecords =
        await getDeletedRecordsForSync();

    for (
        const record
        of deletedRecords
        ) {
        if (
            record.collection ===
            "members"
        ) {
            await deleteMemberFromCloud(
                record.id
            );

            await removeDeletedRecord(
                record.collection,
                record.id
            );

            continue;
        }

        /*
         * These are included for future
         * individual-record deletion support.
         */
        await deleteDoc(
            doc(
                db,
                "mandals",
                getOwnerUid(),
                record.collection,
                record.id
            )
        );

        await removeDeletedRecord(
            record.collection,
            record.id
        );
    }
}

/**
 * Uploads local Mandal information.
 *
 * The local PIN is deliberately never uploaded.
 */
async function uploadMandalInfo() {
    const uid = getOwnerUid();

    const setupJson =
        await AsyncStorage.getItem(
            SETUP_KEY
        );

    if (!setupJson) {
        return;
    }

    const setupData =
        JSON.parse(setupJson);

    const {
        pin,
        ...safeSetupData
    } = setupData;

    const mandalRef = doc(
        db,
        "mandals",
        uid
    );

    await setDoc(
        mandalRef,
        {
            ...safeSetupData,

            cloudBackupEnabled: true,

            lastSyncedAt:
                new Date().toISOString(),

            updatedAt:
                new Date().toISOString(),
        },
        {
            merge: true,
        }
    );
}

export async function syncLocalDataToCloud() {
    getOwnerUid();

    /*
     * Process deletions FIRST.
     *
     * This prevents deleted records from being
     * accidentally recreated during the upload.
     */
    await processDeletedRecords();

    /*
     * Sync Mandal information.
     */
    await uploadMandalInfo();

    /*
     * Sync current local collections.
     */
    await uploadCollection(
        "members"
    );

    await uploadCollection(
        "obligations"
    );

    await uploadCollection(
        "payments"
    );

    /*
     * Record the successful sync time.
     */
    const uid = getOwnerUid();

    await setDoc(
        doc(
            db,
            "mandals",
            uid
        ),
        {
            lastSyncedAt:
                new Date().toISOString(),
        },
        {
            merge: true,
        }
    );

    return true;
}

async function downloadCollection(
    collectionName: SyncCollection
) {
    const uid = getOwnerUid();

    const snapshot =
        await getDocs(
            collection(
                db,
                "mandals",
                uid,
                collectionName
            )
        );

    return snapshot.docs.map(
        (item) => item.data()
    );
}

export async function getCloudData() {
    getOwnerUid();

    const [
        members,
        obligations,
        payments,
    ] = await Promise.all([
        downloadCollection(
            "members"
        ),

        downloadCollection(
            "obligations"
        ),

        downloadCollection(
            "payments"
        ),
    ]);

    return {
        members,
        obligations,
        payments,
    };
}

export async function triggerCloudSync() {
    try {
        await syncLocalDataToCloud();
        console.log("My Mandal: automatic cloud sync completed.");
    } catch (error) {
        console.log("My Mandal: automatic cloud sync skipped/failed:", error);
    }
}