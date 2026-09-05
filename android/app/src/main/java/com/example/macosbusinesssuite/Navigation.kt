package com.example.macosbusinesssuite

import androidx.compose.animation.*
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.activity.compose.BackHandler
import android.app.Activity
import android.widget.Toast
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import com.example.macosbusinesssuite.ui.components.AppTab
import com.example.macosbusinesssuite.ui.components.FloatingDualIslandBar
import com.example.macosbusinesssuite.ui.screens.analytics.AnalyticsScreen
import com.example.macosbusinesssuite.ui.screens.auth.LoginScreen
import com.example.macosbusinesssuite.ui.screens.billing.BillingScreen
import com.example.macosbusinesssuite.ui.screens.contacts.ContactsScreen
import com.example.macosbusinesssuite.ui.screens.products.ProductsScreen
import com.example.macosbusinesssuite.ui.screens.profile.ProfileScreen
import com.example.macosbusinesssuite.ui.screens.server.ServerConfigScreen
import com.example.macosbusinesssuite.ui.screens.settings.SettingsScreen
import com.example.macosbusinesssuite.ui.theme.MacOSBusinessSuiteTheme
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import com.example.macosbusinesssuite.ui.viewmodels.ThemeMode

@Composable
fun MainNavigation(
    mainViewModel: MainViewModel = viewModel()
) {
    val isLoggedIn by mainViewModel.isLoggedIn.collectAsState()
    val themeMode by mainViewModel.themeMode.collectAsState()
    val profile by mainViewModel.profile.collectAsState()
    val activeUser by mainViewModel.activeUser.collectAsState()
    val serverUrl by mainViewModel.serverUrl.collectAsState()
    val permissionsJson by mainViewModel.permissionsJson.collectAsState()

    val userPicture = profile?.actualPicture ?: activeUser?.displayPicture ?: mainViewModel.sessionManager.userPicture
    val userName = profile?.actualName ?: activeUser?.displayName ?: mainViewModel.sessionManager.userName ?: "User"
    val userEmail = profile?.actualEmail ?: activeUser?.identifier ?: mainViewModel.sessionManager.userEmail ?: ""
    val userRole = profile?.role ?: activeUser?.role ?: mainViewModel.sessionManager.userRole

    val visibleTabs = remember(userRole, isLoggedIn, permissionsJson) {
        val allowed = mutableListOf<AppTab>()
        if (mainViewModel.sessionManager.isModuleAllowed("billing")) allowed.add(AppTab.BILLING)
        if (mainViewModel.sessionManager.isModuleAllowed("products")) allowed.add(AppTab.PRODUCTS)
        if (mainViewModel.sessionManager.isModuleAllowed("contacts")) allowed.add(AppTab.CONTACTS)
        if (mainViewModel.sessionManager.isModuleAllowed("analytics")) allowed.add(AppTab.ANALYTICS)
        if (allowed.isEmpty()) listOf(AppTab.BILLING) else allowed
    }

    val serverOrigin = remember(serverUrl) {
        val url = serverUrl.trimEnd('/')
        if (url.endsWith("/api")) url.removeSuffix("/api") else url
    }

    val isDarkTheme = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.AUTO -> isSystemInDarkTheme()
    }

    var currentTab by remember { mutableStateOf(visibleTabs.firstOrNull() ?: AppTab.BILLING) }

    LaunchedEffect(visibleTabs) {
        if (currentTab !in visibleTabs) {
            currentTab = visibleTabs.firstOrNull() ?: AppTab.BILLING
        }
    }
    var isUpdatePageOpen by remember { mutableStateOf(false) }
    var isSettingsOpen by remember { mutableStateOf(false) }
    var isProfileOpen by remember { mutableStateOf(false) }
    var isSubPageOpen by remember { mutableStateOf(false) }
    var isNavIslandExpanded by remember { mutableStateOf(true) }

    var isUnlockRevealing by remember { mutableStateOf(false) }
    var unlockOrigin by remember { mutableStateOf(Offset.Zero) }
    val unlockProgress = remember { Animatable(0f) }
    val coroutineScope = rememberCoroutineScope()

    var accumulatedScrollDelta by remember { mutableFloatStateOf(0f) }

    val nestedScrollConnection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                if ((delta > 0f && accumulatedScrollDelta < 0f) || (delta < 0f && accumulatedScrollDelta > 0f)) {
                    accumulatedScrollDelta = 0f
                }
                accumulatedScrollDelta += delta

                if (accumulatedScrollDelta < -70f && isNavIslandExpanded) {
                    isNavIslandExpanded = false
                    accumulatedScrollDelta = 0f
                } else if (accumulatedScrollDelta > 50f && !isNavIslandExpanded) {
                    isNavIslandExpanded = true
                    accumulatedScrollDelta = 0f
                }
                return Offset.Zero
            }
        }
    }

    MacOSBusinessSuiteTheme(darkTheme = isDarkTheme) {
        if (isProfileOpen) {
            ProfileScreen(
                viewModel = mainViewModel,
                onBack = { isProfileOpen = false }
            )
        } else if (isSettingsOpen) {
            SettingsScreen(
                viewModel = mainViewModel,
                onBack = { isSettingsOpen = false },
                onOpenServerConfig = {
                    isSettingsOpen = false
                    isUpdatePageOpen = true
                }
            )
        } else if (isUpdatePageOpen) {
            ServerConfigScreen(
                viewModel = mainViewModel,
                onBack = { isUpdatePageOpen = false }
            )
        } else {
            val context = LocalContext.current
            var lastBackPressedTime by remember { mutableLongStateOf(0L) }

            Box(modifier = Modifier.fillMaxSize()) {
                // Layer 0: Authenticated Dashboard (Underneath base layer, progressively revealed as lock screen disintegrates)
                if (isLoggedIn) {
                    // Root BackHandler for tab switching and double back exit
                    val defaultTab = visibleTabs.firstOrNull() ?: AppTab.BILLING
                    BackHandler(enabled = !isProfileOpen && !isSettingsOpen && !isUpdatePageOpen && !isSubPageOpen && !isUnlockRevealing) {
                        if (currentTab != defaultTab) {
                            currentTab = defaultTab
                        } else {
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastBackPressedTime < 2000L) {
                                (context as? Activity)?.finish()
                            } else {
                                lastBackPressedTime = currentTime
                                Toast.makeText(context, "Press back again to exit", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .nestedScroll(nestedScrollConnection)
                    ) {
                        AnimatedContent(
                            targetState = currentTab,
                            transitionSpec = {
                                (fadeIn(animationSpec = tween(280)) + slideInHorizontally { width -> if (targetState.ordinal > initialState.ordinal) width / 4 else -width / 4 })
                                    .togetherWith(fadeOut(animationSpec = tween(220)) + slideOutHorizontally { width -> if (targetState.ordinal > initialState.ordinal) -width / 4 else width / 4 })
                            },
                            label = "PageTransitions",
                            modifier = Modifier.fillMaxSize()
                        ) { tab ->
                            when (tab) {
                                AppTab.BILLING -> BillingScreen(
                                    viewModel = mainViewModel,
                                    onSubPageToggle = { isSubOpen -> isSubPageOpen = isSubOpen }
                                )
                                AppTab.PRODUCTS -> ProductsScreen(
                                    viewModel = mainViewModel,
                                    onSubPageToggle = { isSubOpen -> isSubPageOpen = isSubOpen }
                                )
                                AppTab.CONTACTS -> ContactsScreen(
                                    viewModel = mainViewModel,
                                    onSubPageToggle = { isSubOpen -> isSubPageOpen = isSubOpen }
                                )
                                AppTab.ANALYTICS -> AnalyticsScreen(viewModel = mainViewModel)
                            }
                        }

                        AnimatedVisibility(
                            visible = !isSubPageOpen,
                            enter = fadeIn() + slideInVertically { it },
                            exit = fadeOut() + slideOutVertically { it },
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .windowInsetsPadding(WindowInsets.navigationBars)
                        ) {
                            FloatingDualIslandBar(
                                currentTab = currentTab,
                                onTabSelected = { tab ->
                                    currentTab = tab
                                    isNavIslandExpanded = true
                                    if (tab == AppTab.CONTACTS) {
                                        mainViewModel.loadContacts()
                                    }
                                },
                                isExpanded = isNavIslandExpanded,
                                onOpenUpdatePage = { isUpdatePageOpen = true },
                                onOpenSettings = { isSettingsOpen = true },
                                onOpenProfile = { isProfileOpen = true },
                                onLogout = {
                                    isUnlockRevealing = false
                                    mainViewModel.logout()
                                },
                                userPictureUrl = userPicture,
                                userName = userName,
                                userEmail = userEmail,
                                userRole = userRole,
                                serverOrigin = serverOrigin,
                                visibleTabs = visibleTabs
                            )
                        }
                    }
                }

                // Layer 1: Lock Screen Card (Sitting on top of the dashboard; disintegrates in a circular fashion slowly revealing dashboard)
                if (!isLoggedIn || isUnlockRevealing) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .then(
                                if (isUnlockRevealing) {
                                    Modifier.graphicsLayer {
                                        val progress = unlockProgress.value
                                        val center = if (unlockOrigin == Offset.Zero) Offset(size.width / 2f, size.height / 2f) else unlockOrigin
                                        val maxRadius = kotlin.math.hypot(
                                            kotlin.math.max(center.x, size.width - center.x),
                                            kotlin.math.max(center.y, size.height - center.y)
                                        ) * 1.14f
                                        val currentRadius = maxRadius * progress

                                        // Subtle organic card elevation & slight dissolve as it disintegrates
                                        scaleX = 1f + (progress * 0.025f)
                                        scaleY = 1f + (progress * 0.025f)
                                        alpha = (1f - (progress * 0.18f)).coerceIn(0f, 1f)

                                        clip = true
                                        shape = object : Shape {
                                            override fun createOutline(
                                                size: Size,
                                                layoutDirection: LayoutDirection,
                                                density: Density
                                            ): Outline {
                                                val path = Path().apply {
                                                    fillType = PathFillType.EvenOdd
                                                    // Full-screen card boundary
                                                    addRect(Rect(0f, 0f, size.width, size.height))
                                                    // Expanding circular cutout disintegrating the card!
                                                    addOval(Rect(center = center, radius = currentRadius))
                                                }
                                                return Outline.Generic(path)
                                            }
                                        }
                                    }
                                } else Modifier
                            )
                    ) {
                        LoginScreen(
                            viewModel = mainViewModel,
                            onLoginSuccess = { clickOrigin ->
                                coroutineScope.launch {
                                    unlockOrigin = clickOrigin ?: Offset.Zero
                                    isUnlockRevealing = true
                                    mainViewModel.completeLogin()
                                    currentTab = visibleTabs.firstOrNull() ?: AppTab.BILLING
                                    unlockProgress.snapTo(0f)
                                    unlockProgress.animateTo(
                                        targetValue = 1f,
                                        animationSpec = tween(
                                            durationMillis = 1400,
                                            easing = CubicBezierEasing(0.20f, 0.0f, 0.15f, 1.0f)
                                        )
                                    )
                                    isUnlockRevealing = false
                                }
                            }
                        )
                    }
                }

                // Layer 2: Ultra-Intense Stock Android AOD/Lock Screen Radiant Biometric Wavefront
                if (isUnlockRevealing) {
                    val density = LocalDensity.current
                    Canvas(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        val progress = unlockProgress.value
                        val center = if (unlockOrigin == Offset.Zero) Offset(size.width / 2f, size.height / 2f) else unlockOrigin
                        val maxRadius = kotlin.math.hypot(
                            kotlin.math.max(center.x, size.width - center.x),
                            kotlin.math.max(center.y, size.height - center.y)
                        ) * 1.12f
                        val currentRadius = maxRadius * progress

                        // Sustained high-luminance alpha across screen traversal
                        val fadeAlpha = if (progress < 0.76f) 1f else ((1f - progress) / 0.24f).coerceIn(0f, 1f)

                        // 1. Initial Biometric Strobe / OLED Light Flare (first 38% of unlock)
                        if (progress < 0.38f) {
                            val flashProgress = progress / 0.38f
                            val flashAlpha = (1f - flashProgress).coerceIn(0f, 1f)
                            val flashRadius = with(density) { (28f + flashProgress * 155f).dp.toPx() }

                            drawCircle(
                                brush = Brush.radialGradient(
                                    colors = listOf(
                                        Color.White.copy(alpha = flashAlpha * 0.98f),
                                        Color(0xFF00E5FF).copy(alpha = flashAlpha * 0.90f),
                                        Color(0xFF2979FF).copy(alpha = flashAlpha * 0.50f),
                                        Color.Transparent
                                    ),
                                    center = center,
                                    radius = flashRadius
                                ),
                                radius = flashRadius,
                                center = center,
                                blendMode = BlendMode.Plus
                            )
                        }

                        if (fadeAlpha > 0.001f && currentRadius > 0f) {
                            // 2. Broad Atmospheric Color Field expanding outside the wavefront
                            val auraRadius = currentRadius + with(density) { (55f + progress * 35f).dp.toPx() }
                            drawCircle(
                                brush = Brush.radialGradient(
                                    0.0f to Color.Transparent,
                                    (currentRadius / auraRadius).coerceIn(0f, 0.95f) to Color(0xFF00E5FF).copy(alpha = fadeAlpha * 0.55f),
                                    ((currentRadius + with(density) { 26.dp.toPx() }) / auraRadius).coerceIn(0f, 0.98f) to Color(0xFF7C4DFF).copy(alpha = fadeAlpha * 0.35f),
                                    1.0f to Color.Transparent,
                                    center = center,
                                    radius = auraRadius
                                ),
                                radius = auraRadius,
                                center = center,
                                blendMode = BlendMode.Plus
                            )

                            // 3. Inner Illuminating Wash flooding the newly revealed dashboard with vibrant light
                            val innerGlowRadius = currentRadius
                            val innerStartRatio = 0.76f
                            drawCircle(
                                brush = Brush.radialGradient(
                                    0.0f to Color.Transparent,
                                    innerStartRatio to Color.Transparent,
                                    (innerStartRatio + 0.12f) to Color(0xFF00B0FF).copy(alpha = fadeAlpha * 0.45f),
                                    1.0f to Color(0xFF00E5FF).copy(alpha = fadeAlpha * 0.75f),
                                    center = center,
                                    radius = innerGlowRadius
                                ),
                                radius = innerGlowRadius,
                                center = center,
                                blendMode = BlendMode.Plus
                            )

                            // 4. Secondary Trailing Harmonic Echo Ring (adds depth and shockwave realism)
                            val echoRadius = currentRadius * 0.90f
                            if (echoRadius > 0f) {
                                drawCircle(
                                    color = Color(0xFF3D5AFE).copy(alpha = fadeAlpha * 0.80f),
                                    radius = echoRadius,
                                    center = center,
                                    style = Stroke(width = with(density) { (15f + progress * 10f).dp.toPx() }),
                                    blendMode = BlendMode.Plus
                                )
                            }

                            // 5. Ultra-Thick Saturated Neon-Cyan Glow Band directly on the boundary
                            drawCircle(
                                color = Color(0xFF00E5FF).copy(alpha = fadeAlpha * 0.98f),
                                radius = currentRadius,
                                center = center,
                                style = Stroke(width = with(density) { (36f + progress * 24f).dp.toPx() }),
                                blendMode = BlendMode.Plus
                            )

                            // 6. High-Voltage Electric Blue Shockwave Core
                            drawCircle(
                                color = Color(0xFF00B0FF).copy(alpha = fadeAlpha * 0.92f),
                                radius = currentRadius,
                                center = center,
                                style = Stroke(width = with(density) { (18f + progress * 12f).dp.toPx() }),
                                blendMode = BlendMode.Plus
                            )

                            // 7. Ultra-Bright Blazing White Laser Cutting Edge
                            drawCircle(
                                color = Color.White.copy(alpha = fadeAlpha * 0.99f),
                                radius = currentRadius,
                                center = center,
                                style = Stroke(width = with(density) { 6.dp.toPx() }),
                                blendMode = BlendMode.Plus
                            )
                        }
                    }
                }
            }
        }
    }
}

