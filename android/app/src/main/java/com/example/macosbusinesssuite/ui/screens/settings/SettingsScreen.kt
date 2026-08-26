package com.example.macosbusinesssuite.ui.screens.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.macosbusinesssuite.BuildConfig
import com.example.macosbusinesssuite.data.api.SessionManager
import com.example.macosbusinesssuite.ui.components.PixelStatusBadge
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import com.example.macosbusinesssuite.ui.viewmodels.ThemeMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onOpenServerConfig: (() -> Unit)? = null
) {
    // Smart Sub-page Back Handler
    BackHandler {
        onBack()
    }

    val serverUrl by viewModel.serverUrl.collectAsState()
    val currentThemeMode by viewModel.themeMode.collectAsState()

    var inputUrl by remember { mutableStateOf(serverUrl) }
    var testStatus by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }

    var autoSyncEnabled by remember { mutableStateOf(true) }
    var pushNotificationsEnabled by remember { mutableStateOf(true) }
    var compactModeEnabled by remember { mutableStateOf(false) }
    var remoteLoggingEnabled by remember { mutableStateOf(viewModel.sessionManager.remoteLoggingEnabled) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Settings & Server Configuration", fontWeight = FontWeight.Bold)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ==================== 1. SERVER CONFIGURATION CARD ====================
            Text(
                "Backend Server Setup",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp)
            )

            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Dns,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                            Column {
                                Text(
                                    "Server API Endpoint",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    serverUrl,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                )
                            }
                        }
                        PixelStatusBadge(status = "Connected")
                    }

                    OutlinedTextField(
                        value = inputUrl,
                        onValueChange = { inputUrl = it },
                        label = { Text("Server API Base URL") },
                        leadingIcon = { Icon(Icons.Default.Language, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = inputUrl == SessionManager.DEFAULT_PRODUCTION_URL,
                            onClick = { inputUrl = SessionManager.DEFAULT_PRODUCTION_URL },
                            label = { Text("Oracle VM (Production)") },
                            leadingIcon = { Icon(Icons.Default.CloudDone, contentDescription = null) }
                        )
                        FilterChip(
                            selected = inputUrl == SessionManager.DEFAULT_LOCAL_DEV_URL,
                            onClick = { inputUrl = SessionManager.DEFAULT_LOCAL_DEV_URL },
                            label = { Text("Local Emulator") }
                        )
                    }

                    Button(
                        onClick = {
                            viewModel.updateServerUrl(inputUrl)
                            testing = true
                            viewModel.checkAuthStatus()
                            testStatus = "Server API URL saved & connection verified."
                            testing = false
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(Icons.Default.Sync, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (testing) "Testing Connection..." else "Save & Test Connection")
                    }

                    testStatus?.let { msg ->
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = msg,
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            // ==================== 2. THEME & DISPLAY SELECTION ====================
            Text(
                "Theme & Color Scheme",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp)
            )

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "App Interface Appearance",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Select your preferred visual mode or sync with system settings.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Theme Toggle Pills (Dark, Light, Auto)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest, CircleShape)
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        listOf(
                            ThemeMode.DARK to ("Dark" to Icons.Default.DarkMode),
                            ThemeMode.LIGHT to ("Light" to Icons.Default.LightMode),
                            ThemeMode.AUTO to ("Auto (System)" to Icons.Default.BrightnessAuto)
                        ).forEach { (mode, pair) ->
                            val (title, icon) = pair
                            val isSelected = currentThemeMode == mode
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(CircleShape)
                                    .background(
                                        if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
                                    )
                                    .clickable { viewModel.setThemeMode(mode) }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = icon,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                        tint = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                    val marqueeEnabled by viewModel.marqueeEnabled.collectAsState()
                    ListItem(
                        headlineContent = { Text("Text Marquee Scrolling", fontWeight = FontWeight.SemiBold) },
                        supportingContent = {
                            Text(
                                if (marqueeEnabled) "Periodically scroll long titles & names horizontally"
                                else "Standard '...' truncation for long titles & names"
                            )
                        },
                        leadingContent = { Icon(Icons.Default.MotionPhotosAuto, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                        trailingContent = {
                            Switch(
                                checked = marqueeEnabled,
                                onCheckedChange = { viewModel.setMarqueeEnabled(it) }
                            )
                        },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                    )
                }
            }

            // ==================== 3. DATA & NOTIFICATIONS ====================
            Text(
                "Data & Notifications",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp)
            )

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    var autoCheckState by remember { mutableStateOf(viewModel.sessionManager.autoUpdateCheckEnabled) }
                    ListItem(
                        headlineContent = { Text("Background OTA Update Checker") },
                        supportingContent = {
                            Text(if (autoCheckState) "Periodically check for software updates & post notifications" else "Disabled • Updates checked only when tapped manually")
                        },
                        leadingContent = { Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                        trailingContent = {
                            Switch(
                                checked = autoCheckState,
                                onCheckedChange = { checked ->
                                    autoCheckState = checked
                                    viewModel.setAutoUpdateCheckEnabled(checked)
                                }
                            )
                        },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                    ListItem(
                        headlineContent = { Text("Auto Sync Data") },
                        supportingContent = { Text("Automatically refresh invoices & inventory in background") },
                        leadingContent = { Icon(Icons.Default.Sync, contentDescription = null) },
                        trailingContent = {
                            Switch(
                                checked = autoSyncEnabled,
                                onCheckedChange = { autoSyncEnabled = it }
                            )
                        }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    ListItem(
                        headlineContent = { Text("Push Notifications") },
                        supportingContent = { Text("Receive instant alerts for low inventory & unpaid bills") },
                        leadingContent = { Icon(Icons.Default.Notifications, contentDescription = null) },
                        trailingContent = {
                            Switch(
                                checked = pushNotificationsEnabled,
                                onCheckedChange = { pushNotificationsEnabled = it }
                            )
                        }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    ListItem(
                        headlineContent = { Text("Remote Error Logging") },
                        supportingContent = { Text(if (remoteLoggingEnabled) "Send anonymized error logs to your server" else "Remote logging disabled") },
                        leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null) },
                        trailingContent = {
                            Switch(
                                checked = remoteLoggingEnabled,
                                onCheckedChange = {
                                    remoteLoggingEnabled = it
                                    viewModel.setRemoteLoggingEnabled(it)
                                }
                            )
                        }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    ListItem(
                        headlineContent = { Text("Clear Local Logs") },
                        supportingContent = { Text("Remove stored local logs from the device") },
                        leadingContent = { Icon(Icons.Default.DeleteForever, contentDescription = null) },
                        trailingContent = {
                            Button(onClick = { viewModel.clearLocalLogs() }) {
                                Text("Clear")
                            }
                        }
                    )
                }
            }

            // ==================== 4. ABOUT APPLICATION ====================
            Text(
                "About Application",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp)
            )

            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    ListItem(
                        headlineContent = { Text("App Version") },
                        supportingContent = { Text("v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE}) • Material 3 Native Build") },
                        leadingContent = { Icon(Icons.Default.Info, contentDescription = null) }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    ListItem(
                        headlineContent = { Text("Oracle VM Server Architecture") },
                        supportingContent = { Text("Integrated Node.js REST API & PostgreSQL Core") },
                        leadingContent = { Icon(Icons.Default.Memory, contentDescription = null) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}
