package com.example.macosbusinesssuite.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Material 3 Expressive Value-Change Highlight Modifier
 * Pulses a soft accent border and applies a subtle micro-scale spring bounce
 * whenever the observed card or metric changes value from the cached snapshot.
 */
fun Modifier.m3ValueChangeHighlight(
    isChanged: Boolean,
    shape: Shape = RoundedCornerShape(16.dp),
    highlightColor: Color = Color(0xFF10B981),
    borderWidth: Dp = 1.5.dp
): Modifier = composed {
    val transitionProgress = remember { Animatable(0f) }
    val scaleFactor = remember { Animatable(1f) }

    LaunchedEffect(isChanged) {
        if (isChanged) {
            // Spring scale bounce (1.0 -> 1.025 -> 1.0)
            scaleFactor.animateTo(
                targetValue = 1.022f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMedium
                )
            )
            scaleFactor.animateTo(
                targetValue = 1f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMediumLow
                )
            )
        }
    }

    LaunchedEffect(isChanged) {
        if (isChanged) {
            // Glowing border pulse (0 -> 1 -> 0)
            transitionProgress.snapTo(1f)
            transitionProgress.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = 1600,
                    easing = CubicBezierEasing(0.2f, 0.0f, 0.0f, 1.0f)
                )
            )
        }
    }

    val currentAlpha = transitionProgress.value
    val currentScale = scaleFactor.value

    this
        .scale(currentScale)
        .then(
            if (currentAlpha > 0.01f) {
                Modifier.border(
                    width = borderWidth,
                    color = highlightColor.copy(alpha = currentAlpha * 0.75f),
                    shape = shape
                )
            } else {
                Modifier
            }
        )
}
