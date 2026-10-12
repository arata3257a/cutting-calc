plugins {
    id("com.android.application")
}

android {
    namespace = "com.arata.conditionreelfinder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.arata.conditionreelfinder"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2-search"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
