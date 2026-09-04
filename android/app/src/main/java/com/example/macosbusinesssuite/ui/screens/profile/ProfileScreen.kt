package com.example.macosbusinesssuite.ui.screens.profile

import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.fragment.app.FragmentActivity
import com.example.macosbusinesssuite.R
import com.example.macosbusinesssuite.data.model.DeviceItem
import com.example.macosbusinesssuite.data.model.RememberedUser
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import com.example.macosbusinesssuite.util.BiometricAuthHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit = {}
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val profile by viewModel.profile.collectAsState()
    val activeUser by viewModel.activeUser.collectAsState()
    val rememberedUsers by viewModel.rememberedUsers.collectAsState()
    val devices by viewModel.devices.collectAsState()
    val biometricEnabled by viewModel.biometricEnabled.collectAsState()
    val passwordSet by viewModel.passwordSet.collectAsState()
    val sessionManager = viewModel.sessionManager
    val multiUserManager = viewModel.multiUserManager

    // Resolve server origin
    val serverOrigin = remember(sessionManager.serverUrl) {
        val url = sessionManager.serverUrl.trimEnd('/')
        if (url.endsWith("/api")) url.removeSuffix("/api") else url
    }

    // Current user identity details
    val currentIdentifier = activeUser?.identifier ?: sessionManager.userEmail ?: ""
    val currentUserId = activeUser?.id ?: profile?.id ?: sessionManager.userId
    val displayName = profile?.fullName ?: activeUser?.displayName ?: sessionManager.userName ?: "User"
    val displayEmail = profile?.emailId ?: activeUser?.identifier ?: sessionManager.userEmail ?: ""
    val displayAvatar = profile?.profilePicture ?: activeUser?.displayPicture
    val userRole = profile?.role ?: activeUser?.role ?: "worker"
    val isAdmin = userRole.equals("owner", ignoreCase = true) || userRole.equals("admin", ignoreCase = true)

    // Form states for Personal Info
    var fullNameInput by remember(profile?.fullName) { mutableStateOf(profile?.fullName ?: displayName) }
    var emailInput by remember(profile?.emailId) { mutableStateOf(profile?.emailId ?: displayEmail) }
    var isSavingProfile by remember { mutableStateOf(false) }

    // Dialog States
    var showChangePasswordDialog by remember { mutableStateOf(false) }
    var showSecurityQuestionDialog by remember { mutableStateOf(false) }
    var showDisconnectGoogleDialog by remember { mutableStateOf(false) }
    var userPendingRemoval by remember { mutableStateOf<RememberedUser?>(null) }
    var showLogoutAllDevicesDialog by remember { mutableStateOf(false) }

    // Remember this account toggle state
    var isAccountRemembered by remember(currentIdentifier, rememberedUsers) {
        mutableStateOf(multiUserManager.isUserRemembered(currentIdentifier, currentUserId))
    }

    // Refresh profile and devices on load
    LaunchedEffect(Unit) {
        viewModel.loadProfile()
        viewModel.loadDevices()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Account Profile",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleLarge
                    )
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
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 10.dp, bottom = 96.dp)
        ) {
            // ================= 1. HERO PROFILE HEADER =================
            item {
                Surface(
                    shape = RoundedCornerShape(26.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp, horizontal = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(contentAlignment = Alignment.BottomEnd) {
                            ProfileAvatarImage(
                                pictureUrl = displayAvatar,
                                displayName = displayName,
                                size = 88.dp,
                                serverOrigin = serverOrigin
                            )
                            // Online indicator dot
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF2E7D32))
                                    .border(2.dp, MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape)
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        Text(
                            text = displayName,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center
                        )

                        Text(
                            text = displayEmail,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )

                        if (isAdmin) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.primaryContainer,
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Text(
                                    text = "Admin",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ================= 2. PERSONAL INFORMATION =================
            item {
                SectionHeader(title = "Personal Information")
            }

            item {
                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp)
                    ) {
                        OutlinedTextField(
                            value = fullNameInput,
                            onValueChange = { fullNameInput = it },
                            label = { Text("Full Name") },
                            leadingIcon = {
                                Icon(Icons.Outlined.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = emailInput,
                            onValueChange = { emailInput = it },
                            label = { Text("Email Address") },
                            leadingIcon = {
                                Icon(Icons.Outlined.Email, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = {
                                if (fullNameInput.isNotBlank() && emailInput.isNotBlank()) {
                                    isSavingProfile = true
                                    viewModel.updateProfile(
                                        fullName = fullNameInput.trim(),
                                        email = emailInput.trim(),
                                        profilePicture = displayAvatar
                                    ) { success, _ ->
                                        isSavingProfile = false
                                        coroutineScope.launch {
                                            snackbarHostState.showSnackbar(
                                                if (success) "Profile details updated" else "Failed to update profile"
                                            )
                                        }
                                    }
                                }
                            },
                            enabled = !isSavingProfile && (fullNameInput.isNotBlank() && emailInput.isNotBlank()),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                        ) {
                            if (isSavingProfile) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Save Changes", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            // ================= 3. CONNECTED SERVICES =================
            item {
                SectionHeader(title = "Connected Services")
            }

            item {
                val isGoogleLinked = profile?.googleLinked == true || !profile?.googleEmail.isNullOrBlank()
                val googleEmailText = profile?.googleEmail ?: profile?.emailId ?: ""

                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color.White,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                            modifier = Modifier.size(44.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Image(
                                    painter = painterResource(id = R.drawable.ic_google_logo),
                                    contentDescription = "Google",
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Google Account",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            if (isGoogleLinked) {
                                Text(
                                    text = googleEmailText,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "Connected",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF2E7D32)
                                )
                            } else {
                                Text(
                                    text = "Not linked",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        if (isGoogleLinked) {
                            OutlinedButton(
                                onClick = { showDisconnectGoogleDialog = true },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error
                                ),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.6f)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                            ) {
                                Text("Disconnect", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            // ================= 4. SIGN-IN & SECURITY =================
            item {
                SectionHeader(title = "Sign-In & Security")
            }

            item {
                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // Change Password Row
                        ListItem(
                            headlineContent = {
                                Text("Change Password", fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Text(
                                    if (passwordSet) "Login password is set" else "Set up a login password",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            },
                            leadingContent = {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(20.dp))
                                    }
                                }
                            },
                            trailingContent = {
                                Icon(Icons.Default.ChevronRight, contentDescription = null)
                            },
                            modifier = Modifier
                                .clickable { showChangePasswordDialog = true }
                                .padding(vertical = 4.dp)
                        )

                        HorizontalDivider(
                            modifier = Modifier.padding(start = 68.dp),
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
                        )

                        // Update Security Question Row
                        ListItem(
                            headlineContent = {
                                Text("Security Question", fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Text("Used for emergency account recovery", style = MaterialTheme.typography.bodySmall)
                            },
                            leadingContent = {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Outlined.HelpOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(20.dp))
                                    }
                                }
                            },
                            trailingContent = {
                                Icon(Icons.Default.ChevronRight, contentDescription = null)
                            },
                            modifier = Modifier
                                .clickable { showSecurityQuestionDialog = true }
                                .padding(vertical = 4.dp)
                        )

                        HorizontalDivider(
                            modifier = Modifier.padding(start = 68.dp),
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
                        )

                        // Remember This Account Toggle Row
                        ListItem(
                            headlineContent = {
                                Text("Remember This Account", fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Text("Fast sign-in from the device lock screen", style = MaterialTheme.typography.bodySmall)
                            },
                            leadingContent = {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.tertiaryContainer,
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Outlined.BookmarkBorder, contentDescription = null, tint = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(20.dp))
                                    }
                                }
                            },
                            trailingContent = {
                                Switch(
                                    checked = isAccountRemembered,
                                    onCheckedChange = { checked ->
                                        isAccountRemembered = checked
                                        if (checked) {
                                            viewModel.saveRememberedProfile(
                                                identifier = currentIdentifier,
                                                displayName = displayName,
                                                displayPicture = displayAvatar,
                                                role = userRole,
                                                isBiometricEnabled = biometricEnabled
                                            )
                                            coroutineScope.launch {
                                                snackbarHostState.showSnackbar("Account saved on this device")
                                            }
                                        } else {
                                            currentUserId?.let { uid ->
                                                viewModel.removeRememberedUser(uid)
                                            }
                                            coroutineScope.launch {
                                                snackbarHostState.showSnackbar("Account removed from saved list")
                                            }
                                        }
                                    }
                                )
                            },
                            modifier = Modifier.padding(vertical = 4.dp)
                        )

                        HorizontalDivider(
                            modifier = Modifier.padding(start = 68.dp),
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
                        )

                        // Biometric Login Toggle Row
                        ListItem(
                            headlineContent = {
                                Text("Biometric Login", fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Text("Unlock with fingerprint or face recognition", style = MaterialTheme.typography.bodySmall)
                            },
                            leadingContent = {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.Fingerprint, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(20.dp))
                                    }
                                }
                            },
                            trailingContent = {
                                Switch(
                                    checked = biometricEnabled,
                                    onCheckedChange = { enableRequested ->
                                        if (enableRequested) {
                                            val bioStatus = BiometricAuthHelper.checkBiometricAvailability(context)
                                            if (bioStatus != BiometricAuthHelper.BiometricStatus.AVAILABLE) {
                                                coroutineScope.launch {
                                                    snackbarHostState.showSnackbar("Biometric authentication not enrolled or available on this device")
                                                }
                                                return@Switch
                                            }

                                            val activity = context as? FragmentActivity
                                            if (activity != null) {
                                                BiometricAuthHelper.authenticate(
                                                    activity = activity,
                                                    title = "Enable Biometric Login",
                                                    subtitle = "Scan biometric to register this device",
                                                    onSuccess = {
                                                        val deviceId = try {
                                                            android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "android_device"
                                                        } catch (e: Exception) {
                                                            "android_device"
                                                        }
                                                        val deviceModel = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"

                                                        viewModel.registerMobileBiometric(
                                                            deviceId = deviceId,
                                                            deviceModel = deviceModel,
                                                            credentialPayload = mapOf("registeredAt" to System.currentTimeMillis())
                                                        ) { success, msg ->
                                                            if (success) {
                                                                viewModel.setBiometricEnabled(true)
                                                                viewModel.saveRememberedProfile(
                                                                    identifier = currentIdentifier,
                                                                    displayName = displayName,
                                                                    displayPicture = displayAvatar,
                                                                    role = userRole,
                                                                    isBiometricEnabled = true
                                                                )
                                                                coroutineScope.launch {
                                                                    snackbarHostState.showSnackbar("Biometric login enabled")
                                                                }
                                                            } else {
                                                                coroutineScope.launch {
                                                                    snackbarHostState.showSnackbar(msg ?: "Failed to register biometric on server")
                                                                }
                                                            }
                                                        }
                                                    },
                                                    onError = { _, err ->
                                                        coroutineScope.launch {
                                                            snackbarHostState.showSnackbar("Biometric scan cancelled: $err")
                                                        }
                                                    },
                                                    onFailed = {}
                                                )
                                            }
                                        } else {
                                            val deviceId = try {
                                                android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "android_device"
                                            } catch (e: Exception) {
                                                "android_device"
                                            }
                                            viewModel.revokeMobileBiometric(deviceId) { _, _ ->
                                                viewModel.setBiometricEnabled(false)
                                                viewModel.saveRememberedProfile(
                                                    identifier = currentIdentifier,
                                                    displayName = displayName,
                                                    displayPicture = displayAvatar,
                                                    role = userRole,
                                                    isBiometricEnabled = false
                                                )
                                                coroutineScope.launch {
                                                    snackbarHostState.showSnackbar("Biometric login disabled")
                                                }
                                            }
                                        }
                                    }
                                )
                            },
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    }
                }
            }

            // ================= 5. OTHER ACCOUNTS ON THIS DEVICE =================
            val otherAccounts = rememberedUsers.filter { !it.identifier.equals(currentIdentifier, ignoreCase = true) }
            if (otherAccounts.isNotEmpty()) {
                item {
                    SectionHeader(title = "Other Accounts on this Device (${otherAccounts.size})")
                }

                items(otherAccounts) { otherUser ->
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surfaceContainer,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ProfileAvatarImage(
                                pictureUrl = otherUser.displayPicture,
                                displayName = otherUser.displayName,
                                size = 44.dp,
                                serverOrigin = serverOrigin
                            )

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = otherUser.displayName,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = otherUser.identifier,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val isOtherAdmin = otherUser.role.equals("owner", ignoreCase = true) || otherUser.role.equals("admin", ignoreCase = true)
                                if (isOtherAdmin) {
                                    Text(
                                        text = "Admin",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            FilledTonalButton(
                                onClick = {
                                    viewModel.switchActiveUser(otherUser)
                                    coroutineScope.launch {
                                        snackbarHostState.showSnackbar("Switched to ${otherUser.displayName}")
                                    }
                                },
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 2.dp),
                                modifier = Modifier.height(36.dp)
                            ) {
                                Text("Switch", fontSize = 12.sp)
                            }

                            Spacer(modifier = Modifier.width(6.dp))

                            IconButton(
                                onClick = { userPendingRemoval = otherUser },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Remove account",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ================= 6. SIGNED-IN DEVICES =================
            item {
                SectionHeader(title = "Signed-in Devices (${devices.size.coerceAtLeast(1)})")
            }

            if (devices.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surfaceContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        ListItem(
                            headlineContent = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("This Android Device", fontWeight = FontWeight.Bold)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("(Active)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                }
                            },
                            supportingContent = { Text("Online Now", color = Color(0xFF2E7D32)) },
                            leadingContent = {
                                Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
                            }
                        )
                    }
                }
            } else {
                items(devices) { device ->
                    DeviceRow(device = device, onLogout = { viewModel.logoutDevice(device.id) })
                }
            }

            if (devices.size > 1) {
                item {
                    Spacer(modifier = Modifier.height(6.dp))
                    Button(
                        onClick = { showLogoutAllDevicesDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sign Out of All Devices", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }

    // ================= CHANGE PASSWORD DIALOG =================
    if (showChangePasswordDialog) {
        ChangePasswordDialog(
            viewModel = viewModel,
            onDismiss = { showChangePasswordDialog = false },
            onSuccess = {
                showChangePasswordDialog = false
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Password changed successfully")
                }
            }
        )
    }

    // ================= UPDATE SECURITY QUESTION DIALOG =================
    if (showSecurityQuestionDialog) {
        UpdateSecurityQuestionDialog(
            viewModel = viewModel,
            onDismiss = { showSecurityQuestionDialog = false },
            onSuccess = {
                showSecurityQuestionDialog = false
                coroutineScope.launch {
                    snackbarHostState.showSnackbar("Security question updated successfully")
                }
            }
        )
    }

    // ================= DISCONNECT GOOGLE CONFIRMATION DIALOG =================
    if (showDisconnectGoogleDialog) {
        AlertDialog(
            onDismissRequest = { showDisconnectGoogleDialog = false },
            icon = { Icon(Icons.Outlined.LinkOff, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Disconnect Google Account?") },
            text = { Text("You will no longer be able to sign in with your Google account until you reconnect it.") },
            confirmButton = {
                Button(
                    onClick = {
                        showDisconnectGoogleDialog = false
                        viewModel.disconnectGoogle { success, err ->
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    if (success) "Google account disconnected" else (err ?: "Failed to disconnect Google")
                                )
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Disconnect")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisconnectGoogleDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ================= REMOVE REMEMBERED ACCOUNT DIALOG =================
    userPendingRemoval?.let { user ->
        AlertDialog(
            onDismissRequest = { userPendingRemoval = null },
            icon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Remove Account from Device?") },
            text = { Text("Account '${user.displayName}' (${user.identifier}) will be removed from this device's saved logins.") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.removeRememberedUser(user.id)
                        userPendingRemoval = null
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Account removed from device")
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { userPendingRemoval = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ================= LOGOUT ALL DEVICES DIALOG =================
    if (showLogoutAllDevicesDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutAllDevicesDialog = false },
            icon = { Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Sign Out of All Devices?") },
            text = { Text("This will terminate all active sessions across your computers, tablets, and phones.") },
            confirmButton = {
                Button(
                    onClick = {
                        showLogoutAllDevicesDialog = false
                        viewModel.logoutAllDevices()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Signed out of all other devices")
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Sign Out All")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutAllDevicesDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

// ================= SECTION HEADER =================
@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp)
    )
}

// ================= CHANGE PASSWORD DIALOG =================
@Composable
private fun ChangePasswordDialog(
    viewModel: MainViewModel,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit
) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var oldVisible by remember { mutableStateOf(false) }
    var newVisible by remember { mutableStateOf(false) }
    var confirmVisible by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(54.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.LockReset, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "Change Password",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = oldPassword,
                    onValueChange = { oldPassword = it; errorMessage = null },
                    label = { Text("Current Password") },
                    singleLine = true,
                    visualTransformation = if (oldVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { oldVisible = !oldVisible }) {
                            Icon(if (oldVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, contentDescription = null)
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; errorMessage = null },
                    label = { Text("New Password") },
                    singleLine = true,
                    visualTransformation = if (newVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { newVisible = !newVisible }) {
                            Icon(if (newVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, contentDescription = null)
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; errorMessage = null },
                    label = { Text("Confirm New Password") },
                    singleLine = true,
                    visualTransformation = if (confirmVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { confirmVisible = !confirmVisible }) {
                            Icon(if (confirmVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, contentDescription = null)
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                errorMessage?.let { err ->
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = err,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text("Cancel")
                    }

                    Button(
                        onClick = {
                            if (newPassword.isBlank()) {
                                errorMessage = "Please enter a new password"
                            } else if (newPassword != confirmPassword) {
                                errorMessage = "New passwords do not match"
                            } else if (newPassword.length < 4) {
                                errorMessage = "Password must be at least 4 characters"
                            } else {
                                isSubmitting = true
                                errorMessage = null
                                viewModel.changePassword(oldPassword, newPassword) { success, err ->
                                    isSubmitting = false
                                    if (success) {
                                        onSuccess()
                                    } else {
                                        errorMessage = err ?: "Failed to update password"
                                    }
                                }
                            }
                        },
                        enabled = !isSubmitting && oldPassword.isNotBlank() && newPassword.isNotBlank(),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .weight(1.3f)
                            .height(48.dp)
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Update")
                        }
                    }
                }
            }
        }
    }
}

// ================= UPDATE SECURITY QUESTION DIALOG =================
@Composable
private fun UpdateSecurityQuestionDialog(
    viewModel: MainViewModel,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit
) {
    var question by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    modifier = Modifier.size(54.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.HelpOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "Security Question",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "Used to securely verify your identity if you forget your password.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = question,
                    onValueChange = { question = it; errorMessage = null },
                    label = { Text("Security Question") },
                    placeholder = { Text("e.g. What was your first pet's name?") },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = answer,
                    onValueChange = { answer = it; errorMessage = null },
                    label = { Text("Answer") },
                    placeholder = { Text("Your private answer") },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                errorMessage?.let { err ->
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = err,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text("Cancel")
                    }

                    Button(
                        onClick = {
                            if (question.isBlank() || answer.isBlank()) {
                                errorMessage = "Please fill in both question and answer"
                            } else {
                                isSubmitting = true
                                errorMessage = null
                                viewModel.updateSecurityQuestion(question.trim(), answer.trim()) { success, err ->
                                    isSubmitting = false
                                    if (success) {
                                        onSuccess()
                                    } else {
                                        errorMessage = err ?: "Failed to update security question"
                                    }
                                }
                            }
                        },
                        enabled = !isSubmitting && question.isNotBlank() && answer.isNotBlank(),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .weight(1.3f)
                            .height(48.dp)
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Save")
                        }
                    }
                }
            }
        }
    }
}

// ================= PROFILE AVATAR IMAGE =================
@Composable
private fun ProfileAvatarImage(
    pictureUrl: String?,
    displayName: String,
    size: Dp = 64.dp,
    serverOrigin: String = "",
    modifier: Modifier = Modifier
) {
    var bitmap by remember(pictureUrl, serverOrigin) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(pictureUrl, serverOrigin) {
        if (!pictureUrl.isNullOrBlank()) {
            withContext(Dispatchers.IO) {
                try {
                    val resolvedUrl = when {
                        pictureUrl.startsWith("http://") || pictureUrl.startsWith("https://") -> pictureUrl
                        pictureUrl.startsWith("/") -> "${serverOrigin.trimEnd('/')}$pictureUrl"
                        pictureUrl.startsWith("data:image") -> null
                        serverOrigin.isNotBlank() -> "${serverOrigin.trimEnd('/')}/$pictureUrl"
                        else -> null
                    }

                    if (resolvedUrl != null) {
                        val url = URL(resolvedUrl)
                        val connection = url.openConnection() as HttpURLConnection
                        connection.doInput = true
                        connection.connectTimeout = 5000
                        connection.readTimeout = 5000
                        connection.connect()
                        val input = connection.inputStream
                        val bmp = BitmapFactory.decodeStream(input)
                        bmp?.let { bitmap = it.asImageBitmap() }
                    } else if (pictureUrl.startsWith("data:image") && pictureUrl.contains(",")) {
                        val base64Data = pictureUrl.substringAfter(",")
                        val decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                        val bmp = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                        bmp?.let { bitmap = it.asImageBitmap() }
                    }
                } catch (_: Exception) {}
            }
        }
    }

    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
        border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)),
        modifier = modifier.size(size)
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap!!,
                    contentDescription = displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Text(
                    text = displayName.take(1).uppercase().ifEmpty { "U" },
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = (size.value * 0.40).sp,
                        fontWeight = FontWeight.Bold
                    ),
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
    }
}

// ================= DEVICE ROW =================
@Composable
private fun DeviceRow(device: DeviceItem, onLogout: () -> Unit) {
    val isOnline = device.isCurrent || (System.currentTimeMillis() - parseDateToMillis(device.lastActive) < 120000)

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        ListItem(
            headlineContent = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(device.name, fontWeight = FontWeight.Bold)
                    if (device.isCurrent) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                "This Device",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            },
            supportingContent = {
                if (isOnline) {
                    Text("Online Now", color = Color(0xFF2E7D32), fontWeight = FontWeight.Medium)
                } else {
                    Text("Last active: ${formatDeviceDate(device.lastActive)}", style = MaterialTheme.typography.bodySmall)
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
                                .background(Color(0xFF2E7D32))
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

private fun formatDeviceDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return "Unknown"
    try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val date = parser.parse(dateString) ?: return "Unknown"
        val formatter = SimpleDateFormat("d MMM yyyy 'at' hh:mm a", Locale.US)
        return formatter.format(date)
    } catch (e: Exception) {
        return "Unknown"
    }
}

private fun parseDateToMillis(dateString: String?): Long {
    if (dateString.isNullOrEmpty()) return 0L
    try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        return parser.parse(dateString)?.time ?: 0L
    } catch (e: Exception) {
        return 0L
    }
}
