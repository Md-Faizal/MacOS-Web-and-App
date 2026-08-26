package com.example.macosbusinesssuite

import org.junit.Assert.assertTrue
import org.junit.Test

class VersionCompareTest {
    @Test
    fun newerVersionIsDetected() {
        assertTrue(AppUpdateUtils.isNewerVersion("1.0.1", "1.0.0"))
        assertTrue(AppUpdateUtils.isNewerVersion("2.0.0", "1.9.9"))
    }
}
