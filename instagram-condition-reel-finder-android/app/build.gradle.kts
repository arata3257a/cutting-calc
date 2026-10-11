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
        versionCode = 2
        versionName = "1.1-japan"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
