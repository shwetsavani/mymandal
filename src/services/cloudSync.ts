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
    type DeletedRecord,
    type SyncCollection,
} from "./syncDeletionStorage";

const MEMBERS_KEY = "mandal_members";

const OBLIGATIONS_KEY =
    "mandal_monthly_obligations";

const PAYMENTS_KEY = "mandal_payments";

const MANDAL_SETUP_KEY = "mandal_setup";

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
        await AsyncStorage.getItem(
            storageKey
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

/**
 * Upload all current local records
 * for a specific collection.
 */
async function uploadCollection(
    collectionName: SyncCollection
): Promise<void> {
    const uid = getOwnerUid();

    const records =
        await getLocalRecords(
            COLLECTION_KEYS[
                collectionName
                ]
        );

    const collectionRef =
        collection(
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
 * Delete a payment document from Firebase.
 */
async function deletePaymentFromCloud(
    uid: string,
    paymentId: string
): Promise<void> {
    await deleteDoc(
        doc(
            db,
            "mandals",
            uid,
            "payments",
            paymentId
        )
    );
}

/**
 * Delete an obligation document from Firebase.
 */
async function deleteObligationFromCloud(
    uid: string,
    obligationId: string
): Promise<void> {
    await deleteDoc(
        doc(
            db,
            "mandals",
            uid,
            "obligations",
            obligationId
        )
    );
}

/**
 * Permanently delete a member from Firebase
 * together with all of the member's financial records.
 */
async function deleteMemberFromCloud(
    uid: string,
    memberId: string
): Promise<void> {
    const memberRef = doc(
        db,
        "mandals",
        uid,
        "members",
        memberId
    );

    /*
     * Find all obligations belonging to
     * this member.
     */
    const obligationsRef = collection(
        db,
        "mandals",
        uid,
        "obligations"
    );

    const obligationsQuery = query(
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

    /*
     * Find all payments belonging to
     * this member.
     */
    const paymentsRef = collection(
        db,
        "mandals",
        uid,
        "payments"
    );

    const paymentsQuery = query(
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

    /*
     * Delete all obligations.
     */
    await Promise.all(
        obligationsSnapshot.docs.map(
            (item) =>
                deleteDoc(item.ref)
        )
    );

    /*
     * Delete all payments.
     */
    await Promise.all(
        paymentsSnapshot.docs.map(
            (item) =>
                deleteDoc(item.ref)
        )
    );

    /*
     * Finally delete the member itself.
     */
    await deleteDoc(memberRef);
}

/**
 * Process all locally recorded deletions.
 *
 * Deletions are handled before uploads so an old
 * cloud record cannot remain after it was removed locally.
 */
async function processDeletedRecords(): Promise<void> {
    const uid = getOwnerUid();

    const deletedRecords =
        await getDeletedRecordsForSync();

    for (const record of deletedRecords) {
        try {
            if (
                record.collection ===
                "members"
            ) {
                /*
                 * Member deletion also removes
                 * all related obligations and payments.
                 */
                await deleteMemberFromCloud(
                    uid,
                    record.id
                );
            } else if (
                record.collection ===
                "payments"
            ) {
                await deletePaymentFromCloud(
                    uid,
                    record.id
                );
            } else if (
                record.collection ===
                "obligations"
            ) {
                await deleteObligationFromCloud(
                    uid,
                    record.id
                );
            }

            /*
             * Only remove the local deletion marker
             * after Firebase deletion succeeds.
             */
            await removeDeletedRecord(
                record.collection,
                record.id
            );
        } catch (error) {
            /*
             * Keep the deletion marker if Firebase
             * deletion fails. It will be retried
             * during the next sync.
             */
            console.error(
                "Cloud deletion failed:",
                record,
                error
            );
        }
    }
}

/**
 * Upload Mandal information to the cloud.
 *
 * The PIN is intentionally never uploaded.
 */
async function uploadMandalInfo(): Promise<void> {
    const uid = getOwnerUid();

    const json =
        await AsyncStorage.getItem(
            MANDAL_SETUP_KEY
        );

    if (!json) {
        return;
    }

    try {
        const setup =
            JSON.parse(json);

        if (!setup) {
            return;
        }

        /*
         * Never store the local PIN in Firebase.
         */
        const {
            pin: _pin,
            ...safeSetup
        } = setup;

        await setDoc(
            doc(
                db,
                "mandals",
                uid
            ),
            {
                ...safeSetup,
                cloudBackupEnabled:
                    true,
                lastSyncedAt:
                    new Date().toISOString(),
            },
            {
                merge: true,
            }
        );
    } catch (error) {
        console.error(
            "Upload Mandal info error:",
            error
        );

        throw error;
    }
}

/**
 * Complete one cloud synchronization cycle.
 *
 * Order:
 *
 * 1. Process deletions
 * 2. Upload Mandal information
 * 3. Upload members
 * 4. Upload obligations
 * 5. Upload payments
 */
export async function syncLocalDataToCloud(): Promise<boolean> {
    getOwnerUid();

    /*
     * IMPORTANT:
     * Deletions must happen first.
     */
    await processDeletedRecords();

    /*
     * Sync Mandal information.
     */
    await uploadMandalInfo();

    /*
     * Sync current local records.
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

    return true;
}

/**
 * Prevent multiple simultaneous cloud syncs.
 *
 * If several local changes happen quickly,
 * they are queued into the same sync cycle.
 */
let syncPromise:
    Promise<boolean> | null = null;

let syncRequested = false;

export function triggerCloudSync(): Promise<boolean> {
    syncRequested = true;

    if (syncPromise) {
        return syncPromise;
    }

    syncPromise = (async () => {
        while (syncRequested) {
            syncRequested = false;

            try {
                await syncLocalDataToCloud();

                console.log(
                    "My Mandal: automatic cloud sync completed."
                );
            } catch (error) {
                console.log(
                    "My Mandal: automatic cloud sync skipped/failed:",
                    error
                );
            }
        }

        return true;
    })().finally(() => {
        syncPromise = null;
    });

    return syncPromise;
}

/**
 * Download one cloud collection.
 */
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

/**
 * Get the complete current cloud data.
 */
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