plugins {
    id("com.android.application")
}

android {
    namespace = "com.arata.conditionreelfinder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.arata.conditionreelfinder.hashtag162"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "1.6.2-install-fix"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
