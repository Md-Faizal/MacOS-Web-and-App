package com.example.macosbusinesssuite.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun M3SyncStatusPill(
    isDataCached: Boolean,
    isSyncingLive: Boolean,
    lastSyncTimestamp: Long?,
    modifier: Modifier = Modifier
) {
    var showJustSynced by remember { mutableStateOf(false) }

    // Detect transition from syncing to synced
    LaunchedEffect(isSyncingLive) {
        if (!isSyncingLive && lastSyncTimestamp != null && lastSyncTimestamp > 0L) {
            showJustSynced = true
            delay(2500L)
            showJustSynced = false
        }
    }

    val visible = (isDataCached && isSyncingLive) || showJustSynced

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(animationSpec = tween(300)) + slideInVertically(
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioMediumBouncy)
        ) { -it / 2 },
        exit = fadeOut(animationSpec = tween(400)) + slideOutVertically { -it / 2 },
        modifier = modifier
    ) {
        val infiniteTransition = rememberInfiniteTransition(label = "SyncRotate")
        val rotation by infiniteTransition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(
                animation = tween(1200, easing = LinearEasing),
                repeatMode = RepeatMode.Restart
            ),
            label = "Rotation"
        )

        val isSyncedState = showJustSynced && !isSyncingLive
        val backgroundColor = if (isSyncedState) {
            Color(0xFF10B981).copy(alpha = 0.15f)
        } else {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.85f)
        }
        val borderColor = if (isSyncedState) {
            Color(0xFF10B981).copy(alpha = 0.4f)
        } else {
            MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
        }
        val contentColor = if (isSyncedState) {
            Color(0xFF059669)
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        }

        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(backgroundColor)
                .border(1.dp, borderColor, RoundedCornerShape(20.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (isSyncedState) {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = "Synced",
                    tint = contentColor,
                    modifier = Modifier.size(13.dp)
                )
                Text(
                    text = "Live Data Synced",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = contentColor
                )
            } else {
                Icon(
                    imageVector = Icons.Rounded.Refresh,
                    contentDescription = "Syncing",
                    tint = contentColor,
                    modifier = Modifier
                        .size(13.dp)
                        .rotate(rotation)
                )
                Text(
                    text = "Offline Snapshot • Syncing...",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = contentColor
                )
            }
        }
    }
}
