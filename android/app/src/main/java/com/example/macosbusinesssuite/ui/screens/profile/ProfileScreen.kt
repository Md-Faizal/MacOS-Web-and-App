package com.example.macosbusinesssuite.ui.screens.profile

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.macosbusinesssuite.data.model.DeviceItem
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

import androidx.activity.compose.BackHandler

sealed class ProfileRoute {
    object Main : ProfileRoute()
    object PersonalInfo : ProfileRoute()
    object SecurityHub : ProfileRoute()
    object SetupPassword : ProfileRoute()
    object ChangePassword : ProfileRoute()
    object UpdateQuestion : ProfileRoute()
}

@Composable
fun ProfileScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit = {}
) {
    var currentRoute by remember { mutableStateOf<ProfileRoute>(ProfileRoute.Main) }

    // Smart Sub-page Back Handler
    BackHandler {
        if (currentRoute != ProfileRoute.Main) {
            currentRoute = ProfileRoute.Main
        } else {
            onBack()
        }
    }

    Crossfade(targetState = currentRoute, label = "ProfileNavigation") { route ->
        when (route) {
            is ProfileRoute.Main -> ProfileMainView(
                viewModel = viewModel,
                onNavigateToPersonal = { currentRoute = ProfileRoute.PersonalInfo },
                onNavigateToSecurity = { currentRoute = ProfileRoute.SecurityHub }
            )
            is ProfileRoute.PersonalInfo -> PersonalInfoView(
                viewModel = viewModel,
                onBack = { currentRoute = ProfileRoute.Main }
            )
            is ProfileRoute.SecurityHub -> SecurityHubView(
                viewModel = viewModel,
                onBack = { currentRoute = ProfileRoute.Main },
                onNavigateToSetupPassword = { currentRoute = ProfileRoute.SetupPassword },
                onNavigateToChangePassword = { currentRoute = ProfileRoute.ChangePassword },
                onNavigateToUpdateQuestion = { currentRoute = ProfileRoute.UpdateQuestion }
            )
            is ProfileRoute.SetupPassword -> PlaceholderSubView("Setup Password", onBack = { currentRoute = ProfileRoute.SecurityHub })
            is ProfileRoute.ChangePassword -> PlaceholderSubView("Change Password", onBack = { currentRoute = ProfileRoute.SecurityHub })
            is ProfileRoute.UpdateQuestion -> PlaceholderSubView("Update Security Question", onBack = { currentRoute = ProfileRoute.SecurityHub })
        }
    }
}

@Composable
fun PlaceholderSubView(title: String, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .padding(16.dp)
                .clickable(onClick = onBack)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
            Spacer(modifier = Modifier.width(8.dp))
            Text("Back", color = MaterialTheme.colorScheme.primary)
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(16.dp)
        )
        Text("Coming soon...", modifier = Modifier.padding(horizontal = 16.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonalInfoView(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val profile by viewModel.profile.collectAsState()
    val sessionManager = viewModel.sessionManager

    var fullName by remember { mutableStateOf(profile?.fullName ?: sessionManager.userName ?: "") }
    var emailId by remember { mutableStateOf(profile?.emailId ?: sessionManager.userEmail ?: "") }
    var isSaving by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Personal Information") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .align(Alignment.CenterHorizontally),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.AccountCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(72.dp)
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = fullName,
                onValueChange = { fullName = it },
                label = { Text("Full Name") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = emailId,
                onValueChange = { emailId = it },
                label = { Text("Email Address") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    if (fullName.isNotBlank() && emailId.isNotBlank()) {
                        isSaving = true
                        viewModel.updateProfile(fullName, emailId) { success ->
                            isSaving = false
                            scope.launch {
                                if (success) {
                                    snackbarHostState.showSnackbar("Profile updated successfully")
                                } else {
                                    snackbarHostState.showSnackbar("Failed to update profile")
                                }
                            }
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                enabled = !isSaving
            ) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Save Changes")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecurityHubView(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onNavigateToSetupPassword: () -> Unit,
    onNavigateToChangePassword: () -> Unit,
    onNavigateToUpdateQuestion: () -> Unit
) {
    val passwordSet by viewModel.passwordSet.collectAsState()
    val biometricEnabled by viewModel.biometricEnabled.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sign-In & Security") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 90.dp)
        ) {
            item {
                Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Column {
                        ListItem(
                            headlineContent = { Text("Login Password") },
                            trailingContent = {
                                Switch(
                                    checked = passwordSet,
                                    onCheckedChange = { if (it) onNavigateToSetupPassword() else { /* disable flow */ } }
                                )
                            }
                        )
                    }
                }
                Text("Require a password to unlock this app.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }

            if (passwordSet) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Column {
                            ListItem(
                                headlineContent = { Text("Biometric Login") },
                                trailingContent = {
                                    Switch(
                                        checked = biometricEnabled,
                                        onCheckedChange = { viewModel.setBiometricEnabled(it) }
                                    )
                                }
                            )
                        }
                    }
                    Text("Use fingerprint or face to unlock your account.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                }

                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                        Column {
                            ListItem(
                                headlineContent = { Text("Change Password") },
                                trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                                modifier = Modifier.clickable(onClick = onNavigateToChangePassword)
                            )
                            HorizontalDivider()
                            ListItem(
                                headlineContent = { Text("Update Security Question") },
                                trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                                modifier = Modifier.clickable(onClick = onNavigateToUpdateQuestion)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileMainView(
    viewModel: MainViewModel,
    onNavigateToPersonal: () -> Unit,
    onNavigateToSecurity: () -> Unit
) {
    val profile by viewModel.profile.collectAsState()
    val devices by viewModel.devices.collectAsState()
    val sessionManager = viewModel.sessionManager
    val passwordSet by viewModel.passwordSet.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 90.dp)
    ) {
        // Identity Header
        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier.size(96.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.AccountCircle, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(72.dp))
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = profile?.fullName ?: sessionManager.userName ?: "User",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = profile?.emailId ?: sessionManager.userEmail ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        // Settings Groups
        item {
            Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                Column {
                    ListItem(
                        headlineContent = { Text("Personal Information") },
                        leadingContent = { Icon(Icons.Default.Person, contentDescription = null) },
                        trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null) },
                        modifier = Modifier.clickable(onClick = onNavigateToPersonal)
                    )
                    HorizontalDivider(modifier = Modifier.padding(start = 56.dp))
                    ListItem(
                        headlineContent = { Text("Sign-In & Security") },
                        leadingContent = { Icon(Icons.Default.Security, contentDescription = null) },
                        trailingContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (passwordSet) "On" else "Off", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(modifier = Modifier.width(8.dp))
                                Icon(Icons.Default.ChevronRight, contentDescription = null)
                            }
                        },
                        modifier = Modifier.clickable(onClick = onNavigateToSecurity)
                    )
                }
            }
        }

        // Devices
        item {
            Text(
                text = "Devices",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        items(devices) { device ->
            DeviceRow(device = device, onLogout = { viewModel.logoutDevice(device.id) })
        }

        if (devices.isEmpty()) {
            item {
                Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("This Device", fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("(Active)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        },
                        supportingContent = { Text("Online Now") },
                        leadingContent = {
                            Box {
                                Icon(
                                    Icons.Default.PhoneAndroid,
                                    contentDescription = null,
                                    modifier = Modifier.size(32.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .background(androidx.compose.ui.graphics.Color.Green)
                                        .align(Alignment.BottomEnd)
                                )
                            }
                        }
                    )
                }
            }
        }

        if (devices.size > 1) {
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.logoutAllDevices() },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Sign Out of All Devices")
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun DeviceRow(device: DeviceItem, onLogout: () -> Unit) {
    val isOnline = device.isCurrent || (System.currentTimeMillis() - parseDateToMillis(device.lastActive) < 120000)

    Card(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
        ListItem(
            headlineContent = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(device.name, fontWeight = FontWeight.Bold)
                    if (device.isCurrent) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("(This device)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            },
            supportingContent = {
                if (isOnline) {
                    Text("Online Now", color = MaterialTheme.colorScheme.primary)
                } else {
                    Text("Last seen: ${formatDeviceDate(device.lastActive)}")
                }
            },
            leadingContent = {
                Box {
                    Icon(
                        imageVector = if (device.os?.contains("Android", ignoreCase = true) == true) Icons.Default.PhoneAndroid else Icons.Default.Laptop,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    if (isOnline) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(androidx.compose.ui.graphics.Color.Green)
                                .align(Alignment.BottomEnd)
                        )
                    }
                }
            },
            trailingContent = {
                if (!device.isCurrent) {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Delete, contentDescription = "Remove Device", tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
        )
    }
}

fun formatDeviceDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return "Unknown"
    try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val date = parser.parse(dateString) ?: return "Unknown"
        val formatter = SimpleDateFormat("d MMM yyyy 'At' hh:mm:ss a", Locale.US)
        return formatter.format(date)
    } catch (e: Exception) {
        return "Unknown"
    }
}

fun parseDateToMillis(dateString: String?): Long {
    if (dateString.isNullOrEmpty()) return 0L
    try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        return parser.parse(dateString)?.time ?: 0L
    } catch (e: Exception) {
        return 0L
    }
}
