package com.example.macosbusinesssuite.ui.screens.auth

import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
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
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.fragment.app.FragmentActivity
import com.example.macosbusinesssuite.R
import com.example.macosbusinesssuite.data.model.AuthChallengeResponse
import com.example.macosbusinesssuite.data.model.RememberedUser
import com.example.macosbusinesssuite.data.model.UserProfile
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import com.example.macosbusinesssuite.util.BiometricAuthHelper
import com.example.macosbusinesssuite.util.GoogleAuthHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private enum class LoginFlowState {
    ACTIVE_USER_LOGIN,
    GENERIC_LOGIN,
    FORGOT_PASSWORD_IDENTIFIER,
    FORGOT_PASSWORD_ANSWER,
    FORGOT_PASSWORD_RESET
}

private enum class PostLoginModalType {
    NONE,
    REMEMBER_ACCOUNT_PROMPT,
    REMEMBER_ACCOUNT_WARNING,
    REMEMBER_ACCOUNT_DISMISS,
    BIOMETRIC_SETUP_PROMPT,
    BIOMETRIC_SETUP_DISMISS,
    BIOMETRIC_SETUP_FAILED,
    BIOMETRIC_INFO_POPUP,
    WORKER_LOCAL_CREDENTIALS,
    WORKER_SECURITY_QUESTION,
    WORKER_DISMISS_CONFIRMATION
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: MainViewModel,
    onLoginSuccess: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val googleAuthHelper = remember { GoogleAuthHelper(context) }

    val rememberedUsers by viewModel.rememberedUsers.collectAsState()
    val activeUser by viewModel.activeUser.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    // Screen navigation state
    var currentFlowState by remember {
        mutableStateOf(
            if (rememberedUsers.isNotEmpty()) LoginFlowState.ACTIVE_USER_LOGIN else LoginFlowState.GENERIC_LOGIN
        )
    }

    // Input fields
    var identifierInput by remember { mutableStateOf(activeUser?.identifier ?: "") }
    var passwordInput by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var keepLoggedIn by remember { mutableStateOf(true) }

    // Shake error animation state (strictly returns to 0f)
    val shakeOffset = remember { Animatable(0f) }
    fun triggerShake() {
        coroutineScope.launch {
            shakeOffset.snapTo(0f)
            val deltas = listOf(-12f, 12f, -8f, 8f, -4f, 4f, 0f)
            for (dx in deltas) {
                shakeOffset.animateTo(
                    targetValue = dx,
                    animationSpec = tween(durationMillis = 35, easing = LinearEasing)
                )
            }
        }
    }

    // Account Switcher Bottom Sheet State
    var showAccountSwitcherSheet by remember { mutableStateOf(false) }

    // Forgot Password flow states
    var challengeResponse by remember { mutableStateOf<AuthChallengeResponse?>(null) }
    var recoveryIdentifier by remember { mutableStateOf("") }
    var securityAnswerInput by remember { mutableStateOf("") }
    var newPasswordInput by remember { mutableStateOf("") }
    var confirmPasswordInput by remember { mutableStateOf("") }
    var newPasswordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }
    var recoveryStatusMessage by remember { mutableStateOf<String?>(null) }

    // Post-login Onboarding Sheets State
    var activePostLoginModal by remember { mutableStateOf(PostLoginModalType.NONE) }
    var postLoginIdentifier by remember { mutableStateOf("") }
    var postLoginProfile by remember { mutableStateOf<UserProfile?>(null) }
    var biometricFailedErrorMessage by remember { mutableStateOf("Biometric setup could not be completed.") }

    // Worker account creation state
    var workerIdentifierType by remember { mutableStateOf("email") }
    var workerIdentifierInput by remember { mutableStateOf("") }
    var workerPasswordInput by remember { mutableStateOf("") }
    var workerConfirmPasswordInput by remember { mutableStateOf("") }
    var workerSecurityQuestion by remember { mutableStateOf("") }
    var workerSecurityAnswer by remember { mutableStateOf("") }

    // Pending Worker state
    var isPendingApproval by remember { mutableStateOf(false) }
    var pendingInviteCode by remember { mutableStateOf("") }
    var pendingWorkerName by remember { mutableStateOf("") }

    // Account removal dialog state
    var userPendingRemoval by remember { mutableStateOf<RememberedUser?>(null) }

    // Sync input when active user changes
    LaunchedEffect(activeUser) {
        if (activeUser != null) {
            identifierInput = activeUser!!.identifier
        }
    }

    // Auto-poll approval status when pending
    LaunchedEffect(isPendingApproval, pendingInviteCode) {
        if (isPendingApproval && pendingInviteCode.isNotEmpty()) {
            while (isPendingApproval) {
                delay(4000)
                viewModel.checkWorkerStatus(pendingInviteCode, null) { approved, _ ->
                    if (approved) {
                        isPendingApproval = false
                        pendingInviteCode = ""
                        onLoginSuccess()
                    }
                }
            }
        }
    }

    // Biometric Authentication
    fun triggerBiometricPrompt(targetUser: RememberedUser) {
        val activity = context as? FragmentActivity ?: return
        val bioStatus = BiometricAuthHelper.checkBiometricAvailability(context)
        if (bioStatus != BiometricAuthHelper.BiometricStatus.AVAILABLE) return

        BiometricAuthHelper.authenticate(
            activity = activity,
            title = "Unlock MacOS Suite",
            subtitle = "Confirm biometric authentication for ${targetUser.displayName}",
            onSuccess = {
                viewModel.loginWithBiometrics(targetUser) { success, _ ->
                    if (success) {
                        onLoginSuccess()
                    }
                }
            },
            onError = { _, _ -> },
            onFailed = { }
        )
    }

    // Post-Login Biometric & Onboarding Routing
    fun proceedToBiometricOrSuccess() {
        val email = postLoginProfile?.email ?: postLoginProfile?.actualEmail
        val isBioDismissed = viewModel.multiUserManager.isPromptDismissed("biometric", postLoginIdentifier) ||
                (!email.isNullOrBlank() && viewModel.multiUserManager.isPromptDismissed("biometric", email))
        val bioStatus = BiometricAuthHelper.checkBiometricAvailability(context)

        val rememberedUser = viewModel.multiUserManager.getUsers().find {
            it.identifier.equals(postLoginIdentifier, ignoreCase = true) ||
            (postLoginProfile?.id != null && it.id == postLoginProfile!!.id) ||
            (!email.isNullOrBlank() && it.identifier.equals(email, ignoreCase = true))
        }

        val isBiometricEnabled = rememberedUser?.isBiometricEnabled == true
        val canShowBiometric = !isBiometricEnabled && !isBioDismissed &&
                (bioStatus == BiometricAuthHelper.BiometricStatus.AVAILABLE || bioStatus == BiometricAuthHelper.BiometricStatus.NOT_ENROLLED)

        if (canShowBiometric) {
            activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_PROMPT
        } else {
            activePostLoginModal = PostLoginModalType.NONE
            onLoginSuccess()
        }
    }

    // Post-Login Onboarding Routing
    fun handlePostLoginOnboarding(identifier: String, profile: UserProfile?, isPasswordLogin: Boolean = false) {
        postLoginIdentifier = identifier
        postLoginProfile = profile

        val email = profile?.email ?: profile?.actualEmail
        val isRemembered = viewModel.multiUserManager.isUserRemembered(identifier, profile?.id)
        val isRememberDismissed = viewModel.multiUserManager.isPromptDismissed("remember", identifier)
        val isBioDismissed = viewModel.multiUserManager.isPromptDismissed("biometric", identifier) ||
                (!email.isNullOrBlank() && viewModel.multiUserManager.isPromptDismissed("biometric", email))
        val bioStatus = BiometricAuthHelper.checkBiometricAvailability(context)

        val hasLocalAccount = isPasswordLogin || (profile?.isLocalPasswordConfigured == true)
        val isWorkerPasswordDismissed = viewModel.multiUserManager.isPromptDismissed("worker_password", identifier) ||
                (!email.isNullOrBlank() && viewModel.multiUserManager.isPromptDismissed("worker_password", email))

        if (profile?.role == "worker" && !hasLocalAccount && !isWorkerPasswordDismissed) {
            workerIdentifierInput = email ?: identifier
            activePostLoginModal = PostLoginModalType.WORKER_LOCAL_CREDENTIALS
            return
        }

        // Find remembered user by any matching criteria
        val rememberedUser = viewModel.multiUserManager.getUsers().find {
            it.identifier.equals(identifier, ignoreCase = true) ||
            (profile?.id != null && it.id == profile.id) ||
            (profile?.actualEmail != null && it.identifier.equals(profile.actualEmail, ignoreCase = true)) ||
            (profile?.email != null && it.identifier.equals(profile.email, ignoreCase = true))
        }

        val isBiometricEnabled = rememberedUser?.isBiometricEnabled == true
        val canShowBiometric = !isBiometricEnabled && !isBioDismissed &&
                (bioStatus == BiometricAuthHelper.BiometricStatus.AVAILABLE || bioStatus == BiometricAuthHelper.BiometricStatus.NOT_ENROLLED)

        if (canShowBiometric) {
            activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_PROMPT
        } else if (!isRemembered && !keepLoggedIn && !isRememberDismissed) {
            activePostLoginModal = PostLoginModalType.REMEMBER_ACCOUNT_PROMPT
        } else {
            onLoginSuccess()
        }
    }

    // Google Sign In Handler
    fun handleGoogleSignIn() {
        coroutineScope.launch {
            viewModel.setErrorMessage(null)
            val result = googleAuthHelper.signInWithGoogle()
            result.onSuccess { credential ->
                viewModel.googleWorkerLogin(credential.idToken) { success, msg, body ->
                    if (success && body != null) {
                        val userObj = body["user"] as? Map<*, *>
                        val email = userObj?.get("email") as? String ?: credential.id
                        val role = body["role"] as? String ?: "worker"
                        val id = userObj?.get("id") as? String ?: credential.id
                        val name = userObj?.get("name") as? String ?: "Google User"
                        val picture = userObj?.get("picture") as? String
                        val hasLocalPassword = (userObj?.get("hasLocalPassword") as? Boolean)
                            ?: (userObj?.get("has_local_password") as? Boolean)
                            ?: false

                        val userProfile = UserProfile(
                            id = id,
                            email = email,
                            username = name,
                            avatar = picture,
                            role = role,
                            hasLocalPassword = hasLocalPassword
                        )
                        if (keepLoggedIn) {
                            viewModel.saveRememberedProfile(
                                identifier = email,
                                displayName = name,
                                displayPicture = picture,
                                role = role,
                                isBiometricEnabled = false
                            )
                        }
                        handlePostLoginOnboarding(email, userProfile, isPasswordLogin = false)
                    } else {
                        triggerShake()
                        if (!msg.isNullOrBlank()) {
                            viewModel.setErrorMessage(msg)
                        }
                    }
                }
            }.onFailure { exception ->
                if (exception !is GetCredentialCancellationException) {
                    val errMsg = exception.localizedMessage ?: "Google Sign-In failed"
                    viewModel.setErrorMessage("Google Sign-In error: $errMsg")
                    triggerShake()
                }
            }
        }
    }

    // Resolve base server origin to load backend media & profile pictures
    val serverOrigin = remember(viewModel.sessionManager.serverUrl) {
        val url = viewModel.sessionManager.serverUrl.trimEnd('/')
        if (url.endsWith("/api")) {
            url.removeSuffix("/api")
        } else {
            url
        }
    }

    // Active Living Material 3 Gradient with Fluid Lissajous Aurora Movement
    val isDark = isSystemInDarkTheme()
    val colorScheme = MaterialTheme.colorScheme

    val infiniteTransition = rememberInfiniteTransition(label = "LivingAuroraGradient")
    val phase1 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 8000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase1"
    )
    val phase2 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 12500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase2"
    )
    val phase3 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 16000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase3"
    )

    // Handle Back Press when in Forgot Password or Generic Login with remembered users
    BackHandler(enabled = currentFlowState != LoginFlowState.ACTIVE_USER_LOGIN && rememberedUsers.isNotEmpty()) {
        currentFlowState = LoginFlowState.ACTIVE_USER_LOGIN
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawBehind {
                // Base background surface color
                drawRect(if (isDark) colorScheme.surfaceContainerLowest else colorScheme.surface)

                // Living Aurora Orb 1 (Primary - dynamic organic orbit)
                val cx1 = size.width * (0.35f + 0.30f * kotlin.math.sin(phase1))
                val cy1 = size.height * (0.28f + 0.22f * kotlin.math.cos(phase1 * 0.85f))
                val r1 = size.width * (0.68f + 0.12f * kotlin.math.sin(phase2))
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            colorScheme.primary.copy(alpha = if (isDark) 0.38f else 0.45f),
                            Color.Transparent
                        ),
                        center = Offset(cx1, cy1),
                        radius = r1
                    ),
                    center = Offset(cx1, cy1),
                    radius = r1
                )

                // Living Aurora Orb 2 (Tertiary - complementary floating wave)
                val cx2 = size.width * (0.68f + 0.26f * kotlin.math.cos(phase2))
                val cy2 = size.height * (0.42f + 0.25f * kotlin.math.sin(phase2 * 0.9f))
                val r2 = size.width * (0.72f + 0.14f * kotlin.math.cos(phase3))
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            colorScheme.tertiary.copy(alpha = if (isDark) 0.28f else 0.36f),
                            Color.Transparent
                        ),
                        center = Offset(cx2, cy2),
                        radius = r2
                    ),
                    center = Offset(cx2, cy2),
                    radius = r2
                )

                // Living Aurora Orb 3 (SecondaryContainer - soft electric ambient glow)
                val cx3 = size.width * (0.45f + 0.32f * kotlin.math.sin(phase3))
                val cy3 = size.height * (0.70f + 0.20f * kotlin.math.sin(phase1 * 1.25f))
                val r3 = size.width * (0.60f + 0.10f * kotlin.math.sin(phase1))
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            colorScheme.secondaryContainer.copy(alpha = if (isDark) 0.32f else 0.42f),
                            Color.Transparent
                        ),
                        center = Offset(cx3, cy3),
                        radius = r3
                    ),
                    center = Offset(cx3, cy3),
                    radius = r3
                )

                // Atmospheric vertical gradient blend towards bottom
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            (if (isDark) colorScheme.surfaceContainerLowest else colorScheme.surface).copy(alpha = if (isDark) 0.55f else 0.35f)
                        )
                    )
                )
            }
    ) {
        if (isPendingApproval) {
            // ================= PENDING APPROVAL UI =================
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing),
                contentAlignment = Alignment.Center
            ) {
                PendingApprovalView(
                    pendingWorkerName = pendingWorkerName,
                    pendingInviteCode = pendingInviteCode,
                    onBack = {
                        isPendingApproval = false
                        pendingInviteCode = ""
                    }
                )
            }
        } else {
            // ================= BOTTOM CARD LAYOUT =================
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Top Spacious Area: shows the vibrant gradient background
                Spacer(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                )

                // Bottom-anchored Expanding Card
                Surface(
                    shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp, bottomStart = 0.dp, bottomEnd = 0.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = if (isDark) 0.94f else 0.98f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    shadowElevation = if (isDark) 8.dp else 14.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset(x = shakeOffset.value.dp)
                        .animateContentSize(
                            animationSpec = spring(
                                dampingRatio = Spring.DampingRatioLowBouncy,
                                stiffness = Spring.StiffnessMedium
                            )
                        )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(horizontal = 24.dp)
                            .padding(top = 22.dp, bottom = 20.dp)
                            .verticalScroll(rememberScrollState()),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Form Content
                        AnimatedContent(
                            targetState = currentFlowState,
                            transitionSpec = {
                                (fadeIn(animationSpec = tween(260)) + slideInVertically { it / 8 })
                                    .togetherWith(fadeOut(animationSpec = tween(180)) + slideOutVertically { -it / 8 })
                            },
                            label = "AuthFlowStateTransition",
                            modifier = Modifier.fillMaxWidth()
                        ) { state ->
                            when (state) {
                                LoginFlowState.ACTIVE_USER_LOGIN -> {
                                    val user = activeUser ?: rememberedUsers.firstOrNull()
                                    if (user != null) {
                                        ActiveUserLoginForm(
                                            user = user,
                                            password = passwordInput,
                                            onPasswordChange = { passwordInput = it },
                                            passwordVisible = passwordVisible,
                                            onTogglePasswordVisibility = { passwordVisible = !passwordVisible },
                                            keepLoggedIn = keepLoggedIn,
                                            onKeepLoggedInChange = { keepLoggedIn = it },
                                            isLoading = isLoading,
                                            errorMessage = errorMessage,
                                            onSubmit = {
                                                if (passwordInput.isNotBlank()) {
                                                    viewModel.login(user.identifier, passwordInput, keepLoggedIn = keepLoggedIn) { success, _, profile ->
                                                        if (success) {
                                                            handlePostLoginOnboarding(user.identifier, profile, isPasswordLogin = true)
                                                        } else {
                                                            triggerShake()
                                                            passwordInput = ""
                                                        }
                                                    }
                                                }
                                            },
                                            onBiometricClick = { triggerBiometricPrompt(user) },
                                            onAddNewAccount = {
                                                identifierInput = ""
                                                passwordInput = ""
                                                currentFlowState = LoginFlowState.GENERIC_LOGIN
                                            },
                                            onSwitchAccount = {
                                                showAccountSwitcherSheet = true
                                            },
                                            onSignOut = {
                                                viewModel.removeRememberedUser(user.id)
                                                identifierInput = ""
                                                passwordInput = ""
                                                currentFlowState = LoginFlowState.GENERIC_LOGIN
                                            },
                                            onForgotPassword = {
                                                recoveryIdentifier = user.identifier
                                                currentFlowState = LoginFlowState.FORGOT_PASSWORD_IDENTIFIER
                                            },
                                            onGoogleSignIn = { handleGoogleSignIn() },
                                            rememberedUsers = rememberedUsers,
                                            serverOrigin = serverOrigin
                                        )
                                    } else {
                                        GenericLoginForm(
                                            identifier = identifierInput,
                                            onIdentifierChange = { identifierInput = it },
                                            password = passwordInput,
                                            onPasswordChange = { passwordInput = it },
                                            passwordVisible = passwordVisible,
                                            onTogglePasswordVisibility = { passwordVisible = !passwordVisible },
                                            keepLoggedIn = keepLoggedIn,
                                            onKeepLoggedInChange = { keepLoggedIn = it },
                                            isLoading = isLoading,
                                            errorMessage = errorMessage,
                                            onSubmit = {
                                                if (identifierInput.isNotBlank() && passwordInput.isNotBlank()) {
                                                    viewModel.login(identifierInput, passwordInput, keepLoggedIn = keepLoggedIn) { success, _, profile ->
                                                        if (success) {
                                                            handlePostLoginOnboarding(identifierInput, profile, isPasswordLogin = true)
                                                        } else {
                                                            triggerShake()
                                                        }
                                                    }
                                                }
                                            },
                                            onForgotPassword = {
                                                recoveryIdentifier = identifierInput
                                                currentFlowState = LoginFlowState.FORGOT_PASSWORD_IDENTIFIER
                                            },
                                            onAddNewAccount = {
                                                identifierInput = ""
                                                passwordInput = ""
                                            },
                                            onSwitchAccount = {
                                                showAccountSwitcherSheet = true
                                            },
                                            onSignOut = {
                                                rememberedUsers.firstOrNull()?.let { u ->
                                                    viewModel.removeRememberedUser(u.id)
                                                }
                                                identifierInput = ""
                                                passwordInput = ""
                                            },
                                            onGoogleSignIn = { handleGoogleSignIn() },
                                            rememberedUsers = rememberedUsers,
                                            serverOrigin = serverOrigin
                                        )
                                    }
                                }

                                LoginFlowState.GENERIC_LOGIN -> {
                                    GenericLoginForm(
                                        identifier = identifierInput,
                                        onIdentifierChange = { identifierInput = it },
                                        password = passwordInput,
                                        onPasswordChange = { passwordInput = it },
                                        passwordVisible = passwordVisible,
                                        onTogglePasswordVisibility = { passwordVisible = !passwordVisible },
                                        keepLoggedIn = keepLoggedIn,
                                        onKeepLoggedInChange = { keepLoggedIn = it },
                                        isLoading = isLoading,
                                        errorMessage = errorMessage,
                                        onSubmit = {
                                            if (identifierInput.isNotBlank() && passwordInput.isNotBlank()) {
                                                viewModel.login(identifierInput, passwordInput, keepLoggedIn = keepLoggedIn) { success, _, profile ->
                                                    if (success) {
                                                        handlePostLoginOnboarding(identifierInput, profile, isPasswordLogin = true)
                                                    } else {
                                                        triggerShake()
                                                    }
                                                }
                                            }
                                        },
                                        onForgotPassword = {
                                            recoveryIdentifier = identifierInput
                                            currentFlowState = LoginFlowState.FORGOT_PASSWORD_IDENTIFIER
                                        },
                                        onAddNewAccount = {
                                            identifierInput = ""
                                            passwordInput = ""
                                        },
                                        onSwitchAccount = {
                                            showAccountSwitcherSheet = true
                                        },
                                        onSignOut = {
                                            rememberedUsers.firstOrNull()?.let { u ->
                                                viewModel.removeRememberedUser(u.id)
                                            }
                                            identifierInput = ""
                                            passwordInput = ""
                                        },
                                        isGenericLogin = true,
                                        onBack = {
                                            currentFlowState = LoginFlowState.ACTIVE_USER_LOGIN
                                        },
                                        onGoogleSignIn = { handleGoogleSignIn() },
                                        rememberedUsers = rememberedUsers,
                                        serverOrigin = serverOrigin
                                    )
                                }

                                LoginFlowState.FORGOT_PASSWORD_IDENTIFIER -> {
                                    ForgotPasswordIdentifierView(
                                        identifier = recoveryIdentifier,
                                        onIdentifierChange = { recoveryIdentifier = it },
                                        isLoading = isLoading,
                                        errorMessage = recoveryStatusMessage,
                                        onContinue = {
                                            if (recoveryIdentifier.isNotBlank()) {
                                                recoveryStatusMessage = null
                                                viewModel.fetchSecurityChallenge(recoveryIdentifier) { success, challenge, error ->
                                                    if (success && challenge != null) {
                                                        challengeResponse = challenge
                                                        securityAnswerInput = ""
                                                        currentFlowState = LoginFlowState.FORGOT_PASSWORD_ANSWER
                                                    } else {
                                                        recoveryStatusMessage = error ?: "Account not found"
                                                    }
                                                }
                                            }
                                        },
                                        onCancel = {
                                            recoveryStatusMessage = null
                                            currentFlowState = if (rememberedUsers.isNotEmpty()) LoginFlowState.ACTIVE_USER_LOGIN else LoginFlowState.GENERIC_LOGIN
                                        }
                                    )
                                }

                                LoginFlowState.FORGOT_PASSWORD_ANSWER -> {
                                    ForgotPasswordAnswerView(
                                        identifier = recoveryIdentifier,
                                        question = challengeResponse?.question ?: "Enter your emergency recovery key",
                                        isRecoveryKey = challengeResponse?.isRecoveryKey == true,
                                        answer = securityAnswerInput,
                                        onAnswerChange = { securityAnswerInput = it },
                                        isLoading = isLoading,
                                        errorMessage = recoveryStatusMessage,
                                        onVerify = {
                                            if (securityAnswerInput.isNotBlank()) {
                                                recoveryStatusMessage = null
                                                viewModel.verifySecurityAnswer(recoveryIdentifier, securityAnswerInput) { success, err ->
                                                    if (success) {
                                                        newPasswordInput = ""
                                                        confirmPasswordInput = ""
                                                        currentFlowState = LoginFlowState.FORGOT_PASSWORD_RESET
                                                    } else {
                                                        recoveryStatusMessage = err ?: "Incorrect answer"
                                                    }
                                                }
                                            }
                                        },
                                        onCancel = {
                                            recoveryStatusMessage = null
                                            currentFlowState = if (rememberedUsers.isNotEmpty()) LoginFlowState.ACTIVE_USER_LOGIN else LoginFlowState.GENERIC_LOGIN
                                        }
                                    )
                                }

                                LoginFlowState.FORGOT_PASSWORD_RESET -> {
                                    ForgotPasswordResetView(
                                        newPassword = newPasswordInput,
                                        onNewPasswordChange = { newPasswordInput = it },
                                        confirmPassword = confirmPasswordInput,
                                        onConfirmPasswordChange = { confirmPasswordInput = it },
                                        newPasswordVisible = newPasswordVisible,
                                        onToggleNewVisibility = { newPasswordVisible = !newPasswordVisible },
                                        confirmPasswordVisible = confirmPasswordVisible,
                                        onToggleConfirmVisibility = { confirmPasswordVisible = !confirmPasswordVisible },
                                        isLoading = isLoading,
                                        errorMessage = recoveryStatusMessage,
                                        onSaveAndSignIn = {
                                            if (newPasswordInput.isBlank()) {
                                                recoveryStatusMessage = "Please enter a new password"
                                            } else if (newPasswordInput != confirmPasswordInput) {
                                                recoveryStatusMessage = "Passwords do not match"
                                            } else {
                                                recoveryStatusMessage = null
                                                viewModel.resetPassword(newPasswordInput, recoveryIdentifier) { success, err ->
                                                    if (success) {
                                                        identifierInput = recoveryIdentifier
                                                        passwordInput = newPasswordInput
                                                        currentFlowState = LoginFlowState.GENERIC_LOGIN
                                                    } else {
                                                        recoveryStatusMessage = err ?: "Failed to update password"
                                                    }
                                                }
                                            }
                                        },
                                        onCancel = {
                                            recoveryStatusMessage = null
                                            currentFlowState = if (rememberedUsers.isNotEmpty()) LoginFlowState.ACTIVE_USER_LOGIN else LoginFlowState.GENERIC_LOGIN
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // ================= MATERIAL 3 EXPRESSIVE MODALS & SHEETS =================

        if (activePostLoginModal == PostLoginModalType.REMEMBER_ACCOUNT_PROMPT) {
            RememberAccountPromptDialog(
                onRemember = { activePostLoginModal = PostLoginModalType.REMEMBER_ACCOUNT_WARNING },
                onNotNow = { activePostLoginModal = PostLoginModalType.REMEMBER_ACCOUNT_DISMISS }
            )
        }

        if (activePostLoginModal == PostLoginModalType.REMEMBER_ACCOUNT_WARNING) {
            PublicDeviceWarningDialog(
                onConfirm = {
                    viewModel.saveRememberedProfile(
                        identifier = postLoginIdentifier,
                        displayName = postLoginProfile?.username,
                        displayPicture = postLoginProfile?.avatar,
                        role = postLoginProfile?.role,
                        isBiometricEnabled = false
                    )
                    val bioStatus = BiometricAuthHelper.checkBiometricAvailability(context)
                    val isBioDismissed = viewModel.multiUserManager.isPromptDismissed("biometric", postLoginIdentifier)
                    if (bioStatus == BiometricAuthHelper.BiometricStatus.AVAILABLE && !isBioDismissed) {
                        activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_PROMPT
                    } else {
                        activePostLoginModal = PostLoginModalType.NONE
                        onLoginSuccess()
                    }
                },
                onCancel = { activePostLoginModal = PostLoginModalType.REMEMBER_ACCOUNT_PROMPT }
            )
        }

        if (activePostLoginModal == PostLoginModalType.REMEMBER_ACCOUNT_DISMISS) {
            RememberAccountDismissDialog(
                onDontAskAgain = {
                    viewModel.multiUserManager.setPromptDismissed("remember", postLoginIdentifier, true)
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                },
                onContinueJustNow = {
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                },
                onClose = { activePostLoginModal = PostLoginModalType.REMEMBER_ACCOUNT_PROMPT }
            )
        }

        if (activePostLoginModal == PostLoginModalType.BIOMETRIC_SETUP_PROMPT) {
            BiometricSetupPromptDialog(
                onSetUp = {
                    val activity = context as? FragmentActivity
                    if (activity != null) {
                        BiometricAuthHelper.authenticate(
                            activity = activity,
                            title = "Set Up Biometric Sign In",
                            subtitle = "Confirm fingerprint or face to enable fast login",
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
                                ) { _, _ -> }

                                viewModel.saveRememberedProfile(
                                    identifier = postLoginIdentifier,
                                    displayName = postLoginProfile?.username,
                                    displayPicture = postLoginProfile?.avatar,
                                    role = postLoginProfile?.role,
                                    isBiometricEnabled = true
                                )
                                viewModel.setBiometricEnabled(true)
                                activePostLoginModal = PostLoginModalType.NONE
                                onLoginSuccess()
                            },
                            onError = { errorCode, errString ->
                                if (errorCode != androidx.biometric.BiometricPrompt.ERROR_USER_CANCELED &&
                                    errorCode != androidx.biometric.BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                                    biometricFailedErrorMessage = errString
                                    activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_FAILED
                                } else {
                                    activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_DISMISS
                                }
                            },
                            onFailed = {
                                biometricFailedErrorMessage = "Biometric recognition failed. Please try again."
                                activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_FAILED
                            }
                        )
                    } else {
                        activePostLoginModal = PostLoginModalType.NONE
                        onLoginSuccess()
                    }
                },
                onNotNow = { dontAskAgain ->
                    if (dontAskAgain) {
                        viewModel.multiUserManager.setPromptDismissed("biometric", postLoginIdentifier, true)
                        activePostLoginModal = PostLoginModalType.BIOMETRIC_INFO_POPUP
                    } else {
                        activePostLoginModal = PostLoginModalType.NONE
                        onLoginSuccess()
                    }
                }
            )
        }

        if (activePostLoginModal == PostLoginModalType.BIOMETRIC_INFO_POPUP) {
            BiometricNoticeDialog(
                onConfirm = {
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                }
            )
        }

        if (activePostLoginModal == PostLoginModalType.BIOMETRIC_SETUP_DISMISS) {
            BiometricSetupDismissDialog(
                onDontAskAgain = {
                    viewModel.multiUserManager.setPromptDismissed("biometric", postLoginIdentifier, true)
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                },
                onContinue = {
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                },
                onClose = { activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_PROMPT }
            )
        }

        if (activePostLoginModal == PostLoginModalType.BIOMETRIC_SETUP_FAILED) {
            BiometricSetupFailedDialog(
                errorMessage = biometricFailedErrorMessage,
                onRetry = { activePostLoginModal = PostLoginModalType.BIOMETRIC_SETUP_PROMPT },
                onContinueWithPassword = {
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                },
                onDontShowAgain = {
                    viewModel.multiUserManager.setPromptDismissed("biometric", postLoginIdentifier, true)
                    activePostLoginModal = PostLoginModalType.NONE
                    onLoginSuccess()
                }
            )
        }

        if (activePostLoginModal == PostLoginModalType.WORKER_LOCAL_CREDENTIALS) {
            WorkerCredentialDialog(
                identifier = workerIdentifierInput,
                onIdentifierChange = { workerIdentifierInput = it },
                identifierType = workerIdentifierType,
                onIdentifierTypeChange = { workerIdentifierType = it },
                password = workerPasswordInput,
                onPasswordChange = { workerPasswordInput = it },
                confirmPassword = workerConfirmPasswordInput,
                onConfirmPasswordChange = { workerConfirmPasswordInput = it },
                onContinue = { activePostLoginModal = PostLoginModalType.WORKER_SECURITY_QUESTION },
                onSkip = { activePostLoginModal = PostLoginModalType.WORKER_DISMISS_CONFIRMATION }
            )
        }

        if (activePostLoginModal == PostLoginModalType.WORKER_SECURITY_QUESTION) {
            WorkerSecurityQuestionDialog(
                question = workerSecurityQuestion,
                onQuestionChange = { workerSecurityQuestion = it },
                answer = workerSecurityAnswer,
                onAnswerChange = { workerSecurityAnswer = it },
                isLoading = isLoading,
                onSave = {
                    viewModel.updateWorkerCredentials(
                        identifier = workerIdentifierInput,
                        isEmail = workerIdentifierType == "email",
                        password = workerPasswordInput,
                        question = workerSecurityQuestion,
                        answer = workerSecurityAnswer
                    ) { success, _ ->
                        if (success) {
                            proceedToBiometricOrSuccess()
                        }
                    }
                },
                onBack = { activePostLoginModal = PostLoginModalType.WORKER_LOCAL_CREDENTIALS }
            )
        }

        if (activePostLoginModal == PostLoginModalType.WORKER_DISMISS_CONFIRMATION) {
            WorkerDismissDialog(
                onDontAskAgain = {
                    viewModel.multiUserManager.setPromptDismissed("worker_password", postLoginIdentifier, true)
                    activePostLoginModal = PostLoginModalType.NONE
                    proceedToBiometricOrSuccess()
                },
                onJustThisTime = {
                    activePostLoginModal = PostLoginModalType.NONE
                    proceedToBiometricOrSuccess()
                },
                onClose = { activePostLoginModal = PostLoginModalType.WORKER_LOCAL_CREDENTIALS }
            )
        }

        userPendingRemoval?.let { user ->
            AlertDialog(
                onDismissRequest = { userPendingRemoval = null },
                icon = {
                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error
                    )
                },
                title = {
                    Text(
                        text = "Remove Account?",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                },
                text = {
                    Text(
                        text = "This will remove shortcut for \"${user.displayName}\" (${user.identifier}) from this device.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.removeRememberedUser(user.id)
                            userPendingRemoval = null
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Remove")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { userPendingRemoval = null },
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Cancel")
                    }
                },
                shape = RoundedCornerShape(28.dp)
            )
        }

        if (showAccountSwitcherSheet) {
            ModalBottomSheet(
                onDismissRequest = { showAccountSwitcherSheet = false },
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 28.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Switch Account",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        IconButton(onClick = { showAccountSwitcherSheet = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close")
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    rememberedUsers.forEach { user ->
                        val isActive = user.id == activeUser?.id
                        Surface(
                            onClick = {
                                viewModel.selectUser(user)
                                identifierInput = user.identifier
                                passwordInput = ""
                                currentFlowState = LoginFlowState.ACTIVE_USER_LOGIN
                                showAccountSwitcherSheet = false
                            },
                            shape = RoundedCornerShape(18.dp),
                            color = if (isActive) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceContainer,
                            border = BorderStroke(
                                1.dp,
                                if (isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                UserAvatarImage(
                                    pictureUrl = user.displayPicture,
                                    displayName = user.displayName,
                                    size = 42.dp,
                                    serverOrigin = serverOrigin
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = user.displayName,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    val isAdmin = (user.role.equals("owner", ignoreCase = true) || user.role.equals("admin", ignoreCase = true)) &&
                                        (user.displayName.contains("faizal", ignoreCase = true) || user.identifier.contains("faizal", ignoreCase = true) || user.identifier.contains("fazztronic", ignoreCase = true))
                                    val subtitleText = if (isAdmin) "${user.identifier} • Admin" else user.identifier
                                    Text(
                                        text = subtitleText,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                if (isActive) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = "Active",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                } else {
                                    IconButton(
                                        onClick = {
                                            showAccountSwitcherSheet = false
                                            userPendingRemoval = user
                                        },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.DeleteOutline,
                                            contentDescription = "Remove",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    OutlinedButton(
                        onClick = {
                            showAccountSwitcherSheet = false
                            identifierInput = ""
                            passwordInput = ""
                            currentFlowState = LoginFlowState.GENERIC_LOGIN
                        },
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add another account", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

// ================= USER AVATAR COMPOSABLE =================

@Composable
private fun UserAvatarImage(
    pictureUrl: String?,
    displayName: String,
    size: Dp = 56.dp,
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
                        bmp?.let {
                            bitmap = it.asImageBitmap()
                        }
                    } else if (pictureUrl.startsWith("data:image") && pictureUrl.contains(",")) {
                        val base64Data = pictureUrl.substringAfter(",")
                        val decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                        val bmp = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                        bmp?.let {
                            bitmap = it.asImageBitmap()
                        }
                    }
                } catch (_: Exception) {}
            }
        }
    }

    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
        border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
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
                        fontSize = (size.value * 0.42).sp,
                        fontWeight = FontWeight.Bold
                    ),
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
    }
}

// ================= STACKED USER AVATARS WITH ENDLESS PARALLAX =================

@Composable
private fun StackedUserAvatars(
    users: List<RememberedUser>,
    serverOrigin: String = "",
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "StackedAvatarsParallax")
    val parallaxOffset by infiniteTransition.animateFloat(
        initialValue = -3f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "avatarParallaxOffset"
    )

    val displayUsers = users.take(3)
    val totalCount = users.size

    val totalWidth = (28 + (displayUsers.size - 1) * 16 + (if (totalCount > 3) 14 else 0)).dp

    Box(
        modifier = modifier
            .width(totalWidth)
            .height(30.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        // Draw in reverse so index 0 (primary) sits on top (Z-stack)
        displayUsers.indices.reversed().forEach { index ->
            val user = displayUsers[index]
            val isPrimary = index == 0
            val floatDx = if (!isPrimary) (parallaxOffset * (index * 0.75f)).dp else 0.dp
            val baseOffset = (index * 16).dp + floatDx

            Box(
                modifier = Modifier
                    .offset(x = baseOffset)
                    .size(28.dp)
                    .clip(CircleShape)
                    .border(
                        width = if (isPrimary) 1.5.dp else 1.dp,
                        color = if (isPrimary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape
                    )
            ) {
                UserAvatarImage(
                    pictureUrl = user.displayPicture,
                    displayName = user.displayName,
                    size = 28.dp,
                    serverOrigin = serverOrigin
                )

                // Background avatars dimmed/blacked out a bit
                if (!isPrimary) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = if (index == 1) 0.35f else 0.55f))
                    )
                }
            }
        }

        // Endless parallax indicator after 3rd avatar if more than 3 accounts exist
        if (totalCount > 3) {
            val badgeOffset = (displayUsers.size * 16).dp + (parallaxOffset * 1.1f).dp
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                modifier = Modifier
                    .offset(x = badgeOffset)
                    .size(20.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = "+${totalCount - 3}",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
    }
}

// ================= SYMMETRICAL ACCOUNT ACTIONS FOOTER =================

@Composable
private fun SymmetricalAccountActionsFooter(
    onAddNewAccount: () -> Unit,
    onSwitchAccount: () -> Unit,
    onSignOut: () -> Unit,
    rememberedUsers: List<RememberedUser>,
    serverOrigin: String = "",
    isGenericLogin: Boolean = false,
    onBack: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Left: Add New Account (50% space)
        Surface(
            onClick = onAddNewAccount,
            shape = RoundedCornerShape(16.dp),
            color = Color.Transparent,
            modifier = Modifier
                .weight(1f)
                .height(48.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.PersonAdd,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Add new account",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Center: Subtle fading line divider
        Box(
            modifier = Modifier
                .width(1.dp)
                .height(32.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f),
                            Color.Transparent
                        )
                    )
                )
        )

        // Right side: Switch Account (if > 1 accounts) OR Back/Sign out (if == 1 account)
        if (rememberedUsers.size > 1) {
            Surface(
                onClick = onSwitchAccount,
                shape = RoundedCornerShape(16.dp),
                color = Color.Transparent,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.Start,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.weight(1f, fill = false)
                    ) {
                        Text(
                            text = "Switch account",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        val count = rememberedUsers.size - 1
                        Text(
                            text = "+$count Accounts",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }

                    Spacer(modifier = Modifier.width(6.dp))
                    StackedUserAvatars(users = rememberedUsers, serverOrigin = serverOrigin)
                }
            }
        } else if (rememberedUsers.size == 1) {
            if (isGenericLogin && onBack != null) {
                Surface(
                    onClick = onBack,
                    shape = RoundedCornerShape(16.dp),
                    color = Color.Transparent,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Back",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            } else {
                Surface(
                    onClick = onSignOut,
                    shape = RoundedCornerShape(16.dp),
                    color = Color.Transparent,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.Logout,
                            contentDescription = "Sign out",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Sign out",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.error,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

// ================= ACTIVE USER LOGIN FORM =================

@Composable
private fun ActiveUserLoginForm(
    user: RememberedUser,
    password: String,
    onPasswordChange: (String) -> Unit,
    passwordVisible: Boolean,
    onTogglePasswordVisibility: () -> Unit,
    keepLoggedIn: Boolean,
    onKeepLoggedInChange: (Boolean) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onSubmit: () -> Unit,
    onBiometricClick: () -> Unit,
    onAddNewAccount: () -> Unit,
    onSwitchAccount: () -> Unit,
    onSignOut: () -> Unit,
    onForgotPassword: () -> Unit,
    onGoogleSignIn: () -> Unit,
    rememberedUsers: List<RememberedUser>,
    serverOrigin: String = ""
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Active User Header with Avatar & Name (actual name from DB & login email below)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            UserAvatarImage(
                pictureUrl = user.displayPicture,
                displayName = user.displayName,
                size = 54.dp,
                serverOrigin = serverOrigin
            )

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = user.displayName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = user.identifier,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Password row: shortened password field with inner eye circle + separate circular -> button
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = password,
                onValueChange = onPasswordChange,
                label = { Text("Password") },
                placeholder = { Text("Enter password") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
                    )
                },
                trailingIcon = {
                    // Eye button inside its own circular surface
                    Surface(
                        onClick = onTogglePasswordVisibility,
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier
                            .padding(end = 4.dp)
                            .size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (password.isNotBlank() && !isLoading) onSubmit() }),
                shape = RoundedCornerShape(22.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.85f),
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                ),
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 62.dp)
            )

            // Independent circular -> submit button perfectly aligned with password field height
            Surface(
                onClick = onSubmit,
                enabled = password.isNotBlank() && !isLoading,
                shape = CircleShape,
                color = if (password.isNotBlank() && !isLoading) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (password.isNotBlank() && !isLoading) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                shadowElevation = if (password.isNotBlank() && !isLoading) 3.dp else 0.dp,
                modifier = Modifier.size(58.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "Sign In",
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Biometric / Forgot Password Row (Biometrics on left if enabled, empty spacer otherwise; Forgot Password on right)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (user.isBiometricEnabled) {
                TextButton(
                    onClick = onBiometricClick,
                    enabled = !isLoading,
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Fingerprint,
                        contentDescription = "Use Biometrics",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Use Biometrics",
                        fontSize = 12.sp,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            } else {
                Spacer(modifier = Modifier.width(1.dp))
            }

            TextButton(
                onClick = onForgotPassword,
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "Forgot Password?",
                    fontSize = 12.sp,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Native Material 3 Expressive Continue with Google Button
        GoogleSignInButton(
            onClick = onGoogleSignIn,
            isLoading = isLoading
        )

        Spacer(modifier = Modifier.height(14.dp))

        // Symmetrical Footer: Add new account (left) | Switch account (+n Accounts) or Sign out (right)
        SymmetricalAccountActionsFooter(
            onAddNewAccount = onAddNewAccount,
            onSwitchAccount = onSwitchAccount,
            onSignOut = onSignOut,
            rememberedUsers = rememberedUsers,
            serverOrigin = serverOrigin
        )
    }
}

// ================= GENERIC LOGIN FORM =================

@Composable
private fun GenericLoginForm(
    identifier: String,
    onIdentifierChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    passwordVisible: Boolean,
    onTogglePasswordVisibility: () -> Unit,
    keepLoggedIn: Boolean,
    onKeepLoggedInChange: (Boolean) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onSubmit: () -> Unit,
    onForgotPassword: () -> Unit,
    onAddNewAccount: () -> Unit,
    onSwitchAccount: () -> Unit,
    onSignOut: () -> Unit,
    onGoogleSignIn: () -> Unit,
    rememberedUsers: List<RememberedUser>,
    serverOrigin: String = "",
    isGenericLogin: Boolean = false,
    onBack: (() -> Unit)? = null
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Form Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(52.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Outlined.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Welcome Back",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Sign in with your credentials",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Identifier Input Field (Subtle distinction: surfaceContainerLow)
        OutlinedTextField(
            value = identifier,
            onValueChange = onIdentifierChange,
            label = { Text("Username or Email") },
            placeholder = { Text("user@example.com") },
            singleLine = true,
            leadingIcon = {
                Icon(
                    imageVector = Icons.Outlined.Person,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
                )
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            shape = RoundedCornerShape(22.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow.copy(alpha = 0.85f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
            ),
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 62.dp)
        )

        Spacer(modifier = Modifier.height(14.dp))

        // Password row: shortened password field with inner eye circle + separate circular -> button
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = password,
                onValueChange = onPasswordChange,
                label = { Text("Password") },
                placeholder = { Text("••••••••") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
                    )
                },
                trailingIcon = {
                    // Eye button inside its own circular surface
                    Surface(
                        onClick = onTogglePasswordVisibility,
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier
                            .padding(end = 4.dp)
                            .size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    if (identifier.isNotBlank() && password.isNotBlank() && !isLoading) onSubmit()
                }),
                shape = RoundedCornerShape(22.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.85f),
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                ),
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 62.dp)
            )

            // Independent circular -> submit button aligned with password field height
            Surface(
                onClick = onSubmit,
                enabled = (identifier.isNotBlank() && password.isNotBlank()) && !isLoading,
                shape = CircleShape,
                color = if (identifier.isNotBlank() && password.isNotBlank() && !isLoading) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (identifier.isNotBlank() && password.isNotBlank() && !isLoading) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                shadowElevation = if (identifier.isNotBlank() && password.isNotBlank() && !isLoading) 3.dp else 0.dp,
                modifier = Modifier.size(58.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "Sign In",
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Remember Me & Forgot Password Row (Reduced size, ample space between)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clickable { onKeepLoggedInChange(!keepLoggedIn) }
                    .padding(vertical = 4.dp)
            ) {
                Checkbox(
                    checked = keepLoggedIn,
                    onCheckedChange = null,
                    colors = CheckboxDefaults.colors(
                        checkedColor = MaterialTheme.colorScheme.primary,
                        checkmarkColor = MaterialTheme.colorScheme.onPrimary
                    ),
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Remember me",
                    fontSize = 12.sp,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            TextButton(
                onClick = onForgotPassword,
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "Forgot Password?",
                    fontSize = 12.sp,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Native Material 3 Expressive Continue with Google Button
        GoogleSignInButton(
            onClick = onGoogleSignIn,
            isLoading = isLoading
        )

        // Symmetrical Footer if saved accounts exist
        if (rememberedUsers.isNotEmpty()) {
            Spacer(modifier = Modifier.height(14.dp))
            SymmetricalAccountActionsFooter(
                onAddNewAccount = onAddNewAccount,
                onSwitchAccount = onSwitchAccount,
                onSignOut = onSignOut,
                rememberedUsers = rememberedUsers,
                serverOrigin = serverOrigin,
                isGenericLogin = isGenericLogin,
                onBack = onBack
            )
        }
    }
}

// ================= NATIVE GOOGLE SIGN IN BUTTON =================

@Composable
private fun GoogleSignInButton(
    onClick: () -> Unit,
    isLoading: Boolean,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        enabled = !isLoading,
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.85f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                painter = painterResource(id = R.drawable.ic_google_logo),
                contentDescription = "Google",
                tint = Color.Unspecified, // Preserves official Google multi-colors!
                modifier = Modifier.size(22.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "Continue with Google",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

// ================= PENDING APPROVAL VIEW =================

@Composable
private fun PendingApprovalView(
    pendingWorkerName: String,
    pendingInviteCode: String,
    onBack: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(24.dp)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Surface(
            color = MaterialTheme.colorScheme.tertiaryContainer,
            shape = RoundedCornerShape(28.dp),
            modifier = Modifier.size(88.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.HourglassEmpty,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.size(44.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Approval Pending",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = if (pendingWorkerName.isNotEmpty()) "Hello $pendingWorkerName" else "Welcome to MacOS Suite",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(32.dp))

        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            shape = RoundedCornerShape(24.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Text(
                    text = "YOUR ACCESS INVITE CODE",
                    style = MaterialTheme.typography.labelMedium,
                    letterSpacing = 2.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = pendingInviteCode,
                    style = MaterialTheme.typography.displaySmall,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.primary,
                    letterSpacing = 4.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Surface(
            color = MaterialTheme.colorScheme.surfaceContainer,
            shape = RoundedCornerShape(50),
            modifier = Modifier.padding(horizontal = 16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.5.dp,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Waiting for manager approval...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        FilledTonalButton(
            onClick = onBack,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(20.dp)
        ) {
            Text("Back to Sign In", style = MaterialTheme.typography.titleMedium)
        }
    }
}

// ================= FORGOT PASSWORD VIEWS =================

@Composable
private fun ForgotPasswordIdentifierView(
    identifier: String,
    onIdentifierChange: (String) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onContinue: () -> Unit,
    onCancel: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Surface(
            color = MaterialTheme.colorScheme.primaryContainer,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.size(64.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Outlined.LockReset,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Reset Password",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = "Enter your username or email address to locate your account security challenge.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(20.dp))

        OutlinedTextField(
            value = identifier,
            onValueChange = onIdentifierChange,
            label = { Text("Username or Email") },
            placeholder = { Text("user@example.com") },
            singleLine = true,
            leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null) },
            shape = RoundedCornerShape(20.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.25f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            ),
            modifier = Modifier.fillMaxWidth()
        )

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error,
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
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Cancel")
            }

            Button(
                onClick = onContinue,
                enabled = identifier.isNotBlank() && !isLoading,
                modifier = Modifier
                    .weight(1.4f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Continue")
                }
            }
        }
    }
}

@Composable
private fun ForgotPasswordAnswerView(
    identifier: String,
    question: String,
    isRecoveryKey: Boolean,
    answer: String,
    onAnswerChange: (String) -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onVerify: () -> Unit,
    onCancel: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Surface(
            color = MaterialTheme.colorScheme.secondaryContainer,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.size(64.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Outlined.Security,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = if (isRecoveryKey) "Recovery Key" else "Security Question",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(8.dp))

        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHighest,
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Account: $identifier",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = question,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        OutlinedTextField(
            value = answer,
            onValueChange = onAnswerChange,
            label = { Text(if (isRecoveryKey) "Recovery Key" else "Your Answer") },
            placeholder = { Text(if (isRecoveryKey) "Enter recovery key" else "Enter your answer") },
            singleLine = true,
            shape = RoundedCornerShape(20.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.25f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            ),
            modifier = Modifier.fillMaxWidth()
        )

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error,
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
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Cancel")
            }

            Button(
                onClick = onVerify,
                enabled = answer.isNotBlank() && !isLoading,
                modifier = Modifier
                    .weight(1.4f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Verify")
                }
            }
        }
    }
}

@Composable
private fun ForgotPasswordResetView(
    newPassword: String,
    onNewPasswordChange: (String) -> Unit,
    confirmPassword: String,
    onConfirmPasswordChange: (String) -> Unit,
    newPasswordVisible: Boolean,
    onToggleNewVisibility: () -> Unit,
    confirmPasswordVisible: Boolean,
    onToggleConfirmVisibility: () -> Unit,
    isLoading: Boolean,
    errorMessage: String?,
    onSaveAndSignIn: () -> Unit,
    onCancel: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Surface(
            color = MaterialTheme.colorScheme.tertiaryContainer,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.size(64.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Outlined.Key,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Set New Password",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = "Your identity is verified. Create a new password for your account.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(20.dp))

        OutlinedTextField(
            value = newPassword,
            onValueChange = onNewPasswordChange,
            label = { Text("New Password") },
            singleLine = true,
            visualTransformation = if (newPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = onToggleNewVisibility) {
                    Icon(
                        imageVector = if (newPasswordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                        contentDescription = null
                    )
                }
            },
            shape = RoundedCornerShape(20.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.25f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = confirmPassword,
            onValueChange = onConfirmPasswordChange,
            label = { Text("Confirm New Password") },
            singleLine = true,
            visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = onToggleConfirmVisibility) {
                    Icon(
                        imageVector = if (confirmPasswordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                        contentDescription = null
                    )
                }
            },
            shape = RoundedCornerShape(20.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.25f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            ),
            modifier = Modifier.fillMaxWidth()
        )

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error,
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
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Cancel")
            }

            Button(
                onClick = onSaveAndSignIn,
                enabled = newPassword.isNotBlank() && confirmPassword.isNotBlank() && !isLoading,
                modifier = Modifier
                    .weight(1.4f)
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Save & Sign In")
                }
            }
        }
    }
}

// ================= POST-LOGIN MATERIAL 3 DIALOGS =================

@Composable
private fun RememberAccountPromptDialog(
    onRemember: () -> Unit,
    onNotNow: () -> Unit
) {
    Dialog(onDismissRequest = onNotNow) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(32.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Remember this account?",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Remember your account on this Android device. Future sign-ins will show this account and ask only for your password.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onNotNow,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Not Now")
                    }

                    Button(
                        onClick = onRemember,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Remember")
                    }
                }
            }
        }
    }
}

@Composable
private fun PublicDeviceWarningDialog(
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    Dialog(onDismissRequest = onCancel) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.WarningAmber, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(32.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Public Device Warning",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Anyone who uses this device will be able to see this account. Do not choose this on a shared or public device.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onCancel,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Cancel")
                    }

                    Button(
                        onClick = onConfirm,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Confirm")
                    }
                }
            }
        }
    }
}

@Composable
private fun RememberAccountDismissDialog(
    onDontAskAgain: () -> Unit,
    onContinueJustNow: () -> Unit,
    onClose: () -> Unit
) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null, tint = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Continue without remembering?",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "This device will not keep your account details for the next sign-in.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(20.dp))

                FilledTonalButton(
                    onClick = onDontAskAgain,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Don't ask again on this device")
                }

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = onContinueJustNow,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Continue without remembering")
                }
            }
        }
    }
}

@Composable
private fun BiometricSetupPromptDialog(
    onSetUp: () -> Unit,
    onNotNow: (dontAskAgain: Boolean) -> Unit
) {
    var dontAskAgain by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = { onNotNow(dontAskAgain) }) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Fingerprint, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(36.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Use Biometrics next time?",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Use this device's fingerprint or face security for faster sign-in while keeping password login available.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Tick box / Checkbox to not show again on this device
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { dontAskAgain = !dontAskAgain }
                        .padding(vertical = 4.dp, horizontal = 4.dp)
                ) {
                    Checkbox(
                        checked = dontAskAgain,
                        onCheckedChange = { dontAskAgain = it },
                        colors = CheckboxDefaults.colors(
                            checkedColor = MaterialTheme.colorScheme.primary,
                            checkmarkColor = MaterialTheme.colorScheme.onPrimary
                        )
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Don't show again on this device",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = { onNotNow(dontAskAgain) },
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Not Now")
                    }

                    Button(
                        onClick = onSetUp,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Set Up")
                    }
                }
            }
        }
    }
}

@Composable
private fun BiometricNoticeDialog(
    onConfirm: () -> Unit
) {
    Dialog(onDismissRequest = onConfirm) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Biometric Setup Skipped",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = "You can later turn this on anytime from your Profile page.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = onConfirm,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text("OK, Got It")
                }
            }
        }
    }
}

@Composable
private fun BiometricSetupDismissDialog(
    onDontAskAgain: () -> Unit,
    onContinue: () -> Unit,
    onClose: () -> Unit
) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Continue without Biometrics?",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "You can still use your password and enable biometrics later in Settings.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(20.dp))

                FilledTonalButton(
                    onClick = onDontAskAgain,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Don't ask again on this device")
                }

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = onContinue,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Continue")
                }
            }
        }
    }
}

@Composable
private fun BiometricSetupFailedDialog(
    errorMessage: String,
    onRetry: () -> Unit,
    onContinueWithPassword: () -> Unit,
    onDontShowAgain: () -> Unit
) {
    Dialog(onDismissRequest = onContinueWithPassword) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(32.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Biometric Setup Failed",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                TextButton(onClick = onDontShowAgain) {
                    Text("Don't show again on this device")
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onContinueWithPassword,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Not Now")
                    }

                    Button(
                        onClick = onRetry,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Retry")
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkerCredentialDialog(
    identifier: String,
    onIdentifierChange: (String) -> Unit,
    identifierType: String,
    onIdentifierTypeChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    confirmPassword: String,
    onConfirmPasswordChange: (String) -> Unit,
    onContinue: () -> Unit,
    onSkip: () -> Unit
) {
    Dialog(onDismissRequest = onSkip) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Key, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Create Local Account",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Text(
                    text = "Set up login credentials linked with your account for fast native sign-in.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(12.dp))
                        .padding(4.dp)
                ) {
                    val emailSelected = identifierType == "email"
                    Surface(
                        onClick = { onIdentifierTypeChange("email") },
                        color = if (emailSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = "Email",
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = if (emailSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }

                    Surface(
                        onClick = { onIdentifierTypeChange("username") },
                        color = if (!emailSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = "Username",
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = if (!emailSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = identifier,
                    onValueChange = onIdentifierChange,
                    label = { Text(if (identifierType == "email") "Email Address" else "Username") },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChange,
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = onConfirmPasswordChange,
                    label = { Text("Confirm Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onSkip,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Not Now")
                    }

                    Button(
                        onClick = onContinue,
                        enabled = identifier.isNotBlank() && password.isNotBlank() && password == confirmPassword,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Continue")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkerSecurityQuestionDialog(
    question: String,
    onQuestionChange: (String) -> Unit,
    answer: String,
    onAnswerChange: (String) -> Unit,
    isLoading: Boolean,
    onSave: () -> Unit,
    onBack: () -> Unit
) {
    val predefinedQuestions = listOf(
        "What was the name of your first pet?",
        "In what city were you born?",
        "What was your childhood nickname?",
        "What is the name of your favorite book?",
        "What was the model of your first car?",
        "What school did you attend for sixth grade?",
        "What is the name of your favorite childhood friend?"
    )

    var dropdownExpanded by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onBack) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Security Question",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Text(
                    text = "Choose a security question to protect and recover your credentials.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                ExposedDropdownMenuBox(
                    expanded = dropdownExpanded,
                    onExpandedChange = { dropdownExpanded = it },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = if (question.isBlank()) "Choose a question..." else question,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                    )

                    ExposedDropdownMenu(
                        expanded = dropdownExpanded,
                        onDismissRequest = { dropdownExpanded = false }
                    ) {
                        predefinedQuestions.forEach { q ->
                            DropdownMenuItem(
                                text = { Text(q, style = MaterialTheme.typography.bodyMedium) },
                                onClick = {
                                    onQuestionChange(q)
                                    dropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = answer,
                    onValueChange = onAnswerChange,
                    label = { Text("Your Secret Answer") },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onBack,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Back")
                    }

                    Button(
                        onClick = onSave,
                        enabled = question.isNotBlank() && answer.isNotBlank() && !isLoading,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Save Account")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkerDismissDialog(
    onDontAskAgain: () -> Unit,
    onJustThisTime: () -> Unit,
    onClose: () -> Unit
) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = CircleShape,
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null, tint = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(28.dp))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Continue without local credentials?",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "You can still sign in with your primary login and configure credentials anytime in Settings.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(20.dp))

                FilledTonalButton(
                    onClick = onDontAskAgain,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Don't ask again on this device")
                }

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = onJustThisTime,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Not Now")
                }
            }
        }
    }
}
