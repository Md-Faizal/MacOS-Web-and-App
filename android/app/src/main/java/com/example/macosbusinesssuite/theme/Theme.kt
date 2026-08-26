package com.example.macosbusinesssuite.theme

import androidx.compose.runtime.Composable
import com.example.macosbusinesssuite.ui.theme.MacOSBusinessSuiteTheme as PixelTheme

@Composable
fun MacOSBusinessSuiteTheme(
    darkTheme: Boolean = androidx.compose.foundation.isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    PixelTheme(
        darkTheme = darkTheme,
        dynamicColor = dynamicColor,
        content = content
    )
}
