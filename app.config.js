// app.json stays the source of truth for the production app. Only when
// APP_VARIANT=development (EAS "development" profile) is a separately
// installable variant produced, so a development build can never replace the
// installed production app or share its storage.
module.exports = ({ config }) => {
    if (process.env.APP_VARIANT !== "development") {
        return { ...config, extra: { ...config.extra, appVariant: "production" } };
    }
    return {
        ...config,
        name: `${config.name} (dev)`,
        scheme: "my-mandal-dev",
        android: { ...config.android, package: "com.savani.mymandal.dev" },
        ios: { ...config.ios, bundleIdentifier: "com.savani.mymandal.dev" },
        extra: { ...config.extra, appVariant: "development" },
    };
};
