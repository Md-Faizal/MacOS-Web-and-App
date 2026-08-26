package com.example.macosbusinesssuite

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.BackHandler
import android.app.Activity
import android.widget.Toast
import androidx.lifecycle.viewmodel.compose.viewModel
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
        } else if (!isLoggedIn) {
            LoginScreen(
                viewModel = mainViewModel,
                onLoginSuccess = {
                    currentTab = AppTab.BILLING
                }
            )
        } else {
            val context = LocalContext.current
            var lastBackPressedTime by remember { mutableLongStateOf(0L) }

            // Root BackHandler for tab switching and double back exit
            BackHandler(enabled = isLoggedIn && !isProfileOpen && !isSettingsOpen && !isUpdatePageOpen && !isSubPageOpen) {
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
                        onLogout = { mainViewModel.logout() }
                    )
                }
            }
        }
    }
}
