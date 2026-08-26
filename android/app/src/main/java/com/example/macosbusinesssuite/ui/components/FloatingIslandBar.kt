package com.example.macosbusinesssuite.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

enum class AppTab(val title: String, val icon: ImageVector) {
    BILLING("Billing", Icons.Default.Receipt),
    PRODUCTS("Products", Icons.Default.Inventory2),
    CONTACTS("Contacts", Icons.Default.Contacts),
    ANALYTICS("Analytics", Icons.Default.BarChart)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FloatingDualIslandBar(
    currentTab: AppTab,
    onTabSelected: (AppTab) -> Unit,
    isExpanded: Boolean,
    onOpenUpdatePage: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenProfile: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isProfileExpanded by remember { mutableStateOf(false) }
    var leftIslandWidthPx by remember { mutableFloatStateOf(1f) }

    // Drag gesture tracking state for smooth continuous indicator dragging
    var isDragging by remember { mutableStateOf(false) }
    var dragOffsetPx by remember { mutableFloatStateOf(0f) }

    val density = LocalDensity.current

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        // Vertical Pop-up Action Bubbles above the Profile Island
        AnimatedVisibility(
            visible = isProfileExpanded,
            enter = expandVertically(
                expandFrom = Alignment.Bottom,
                animationSpec = tween(durationMillis = 350, easing = FastOutSlowInEasing)
            ) + fadeIn() + scaleIn(initialScale = 0.8f),
            exit = shrinkVertically(
                shrinkTowards = Alignment.Bottom,
                animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing)
            ) + fadeOut() + scaleOut(targetScale = 0.8f),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 68.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ProfileMenuBubble(
                    title = "Settings",
                    icon = Icons.Default.Settings,
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    onClick = {
                        isProfileExpanded = false
                        onOpenSettings()
                    }
                )

                ProfileMenuBubble(
                    title = "System Updates",
                    icon = Icons.Default.SystemUpdate,
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    onClick = {
                        isProfileExpanded = false
                        onOpenUpdatePage()
                    }
                )

                ProfileMenuBubble(
                    title = "Logout",
                    icon = Icons.AutoMirrored.Filled.Logout,
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    onClick = {
                        isProfileExpanded = false
                        onLogout()
                    }
                )
            }
        }

        // Floating Row with Thin Colored Border for High Visibility
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // LEFT ISLAND: Navigation bubble with smooth 420ms expansion/contraction & continuous drag selector
            Surface(
                shape = RoundedCornerShape(32.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.96f),
                border = BorderStroke(
                    width = 1.2.dp,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                ),
                shadowElevation = 0.dp,
                tonalElevation = 4.dp,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .padding(end = 12.dp)
                    .onGloballyPositioned { coordinates ->
                        leftIslandWidthPx = coordinates.size.width.toFloat()
                    }
                    .pointerInput(isExpanded) {
                        if (isExpanded) {
                            detectDragGestures(
                                onDragStart = { offset ->
                                    isDragging = true
                                    dragOffsetPx = offset.x
                                },
                                onDragEnd = {
                                    isDragging = false
                                    val numTabs = AppTab.entries.size
                                    val tabWidthPx = leftIslandWidthPx / numTabs
                                    val nearestIndex = (dragOffsetPx / tabWidthPx).roundToInt().coerceIn(0, numTabs - 1)
                                    onTabSelected(AppTab.entries[nearestIndex])
                                },
                                onDragCancel = {
                                    isDragging = false
                                },
                                onDrag = { change, _ ->
                                    change.consume()
                                    dragOffsetPx = change.position.x
                                }
                            )
                        }
                    }
                    .animateContentSize(
                        animationSpec = tween(
                            durationMillis = 420,
                            easing = FastOutSlowInEasing
                        )
                    )
            ) {
                if (isExpanded) {
                    // EXPANDED STATE: Continuous sliding highlight pill that follows gesture & snaps on release
                    BoxWithConstraints(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp)
                    ) {
                        val totalWidth = maxWidth
                        val numTabs = AppTab.entries.size
                        val tabWidth = totalWidth / numTabs

                        val targetIndex = if (isDragging && leftIslandWidthPx > 0f) {
                            (dragOffsetPx / (leftIslandWidthPx / numTabs)).coerceIn(0f, (numTabs - 1).toFloat())
                        } else {
                            currentTab.ordinal.toFloat()
                        }

                        val animatedIndex by animateFloatAsState(
                            targetValue = targetIndex,
                            animationSpec = if (isDragging) {
                                spring(stiffness = Spring.StiffnessHigh)
                            } else {
                                spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessLow)
                            },
                            label = "ContinuousDragSelector"
                        )

                        // Smooth sliding selector background pill
                        Box(
                            modifier = Modifier
                                .offset(x = tabWidth * animatedIndex)
                                .width(tabWidth)
                                .height(52.dp)
                                .clip(RoundedCornerShape(22.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer)
                        )

                        // Tab icons & text overlay
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AppTab.entries.forEachIndexed { index, tab ->
                                val isHoveredOrSelected = (animatedIndex.roundToInt() == index)
                                val tabContentColor = if (isHoveredOrSelected) {
                                    MaterialTheme.colorScheme.onPrimaryContainer
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }

                                Surface(
                                    onClick = { onTabSelected(tab) },
                                    shape = RoundedCornerShape(22.dp),
                                    color = Color.Transparent,
                                    modifier = Modifier
                                        .width(tabWidth)
                                        .height(52.dp)
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 6.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.Center
                                    ) {
                                        Icon(
                                            imageVector = tab.icon,
                                            contentDescription = tab.title,
                                            tint = tabContentColor,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = tab.title,
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                            fontWeight = if (isHoveredOrSelected) FontWeight.Bold else FontWeight.Medium,
                                            color = tabContentColor,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // CONTRACTED STATE: Slim pill with subtle border
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            onClick = { onTabSelected(currentTab) },
                            shape = RoundedCornerShape(22.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.height(52.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = currentTab.icon,
                                    contentDescription = currentTab.title,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = currentTab.title,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                        }
                    }
                }
            }

            // RIGHT ISLAND: Fixed Circular Profile Bubble with Colored Border
            var isProfilePressed by remember { mutableStateOf(false) }
            val profileScale by animateFloatAsState(
                targetValue = if (isProfilePressed) 0.88f else 1.0f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
                label = "ProfileScale"
            )

            Surface(
                shape = CircleShape,
                color = if (isProfileExpanded) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                border = BorderStroke(
                    width = 1.5.dp,
                    color = if (isProfileExpanded) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                ),
                shadowElevation = 0.dp,
                tonalElevation = 4.dp,
                modifier = Modifier
                    .size(56.dp)
                    .graphicsLayer {
                        scaleX = profileScale
                        scaleY = profileScale
                    }
                    .clip(CircleShape)
                    .combinedClickable(
                        onClick = { isProfileExpanded = !isProfileExpanded },
                        onLongClick = {
                            isProfileExpanded = false
                            onOpenProfile()
                        }
                    )
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.fillMaxSize()
                ) {
                    Icon(
                        imageVector = if (isProfileExpanded) Icons.Default.Close else Icons.Default.Person,
                        contentDescription = "Profile (Tap menu, Hold profile)",
                        tint = if (isProfileExpanded) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(26.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileMenuBubble(
    title: String,
    icon: ImageVector,
    containerColor: Color,
    contentColor: Color,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.9f else 1.0f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "BubbleScale"
    )

    Surface(
        onClick = onClick,
        interactionSource = interactionSource,
        shape = CircleShape,
        color = containerColor,
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
        ),
        shadowElevation = 0.dp,
        tonalElevation = 4.dp,
        modifier = Modifier
            .height(44.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = title,
                tint = contentColor,
                modifier = Modifier.size(18.dp)
            )
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor
            )
        }
    }
}
