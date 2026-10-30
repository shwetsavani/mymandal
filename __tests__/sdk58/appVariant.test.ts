const mockSetDoc = jest.fn();

jest.mock("../../src/services/firebase", () => ({ auth: { currentUser: null }, db: {} }));
jest.mock("firebase/firestore", () => ({
    collection: () => ({}),
    doc: () => ({}),
    getDoc: async () => ({ exists: () => false }),
    getDocs: async () => ({ docs: [] }),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));

const appJson = require("../../app.json");
const appConfig = require("../../app.config.js");

describe("app variants", () => {
    const original = process.env.APP_VARIANT;
    afterEach(() => {
        if (original === undefined) delete process.env.APP_VARIANT;
        else process.env.APP_VARIANT = original;
    });

    test("production config keeps the installed app's identity", () => {
        delete process.env.APP_VARIANT;
        const config = appConfig({ config: appJson.expo });
        expect(config.android.package).toBe("com.savani.mymandal");
        expect(config.name).toBe(appJson.expo.name);
        expect(config.extra.eas.projectId).toBe("2299e50e-2fdc-4078-87e9-26a2c68b5b14");
        expect(config.extra.appVariant).toBe("production");
    });

    test("development variant installs separately and keeps the EAS project", () => {
        process.env.APP_VARIANT = "development";
        const config = appConfig({ config: appJson.expo });
        expect(config.android.package).toBe("com.savani.mymandal.dev");
        expect(config.android.package).not.toBe(appJson.expo.android.package);
        expect(config.extra.eas.projectId).toBe(appJson.expo.extra.eas.projectId);
        expect(config.extra.appVariant).toBe("development");
    });
});

describe("cloud writes in development", () => {
    test("upload is refused before any Firestore write", async () => {
        const { uploadCloudBackup } = require("../../src/services/cloudBackup");
        await expect(uploadCloudBackup()).rejects.toThrow(/disabled in development/);
        expect(mockSetDoc).not.toHaveBeenCalled();
    });
});
