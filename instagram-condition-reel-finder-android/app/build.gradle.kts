plugins {
    id("com.android.application")
}

android {
    namespace = "com.arata.conditionreelfinder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.arata.conditionreelfinder.metrics"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "1.4-hashtag"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
