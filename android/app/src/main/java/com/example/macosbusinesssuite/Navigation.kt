package com.example.macosbusinesssuite

import androidx.compose.animation.*
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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

    val userPicture = profile?.actualPicture ?: activeUser?.displayPicture ?: mainViewModel.sessionManager.userPicture
    val userName = profile?.actualName ?: activeUser?.displayName ?: mainViewModel.sessionManager.userName ?: "User"
    val userEmail = profile?.actualEmail ?: activeUser?.identifier ?: mainViewModel.sessionManager.userEmail ?: ""
    val userRole = profile?.role ?: activeUser?.role ?: mainViewModel.sessionManager.userRole

    val serverOrigin = remember(serverUrl) {
        val url = serverUrl.trimEnd('/')
        if (url.endsWith("/api")) url.removeSuffix("/api") else url
    }

    val isDarkTheme = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.AUTO -> isSystemInDarkTheme()
    }

    var currentTab by remember { mutableStateOf(AppTab.BILLING) }
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
                // Layer 0: LoginScreen (stays visible while logged out OR radiating out during unlock reveal)
                if (!isLoggedIn || isUnlockRevealing) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                if (isUnlockRevealing) {
                                    val p = unlockProgress.value
                                    // Subtle organic scale expansion as the screen bursts open
                                    scaleX = 1f + (p * 0.05f)
                                    scaleY = 1f + (p * 0.05f)
                                }
                            }
                    ) {
                        LoginScreen(
                            viewModel = mainViewModel,
                            onLoginSuccess = { clickOrigin ->
                                coroutineScope.launch {
                                    unlockOrigin = clickOrigin ?: Offset.Zero
                                    isUnlockRevealing = true
                                    mainViewModel.completeLogin()
                                    currentTab = AppTab.BILLING
                                    unlockProgress.snapTo(0f)
                                    unlockProgress.animateTo(
                                        targetValue = 1f,
                                        animationSpec = tween(durationMillis = 750, easing = FastOutSlowInEasing)
                                    )
                                    isUnlockRevealing = false
                                }
                            }
                        )
                    }
                }

                // Layer 1: Authenticated Dashboard (revealed within the expanding circle)
                if (isLoggedIn) {
                    // Root BackHandler for tab switching and double back exit
                    BackHandler(enabled = !isProfileOpen && !isSettingsOpen && !isUpdatePageOpen && !isSubPageOpen && !isUnlockRevealing) {
                        if (currentTab != AppTab.BILLING) {
                            currentTab = AppTab.BILLING
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
                            .then(
                                if (isUnlockRevealing) {
                                    Modifier.graphicsLayer {
                                        val progress = unlockProgress.value
                                        val center = if (unlockOrigin == Offset.Zero) Offset(size.width / 2f, size.height / 2f) else unlockOrigin
                                        val maxRadius = kotlin.math.hypot(
                                            kotlin.math.max(center.x, size.width - center.x),
                                            kotlin.math.max(center.y, size.height - center.y)
                                        ) * 1.08f
                                        val currentRadius = maxRadius * progress

                                        clip = true
                                        shape = object : Shape {
                                            override fun createOutline(
                                                size: Size,
                                                layoutDirection: LayoutDirection,
                                                density: Density
                                            ): Outline {
                                                val path = Path().apply {
                                                    addOval(Rect(center = center, radius = currentRadius))
                                                }
                                                return Outline.Generic(path)
                                            }
                                        }
                                    }
                                } else Modifier
                            )
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
                                serverOrigin = serverOrigin
                            )
                        }
                    }
                }

                // Layer 2: Vivid, Stock Android AOD/Lock Screen Radiant Dissipating Wavefront
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
                        ) * 1.08f
                        val currentRadius = maxRadius * progress

                        // Intense Stock Android AOD / Lock screen radiating glow
                        val fadeAlpha = (1f - (progress * 0.75f)).coerceIn(0f, 1f)
                        if (fadeAlpha > 0.001f && currentRadius > 0f) {
                            // 1. Radiant electric cyan/blue atmospheric halo around the perimeter
                            drawCircle(
                                brush = Brush.radialGradient(
                                    colors = listOf(
                                        Color(0xFF00E5FF).copy(alpha = fadeAlpha * 0.40f),
                                        Color(0xFF2979FF).copy(alpha = fadeAlpha * 0.20f),
                                        Color.Transparent
                                    ),
                                    center = center,
                                    radius = currentRadius + with(density) { 50.dp.toPx() }
                                ),
                                radius = currentRadius + with(density) { 50.dp.toPx() },
                                center = center
                            )

                            // 2. Thick luminous neon-cyan glow band directly along the boundary
                            drawCircle(
                                color = Color(0xFF00E5FF).copy(alpha = fadeAlpha * 0.85f),
                                radius = currentRadius,
                                center = center,
                                style = androidx.compose.ui.graphics.drawscope.Stroke(width = with(density) { (28f + progress * 20f).dp.toPx() })
                            )

                            // 3. Electric blue inner/outer wavefront band
                            drawCircle(
                                color = Color(0xFF448AFF).copy(alpha = fadeAlpha * 0.70f),
                                radius = currentRadius,
                                center = center,
                                style = androidx.compose.ui.graphics.drawscope.Stroke(width = with(density) { (12f + progress * 8f).dp.toPx() })
                            )

                            // 4. Ultra-bright blazing white cutting edge wavefront
                            drawCircle(
                                color = Color.White.copy(alpha = fadeAlpha * 0.98f),
                                radius = currentRadius,
                                center = center,
                                style = androidx.compose.ui.graphics.drawscope.Stroke(width = with(density) { 4.5.dp.toPx() })
                            )
                        }
                    }
                }
            }
        }
    }
}

