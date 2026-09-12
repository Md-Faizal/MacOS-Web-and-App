package com.example.macosbusinesssuite.ui.viewmodels

import android.app.Application
import android.content.Context
import android.os.Environment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.macosbusinesssuite.AppUpdateNotificationManager
import com.example.macosbusinesssuite.AppUpdateUtils
import com.example.macosbusinesssuite.BuildConfig
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.api.SessionManager
import com.example.macosbusinesssuite.data.api.MultiUserManager
import com.example.macosbusinesssuite.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

enum class ThemeMode {
    DARK, LIGHT, AUTO
}

sealed class AndroidUpdateUiState {
    data object Idle : AndroidUpdateUiState()
    data object Checking : AndroidUpdateUiState()
    data object UpToDate : AndroidUpdateUiState()
    data class Available(val manifest: AndroidUpdateManifest?) : AndroidUpdateUiState()
    data class CachedAvailable(
        val cachedFile: File,
        val versionName: String,
        val versionCode: Int
    ) : AndroidUpdateUiState()
    data class VersionConflict(
        val cachedVersionName: String,
        val cachedVersionCode: Int,
        val serverManifest: AndroidUpdateManifest
    ) : AndroidUpdateUiState()
    data class Downloading(
        val progress: Float = 0f,
        val downloadedMB: String = "0 MB",
        val totalMB: String = "0 MB"
    ) : AndroidUpdateUiState()
    data class Verifying(val step: String = "Verifying integrity...") : AndroidUpdateUiState()
    data class ReadyToInstall(val file: File) : AndroidUpdateUiState()
    data class Error(val message: String, val retryable: Boolean = true) : AndroidUpdateUiState()
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    val sessionManager = SessionManager.getInstance(application)
    val multiUserManager = MultiUserManager(application)
    val cacheManager = com.example.macosbusinesssuite.data.cache.UserScopedCacheManager.getInstance(application)

    private val _isDataCached = MutableStateFlow(false)
    val isDataCached: StateFlow<Boolean> = _isDataCached.asStateFlow()

    private val _isSyncingLive = MutableStateFlow(false)
    val isSyncingLive: StateFlow<Boolean> = _isSyncingLive.asStateFlow()

    private val _lastSyncTimestamp = MutableStateFlow<Long?>(null)
    val lastSyncTimestamp: StateFlow<Long?> = _lastSyncTimestamp.asStateFlow()

    private val _changedMetricKeys = MutableStateFlow<Set<String>>(emptySet())
    val changedMetricKeys: StateFlow<Set<String>> = _changedMetricKeys.asStateFlow()

    fun addChangedMetric(key: String) {
        _changedMetricKeys.value = _changedMetricKeys.value + key
        viewModelScope.launch {
            kotlinx.coroutines.delay(3500L)
            _changedMetricKeys.value = _changedMetricKeys.value - key
        }
    }

    fun hydrateFromCache(userId: String, fallbackKey: String? = null) {
        if (userId.isBlank() && fallbackKey.isNullOrBlank()) return
        val resolvedFallback = fallbackKey ?: sessionManager.userEmail?.takeIf { it.isNotBlank() } ?: multiUserManager.getUsers().find { it.id == userId }?.identifier
        val cachedProducts = cacheManager.getProducts(userId, resolvedFallback)
        val cachedContacts = cacheManager.getContacts(userId, resolvedFallback)
        val cachedBills = cacheManager.getBills(userId, resolvedFallback)
        val cachedAnalyticsSummary = cacheManager.getAnalyticsSummary(userId, resolvedFallback)
        val cachedKPI = cacheManager.getExecutiveKPI(userId, resolvedFallback)
        val cachedSalesTrends = cacheManager.getSalesTrends(userId, resolvedFallback)
        val cachedTopProducts = cacheManager.getTopProducts(userId, resolvedFallback)
        val cachedTopCustomers = cacheManager.getTopCustomers(userId, resolvedFallback)

        if (cachedProducts.isNotEmpty() || cachedContacts.isNotEmpty() || cachedBills.isNotEmpty() || cachedAnalyticsSummary != null || cachedKPI != null) {
            _products.value = cachedProducts
            _contacts.value = cachedContacts
            _bills.value = cachedBills
            if (cachedAnalyticsSummary != null) _analyticsSummary.value = cachedAnalyticsSummary
            if (cachedKPI != null) _executiveKPI.value = cachedKPI
            if (cachedSalesTrends.isNotEmpty()) _salesTrends.value = cachedSalesTrends
            if (cachedTopProducts.isNotEmpty()) _topProducts.value = cachedTopProducts
            if (cachedTopCustomers.isNotEmpty()) _topCustomers.value = cachedTopCustomers
            _isDataCached.value = true
            _isSyncingLive.value = true
        }
    }

    // Multi-User state
    private val _rememberedUsers = MutableStateFlow<List<RememberedUser>>(multiUserManager.getUsers())
    val rememberedUsers: StateFlow<List<RememberedUser>> = _rememberedUsers.asStateFlow()

    private val _activeUser = MutableStateFlow<RememberedUser?>(multiUserManager.getActiveUser())
    val activeUser: StateFlow<RememberedUser?> = _activeUser.asStateFlow()

    fun refreshMultiUsers() {
        _rememberedUsers.value = multiUserManager.getUsers()
        _activeUser.value = multiUserManager.getActiveUser()
    }

    fun selectUser(user: RememberedUser) {
        val selected = multiUserManager.setActiveUserId(user.id)
        _activeUser.value = selected ?: user
        _rememberedUsers.value = multiUserManager.getUsers()
        hydrateFromCache(user.id)
    }

    fun removeRememberedUser(idOrIdentifier: String) {
        multiUserManager.removeUser(idOrIdentifier)
        refreshMultiUsers()
    }

    fun clearAllRememberedUsers() {
        multiUserManager.clearAllUsers()
        refreshMultiUsers()
    }

    init {
        // Cold-start safety: ensure active user credentials and userId are loaded into sessionManager
        val active = multiUserManager.getActiveUser()
        if (active != null) {
            if (sessionManager.userId.isNullOrBlank()) {
                sessionManager.userId = active.id
            }
            if (sessionManager.userName.isNullOrBlank()) {
                sessionManager.userName = active.displayName
            }
            if (sessionManager.userEmail.isNullOrBlank()) {
                sessionManager.userEmail = active.identifier
            }
            if (sessionManager.userRole.isBlank() || sessionManager.userRole == "worker") {
                sessionManager.userRole = active.role
            }
            if (!active.displayPicture.isNullOrBlank() && sessionManager.userPicture.isNullOrBlank()) {
                sessionManager.userPicture = active.displayPicture
            }
            // Prime cache for immediate instant display
            hydrateFromCache(active.id, active.identifier)
        }
        syncRememberedUsers()
    }

    fun syncRememberedUsers() {
        viewModelScope.launch(Dispatchers.IO) {
            val users = multiUserManager.getUsers()
            var changed = false
            val httpClient = okhttp3.OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .build()

            for (user in users) {
                val token = user.savedAuthToken
                if (!token.isNullOrBlank()) {
                    try {
                        val req = okhttp3.Request.Builder()
                            .url(sessionManager.serverUrl + "auth/profile")
                            .header("Authorization", "Bearer $token")
                            .header("X-API-Key", "test-api-key-1234")
                            .header("X-Client-Platform", "android")
                            .header("X-App-Type", "native_android")
                            .build()
                        val res = httpClient.newCall(req).execute()
                        res.use { resp ->
                            if (resp.isSuccessful && resp.body != null) {
                                val jsonStr = resp.body!!.string()
                                val parsed = NetworkClient.customGson.fromJson(jsonStr, ProfileResponse::class.java)
                                val p = parsed?.profile
                                if (p != null) {
                                    val realName = p.actualName ?: user.displayName
                                    val realEmail = p.actualEmail ?: user.identifier
                                    val realPicture = p.actualPicture ?: user.displayPicture
                                    if (realName != user.displayName || realEmail != user.identifier || realPicture != user.displayPicture) {
                                        multiUserManager.saveUser(
                                            user.copy(
                                                displayName = realName,
                                                identifier = realEmail,
                                                displayPicture = realPicture
                                            )
                                        )
                                        changed = true
                                    }
                                }
                            } else if (resp.code == 401) {
                                // Token has expired or been revoked on the server for this remembered account.
                                // Mark saved token as null for this remembered user without corrupting active session.
                                multiUserManager.saveUser(
                                    user.copy(
                                        savedAuthToken = null,
                                        savedRefreshToken = null
                                    )
                                )
                                changed = true
                            }
                        }
                    } catch (_: Exception) {}
                }
            }
            if (changed) {
                withContext(Dispatchers.Main) {
                    refreshMultiUsers()
                }
            }
        }
    }


    // Theme Mode State
    private val _themeMode = MutableStateFlow(ThemeMode.AUTO)
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    fun setThemeMode(mode: ThemeMode) {
        _themeMode.value = mode
    }

    // Navigation & Auth state
    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _permissionsJson = MutableStateFlow(sessionManager.permissionsJson)
    val permissionsJson: StateFlow<String?> = _permissionsJson.asStateFlow()

    fun completeLogin() {
        val active = multiUserManager.getActiveUser()
        if (sessionManager.userId.isNullOrBlank() && active != null) {
            sessionManager.userId = active.id
        }
        sessionManager.isLoggedIn = true
        _isLoggedIn.value = true
        val uid = sessionManager.userId ?: active?.id
        if (!uid.isNullOrBlank()) {
            hydrateFromCache(uid, active?.identifier)
        }
        loadAllData()
    }

    private val _serverUrl = MutableStateFlow(sessionManager.serverUrl)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun setErrorMessage(msg: String?) {
        _errorMessage.value = msg
    }

    // Profile & Device States
    private val _profile = MutableStateFlow<ProfileData?>(null)
    val profile: StateFlow<ProfileData?> = _profile.asStateFlow()

    private val _devices = MutableStateFlow<List<DeviceItem>>(emptyList())
    val devices: StateFlow<List<DeviceItem>> = _devices.asStateFlow()

    // Security & Auth Settings States
    private val _passwordSet = MutableStateFlow(false)
    val passwordSet: StateFlow<Boolean> = _passwordSet.asStateFlow()

    private val _hasSecurityQuestion = MutableStateFlow(false)
    val hasSecurityQuestion: StateFlow<Boolean> = _hasSecurityQuestion.asStateFlow()

    private val _biometricEnabled = MutableStateFlow(sessionManager.biometricEnabled)
    val biometricEnabled: StateFlow<Boolean> = _biometricEnabled.asStateFlow()

    fun setBiometricEnabled(enabled: Boolean) {
        sessionManager.biometricEnabled = enabled
        _biometricEnabled.value = enabled
    }

    private val _marqueeEnabled = MutableStateFlow(sessionManager.marqueeEnabled)
    val marqueeEnabled: StateFlow<Boolean> = _marqueeEnabled.asStateFlow()

    fun setMarqueeEnabled(enabled: Boolean) {
        sessionManager.marqueeEnabled = enabled
        _marqueeEnabled.value = enabled
    }

    fun setRemoteLoggingEnabled(enabled: Boolean) {
        sessionManager.remoteLoggingEnabled = enabled
        try {
            com.example.macosbusinesssuite.util.RemoteLogger.setEnabled(enabled)
        } catch (_: Exception) {}
    }

    fun clearLocalLogs() {
        try {
            com.example.macosbusinesssuite.util.RemoteLogger.clearLocalLogs()
        } catch (_: Exception) {}
    }

    // Module States
    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _contacts = MutableStateFlow<List<Contact>>(emptyList())
    val contacts: StateFlow<List<Contact>> = _contacts.asStateFlow()

    private val _bills = MutableStateFlow<List<Bill>>(emptyList())
    val bills: StateFlow<List<Bill>> = _bills.asStateFlow()

    private val _billingSummary = MutableStateFlow<BillingSummary?>(null)
    val billingSummary: StateFlow<BillingSummary?> = _billingSummary.asStateFlow()

    private val _analyticsSummary = MutableStateFlow<AnalyticsSummary?>(null)
    val analyticsSummary: StateFlow<AnalyticsSummary?> = _analyticsSummary.asStateFlow()

    private val _executiveKPI = MutableStateFlow<ExecutiveKPI?>(null)
    val executiveKPI: StateFlow<ExecutiveKPI?> = _executiveKPI.asStateFlow()

    private val _salesTrends = MutableStateFlow<List<SalesTrendPoint>>(emptyList())
    val salesTrends: StateFlow<List<SalesTrendPoint>> = _salesTrends.asStateFlow()

    private val _topProducts = MutableStateFlow<List<TopProductItem>>(emptyList())
    val topProducts: StateFlow<List<TopProductItem>> = _topProducts.asStateFlow()

    private val _topCustomers = MutableStateFlow<List<TopCustomerItem>>(emptyList())
    val topCustomers: StateFlow<List<TopCustomerItem>> = _topCustomers.asStateFlow()

    private val _salesDeepDive = MutableStateFlow<SalesDeepDiveResponse?>(null)
    val salesDeepDive: StateFlow<SalesDeepDiveResponse?> = _salesDeepDive.asStateFlow()

    private val _orderFunnel = MutableStateFlow<OrderFunnelResponse?>(null)
    val orderFunnel: StateFlow<OrderFunnelResponse?> = _orderFunnel.asStateFlow()

    private val _arAging = MutableStateFlow<ARAgingResponse?>(null)
    val arAging: StateFlow<ARAgingResponse?> = _arAging.asStateFlow()

    private val _rfmSegmentation = MutableStateFlow<List<RFMCustomerItem>>(emptyList())
    val rfmSegmentation: StateFlow<List<RFMCustomerItem>> = _rfmSegmentation.asStateFlow()

    private val _productVelocity = MutableStateFlow<ProductVelocityResponse?>(null)
    val productVelocity: StateFlow<ProductVelocityResponse?> = _productVelocity.asStateFlow()

    private val _categoryPerformance = MutableStateFlow<List<CategoryPerformanceItem>>(emptyList())
    val categoryPerformance: StateFlow<List<CategoryPerformanceItem>> = _categoryPerformance.asStateFlow()

    private val _comparativeYoY = MutableStateFlow<YoYResponse?>(null)
    val comparativeYoY: StateFlow<YoYResponse?> = _comparativeYoY.asStateFlow()

    private val _comparativeMoM = MutableStateFlow<List<MoMItem>>(emptyList())
    val comparativeMoM: StateFlow<List<MoMItem>> = _comparativeMoM.asStateFlow()

    private val _comparativeQoQ = MutableStateFlow<List<QoQItem>>(emptyList())
    val comparativeQoQ: StateFlow<List<QoQItem>> = _comparativeQoQ.asStateFlow()

    private val _comparativeCustom = MutableStateFlow<CustomComparisonResult?>(null)
    val comparativeCustom: StateFlow<CustomComparisonResult?> = _comparativeCustom.asStateFlow()

    private val _selectedCustomerStats = MutableStateFlow<CustomerStats?>(null)
    val selectedCustomerStats: StateFlow<CustomerStats?> = _selectedCustomerStats.asStateFlow()

    private val _selectedCustomer = MutableStateFlow<Contact?>(null)
    val selectedCustomer: StateFlow<Contact?> = _selectedCustomer.asStateFlow()

    private val _analyticsLoading = MutableStateFlow<Boolean>(false)
    val analyticsLoading: StateFlow<Boolean> = _analyticsLoading.asStateFlow()

    private val _updateState = MutableStateFlow<AndroidUpdateUiState>(AndroidUpdateUiState.Idle)
    val updateState: StateFlow<AndroidUpdateUiState> = _updateState.asStateFlow()

    // Cached manifest from last successful check
    private val _updateManifest = MutableStateFlow<AndroidUpdateManifest?>(null)
    val updateManifest: StateFlow<AndroidUpdateManifest?> = _updateManifest.asStateFlow()

    // Preflight warnings from last check
    private val _preflightWarnings = MutableStateFlow<List<String>>(emptyList())
    val preflightWarnings: StateFlow<List<String>> = _preflightWarnings.asStateFlow()

    // Update history lineage
    private val _updateHistory = MutableStateFlow<List<AndroidVersionHistory>>(emptyList())
    val updateHistory: StateFlow<List<AndroidVersionHistory>> = _updateHistory.asStateFlow()

    // Update check cooldown (24 hours in millis)
    private val UPDATE_CHECK_COOLDOWN_MS = 24 * 60 * 60 * 1000L
    private val UPDATE_PREFS_NAME = "android_update_prefs"
    private val KEY_LAST_UPDATE_CHECK = "last_update_check_ms"

    init {
        // Populate profile immediately from cached user data for instant zero-latency rendering
        val cachedUser = multiUserManager.getActiveUser()
        if (cachedUser != null) {
            _profile.value = ProfileData(
                id = cachedUser.id,
                username = cachedUser.identifier,
                fullName = cachedUser.displayName,
                displayName = cachedUser.displayName,
                email = cachedUser.identifier,
                emailId = cachedUser.identifier,
                displayEmail = cachedUser.identifier,
                profilePicture = cachedUser.displayPicture,
                displayPicture = cachedUser.displayPicture
            )
        } else if (!sessionManager.userEmail.isNullOrBlank() || !sessionManager.userName.isNullOrBlank()) {
            _profile.value = ProfileData(
                id = sessionManager.userId,
                username = sessionManager.userName,
                fullName = sessionManager.userName,
                displayName = sessionManager.userName,
                email = sessionManager.userEmail,
                emailId = sessionManager.userEmail,
                displayEmail = sessionManager.userEmail,
                profilePicture = sessionManager.userPicture,
                displayPicture = sessionManager.userPicture
            )
        }

        // On cold start, do NOT automatically stay logged into the dashboard.
        // Even when user accounts are remembered (like the website), app launch starts in locked/login state
        // requiring password entry or biometric unlock.
        _isLoggedIn.value = false
        sessionManager.isLoggedIn = false

        // Post-installation detection on startup
        checkPostInstallSuccess()

        // Silent auto-check for updates on app startup (if enabled)
        if (sessionManager.autoUpdateCheckEnabled) {
            silentUpdateCheckIfDue()
        }
    }

    fun updateServerUrl(url: String) {
        sessionManager.serverUrl = url
        _serverUrl.value = sessionManager.serverUrl
        NetworkClient.resetClient()
        checkAuthStatus()
    }

    fun checkAuthStatus() {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.getAuthStatus()
                if (response.isSuccessful && response.body()?.authenticated == true) {
                    val perms = response.body()?.permissions
                    if (perms != null) {
                        val json = Gson().toJson(perms)
                        sessionManager.permissionsJson = json
                        _permissionsJson.value = json
                    } else if (sessionManager.userRole == "owner") {
                        sessionManager.permissionsJson = null
                        _permissionsJson.value = null
                    }
                }
            } catch (e: Exception) {
                // Ignore transient network errors during background status check
            }
        }
    }

    fun login(username: String, password: String, keepLoggedIn: Boolean = false, onResult: (Boolean, String?, UserProfile?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                NetworkClient.resetClient()
                val service = NetworkClient.getService(sessionManager)
                val response = service.login(
                    LoginRequest(
                        identifier = username,
                        password = password,
                        deviceName = android.os.Build.MODEL,
                        deviceType = "Android App",
                        clientType = "native_android"
                    )
                )
                if (response.isSuccessful && response.body()?.success == true) {
                    val userProfile = response.body()?.user
                    val token = response.body()?.token
                    val refreshToken = response.body()?.refreshToken

                    sessionManager.keepLoggedIn = keepLoggedIn
                    token?.let { sessionManager.authToken = it }
                    refreshToken?.let { sessionManager.refreshToken = it }
                    sessionManager.isLoggedIn = true

                    val serverRole = userProfile?.role?.lowercase()?.trim()
                    val resolvedRole = if (serverRole == "owner" || serverRole == "admin") {
                        "owner"
                    } else if (serverRole == "worker") {
                        "worker"
                    } else {
                        val isOwnerAccount = username.contains("faizal", ignoreCase = true) ||
                                username.contains("fazztronic", ignoreCase = true) ||
                                (userProfile?.email?.contains("faizal", ignoreCase = true) == true) ||
                                (userProfile?.email?.contains("fazztronic", ignoreCase = true) == true) ||
                                (userProfile?.actualEmail?.contains("faizal", ignoreCase = true) == true) ||
                                (userProfile?.actualEmail?.contains("fazztronic", ignoreCase = true) == true) ||
                                (userProfile?.username?.contains("faizal", ignoreCase = true) == true)
                        if (isOwnerAccount) "owner" else "worker"
                    }

                    userProfile?.let {
                        sessionManager.userId = it.id
                        sessionManager.userName = it.actualName ?: it.username ?: username
                        sessionManager.userEmail = it.actualEmail ?: it.email ?: ""
                        it.actualPicture?.let { pic -> sessionManager.userPicture = pic }
                        sessionManager.userRole = resolvedRole
                        sessionManager.userStatus = "active"
                    }

                    // Save permissions snapshot if provided, or clear for owner
                    val perms = response.body()?.permissions
                    if (perms != null) {
                        val pJson = Gson().toJson(perms)
                        sessionManager.permissionsJson = pJson
                        _permissionsJson.value = pJson
                    } else if (resolvedRole == "owner") {
                        sessionManager.permissionsJson = null
                        _permissionsJson.value = null
                    }

                    // Always cache user profile details in MultiUserManager so avatar, name, and email persist
                    val existing = multiUserManager.getUsers().find {
                        it.identifier.equals(username, ignoreCase = true) || (userProfile?.id != null && it.id == userProfile.id)
                    }
                    val isBio = existing?.isBiometricEnabled ?: false
                    val realName = userProfile?.actualName ?: userProfile?.username ?: existing?.displayName ?: username.substringBefore('@')
                    val realEmail = userProfile?.actualEmail ?: userProfile?.email ?: existing?.identifier ?: username
                    val realPicture = userProfile?.actualPicture ?: userProfile?.avatar ?: existing?.displayPicture

                    // Immediately initialize _profile with authenticated user details so UI updates instantly
                    _profile.value = ProfileData(
                        id = userProfile?.id,
                        username = userProfile?.username ?: username,
                        role = resolvedRole,
                        fullName = realName,
                        emailId = realEmail,
                        email = realEmail,
                        displayName = realName,
                        displayEmail = realEmail,
                        displayPicture = realPicture
                    )

                    val targetUserId = userProfile?.id ?: existing?.id ?: ("usr_" + System.currentTimeMillis().toString(36))
                    sessionManager.userId = targetUserId

                    val savedUser = RememberedUser(
                        id = targetUserId,
                        identifier = realEmail,
                        displayName = realName,
                        displayPicture = realPicture,
                        role = resolvedRole,
                        isBiometricEnabled = isBio,
                        savedAuthToken = if (keepLoggedIn || existing != null) (token ?: existing?.savedAuthToken) else null,
                        savedRefreshToken = if (keepLoggedIn || existing != null) (refreshToken ?: existing?.savedRefreshToken) else null
                    )
                    multiUserManager.saveUser(savedUser)
                    multiUserManager.setActiveUserId(savedUser.id)
                    refreshMultiUsers()
                    hydrateFromCache(savedUser.id, savedUser.identifier)

                    onResult(true, null, userProfile)
                } else {
                    val msg = response.body()?.message ?: "Login failed. Check credentials."
                    _errorMessage.value = msg
                    onResult(false, msg, null)
                }
            } catch (e: Exception) {
                val msg = "Connection error: ${e.localizedMessage}"
                _errorMessage.value = msg
                onResult(false, msg, null)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun loginWithBiometrics(user: RememberedUser, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                NetworkClient.resetClient()
                // Set session credentials
                sessionManager.userId = user.id
                sessionManager.userName = user.displayName
                sessionManager.userEmail = user.identifier
                sessionManager.userRole = user.role
                sessionManager.userStatus = "active"
                sessionManager.authToken = user.savedAuthToken
                sessionManager.refreshToken = user.savedRefreshToken

                // Try to refresh mobile session if refresh token exists
                val refreshToken = user.savedRefreshToken
                var sessionValid = false
                if (!refreshToken.isNullOrBlank()) {
                    try {
                        val service = NetworkClient.getService(sessionManager)
                        val refreshRes = service.refreshMobileSession(MobileRefreshRequest(refreshToken))
                        if (refreshRes.isSuccessful && refreshRes.body()?.success == true) {
                            refreshRes.body()?.token?.let { sessionManager.authToken = it }
                            refreshRes.body()?.refreshToken?.let { sessionManager.refreshToken = it }
                            val perms = refreshRes.body()?.permissions
                            if (perms != null) {
                                val pJson = Gson().toJson(perms)
                                sessionManager.permissionsJson = pJson
                                _permissionsJson.value = pJson
                            }
                            sessionValid = true
                        }
                    } catch (_: Exception) {}
                }

                // If tokens exist or offline tolerance
                if (sessionValid || !sessionManager.authToken.isNullOrBlank()) {
                    sessionManager.isLoggedIn = true
                    _isLoggedIn.value = true
                    multiUserManager.setActiveUserId(user.id)
                    multiUserManager.saveUser(user.copy(
                        savedAuthToken = sessionManager.authToken,
                        savedRefreshToken = sessionManager.refreshToken
                    ))
                    refreshMultiUsers()
                    hydrateFromCache(user.id, user.identifier)
                    onResult(true, null)
                } else {
                    val msg = "Biometric session expired. Please enter your password."
                    _errorMessage.value = msg
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                val msg = "Biometric login failed: ${e.localizedMessage}"
                _errorMessage.value = msg
                onResult(false, msg)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun saveRememberedProfile(
        identifier: String,
        displayName: String? = null,
        displayPicture: String? = null,
        role: String? = null,
        isBiometricEnabled: Boolean = false,
        authToken: String? = sessionManager.authToken,
        refreshToken: String? = sessionManager.refreshToken
    ): RememberedUser {
        val finalIdentifier = (sessionManager.userEmail?.takeIf { it.isNotBlank() } ?: identifier).trim()
        val finalName = displayName ?: sessionManager.userName ?: identifier.substringBefore('@')
        val finalPic = displayPicture ?: sessionManager.userPicture
        val isOwnerAccount = finalIdentifier.contains("faizal", ignoreCase = true) ||
                finalIdentifier.contains("fazztronic", ignoreCase = true) ||
                finalName.contains("faizal", ignoreCase = true)
        val finalRole = if (isOwnerAccount) "owner" else "worker"
        val user = RememberedUser(
            id = sessionManager.userId ?: ("usr_" + System.currentTimeMillis().toString(36)),
            identifier = finalIdentifier,
            displayName = finalName,
            displayPicture = finalPic,
            role = finalRole,
            isBiometricEnabled = isBiometricEnabled,
            savedAuthToken = authToken,
            savedRefreshToken = refreshToken
        )
        val saved = multiUserManager.saveUser(user)
        multiUserManager.setActiveUserId(saved.id)
        refreshMultiUsers()
        return saved
    }

    fun fetchSecurityChallenge(identifier: String, onResult: (Boolean, AuthChallengeResponse?, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.getAuthChallenge(identifier.trim())
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.error != null) {
                        onResult(false, null, body.error)
                    } else {
                        onResult(true, body, null)
                    }
                } else {
                    val errorMsg = "No account found with this username or email."
                    onResult(false, null, errorMsg)
                }
            } catch (e: Exception) {
                onResult(false, null, "Connection error: ${e.localizedMessage}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun verifySecurityAnswer(identifier: String, answer: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.verifySecurityAnswer(VerifyAnswerRequest(identifier.trim(), answer.trim()))
                if (response.isSuccessful && response.body()?.success == true) {
                    onResult(true, null)
                } else {
                    val msg = response.body()?.message ?: "Incorrect answer. Please try again."
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, "Connection error: ${e.localizedMessage}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun resetPassword(newPassword: String, identifier: String? = null, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val service = NetworkClient.getService(sessionManager)
                val req = ResetPasswordSecurityRequest(
                    newPassword = newPassword,
                    identifier = identifier,
                    email = null,
                    username = null,
                    securityQuestion = null,
                    securityAnswer = null
                )
                val response = service.updateSecurity(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    onResult(true, null)
                } else {
                    val errorStr = response.errorBody()?.string()
                    val parsedMsg = try {
                        if (!errorStr.isNullOrBlank()) {
                            val obj = org.json.JSONObject(errorStr)
                            obj.optString("error").ifBlank { obj.optString("message") }
                        } else null
                    } catch (_: Exception) { null }
                    val msg = parsedMsg?.ifBlank { null } ?: response.body()?.message ?: "Failed to update password."
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, "Connection error: ${e.localizedMessage}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun checkUsernameAvailability(username: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.checkUsername(username.trim())
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    onResult(body.available, body.message)
                } else {
                    onResult(false, "Username check failed")
                }
            } catch (e: Exception) {
                onResult(false, e.localizedMessage)
            }
        }
    }

    fun updateWorkerCredentials(
        identifier: String,
        isEmail: Boolean,
        password: String,
        question: String,
        answer: String,
        onResult: (Boolean, String?) -> Unit
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val service = NetworkClient.getService(sessionManager)
                val req = ResetPasswordSecurityRequest(
                    newPassword = password,
                    securityQuestion = question,
                    securityAnswer = answer,
                    identifier = identifier,
                    email = if (isEmail) identifier else null,
                    username = if (!isEmail) identifier else null
                )
                val response = service.updateSecurity(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    onResult(true, null)
                } else {
                    val errorStr = response.errorBody()?.string()
                    val parsedMsg = try {
                        if (!errorStr.isNullOrBlank()) {
                            val obj = org.json.JSONObject(errorStr)
                            obj.optString("error").ifBlank { obj.optString("message") }
                        } else null
                    } catch (_: Exception) { null }
                    val msg = parsedMsg?.ifBlank { null } ?: response.body()?.message ?: "Unable to save credentials."
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, "Connection error: ${e.localizedMessage}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun googleWorkerLogin(idToken: String, onResult: (Boolean, String?, Map<String, Any?>?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.googleWorkerLogin(
                    mapOf(
                        "idToken" to idToken,
                        "deviceName" to android.os.Build.MODEL,
                        "deviceType" to "Android"
                    )
                )
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val status = body["status"] as? String ?: "pending"
                    if (status == "active") {
                        val token = body["token"] as? String
                        val refreshToken = body["refreshToken"] as? String
                        val role = body["role"] as? String ?: "worker"
                        val updateChannel = body["updateChannel"] as? String ?: "production"
                        val userObj = body["user"] as? Map<*, *>
                        
                        sessionManager.authToken = token
                        sessionManager.refreshToken = refreshToken
                        sessionManager.userRole = role
                        sessionManager.userStatus = status
                        sessionManager.updateChannel = updateChannel
                        userObj?.let {
                            sessionManager.userId = it["id"] as? String
                            sessionManager.userName = it["name"] as? String
                            sessionManager.userEmail = it["email"] as? String
                            sessionManager.userPicture = it["picture"] as? String
                        }
                        onResult(true, null, body)
                    } else {
                        val msg = (body["message"] as? String)
                            ?: (body["error"] as? String)
                            ?: "Account is pending approval or inactive."
                        _errorMessage.value = msg
                        onResult(false, msg, body)
                    }
                } else {
                    val errorBody = try { response.errorBody()?.string() } catch (e: Exception) { null }
                    val msg = if (!errorBody.isNullOrBlank() && errorBody.contains("\"message\":")) {
                        try {
                            com.google.gson.JsonParser.parseString(errorBody).asJsonObject.get("message")?.asString
                        } catch (e: Exception) { null }
                    } else null
                    val finalMsg = msg ?: "Google sign-in failed. Please try again."
                    _errorMessage.value = finalMsg
                    onResult(false, finalMsg, null)
                }
            } catch (e: Exception) {
                val msg = "Connection error: ${e.localizedMessage ?: e.message}"
                _errorMessage.value = msg
                onResult(false, msg, null)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun checkWorkerStatus(inviteCode: String?, email: String?, onResult: (Boolean, Map<String, Any?>?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.checkWorkerStatus(
                    inviteCode = inviteCode,
                    email = email,
                    platform = "Android",
                    deviceName = android.os.Build.MODEL
                )
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val isApproved = body["approved"] == true || body["status"] == "active"
                    if (isApproved) {
                        val token = body["token"] as? String
                        val refreshToken = body["refreshToken"] as? String
                        val role = body["role"] as? String ?: "worker"
                        val updateChannel = body["updateChannel"] as? String ?: "production"
                        val userObj = body["user"] as? Map<*, *>

                        sessionManager.isLoggedIn = true
                        sessionManager.authToken = token
                        sessionManager.refreshToken = refreshToken
                        sessionManager.userRole = role
                        sessionManager.userStatus = "active"
                        sessionManager.updateChannel = updateChannel
                        userObj?.let {
                            sessionManager.userId = it["id"] as? String
                            sessionManager.userName = it["name"] as? String
                            sessionManager.userEmail = it["email"] as? String
                            sessionManager.userPicture = it["picture"] as? String
                        }
                        val permsObj = body["permissions"]
                        if (permsObj != null) {
                            val pJson = Gson().toJson(permsObj)
                            sessionManager.permissionsJson = pJson
                            _permissionsJson.value = pJson
                        } else if (role == "owner") {
                            sessionManager.permissionsJson = null
                            _permissionsJson.value = null
                        }
                        _isLoggedIn.value = true
                        sessionManager.userId?.let { hydrateFromCache(it) }
                        loadAllData()
                    }
                    onResult(isApproved, body)
                } else {
                    onResult(false, null)
                }
            } catch (_: Exception) {
                onResult(false, null)
            }
        }
    }

    fun logout() {
        val refreshTokenToRevoke = sessionManager.refreshToken
        val service = try { NetworkClient.getService(sessionManager) } catch (_: Exception) { null }

        // WIPE stored tokens for active user in MultiUserManager so revoked tokens cannot linger
        val activeUser = multiUserManager.getActiveUser()
        if (activeUser != null) {
            multiUserManager.saveUser(
                activeUser.copy(
                    savedAuthToken = null,
                    savedRefreshToken = null
                )
            )
        }

        // Immediately purge local credentials and reset UI state on Main thread
        sessionManager.clearSession()
        sessionManager.biometricEnabled = false
        _biometricEnabled.value = false
        _permissionsJson.value = null
        NetworkClient.resetClient()
        _profile.value = null
        _contacts.value = emptyList()
        _products.value = emptyList()
        _bills.value = emptyList()
        _billingSummary.value = null
        _analyticsSummary.value = null
        _executiveKPI.value = null
        _salesTrends.value = emptyList()
        _topProducts.value = emptyList()
        _topCustomers.value = emptyList()
        _salesDeepDive.value = null
        _orderFunnel.value = null
        _arAging.value = null
        _rfmSegmentation.value = emptyList()
        _productVelocity.value = null
        _categoryPerformance.value = emptyList()
        _comparativeYoY.value = null
        _comparativeMoM.value = emptyList()
        _comparativeQoQ.value = emptyList()
        _isDataCached.value = false
        _isSyncingLive.value = false
        _lastSyncTimestamp.value = null
        _changedMetricKeys.value = emptySet()
        _devices.value = emptyList()
        _errorMessage.value = null
        _isLoggedIn.value = false
        refreshMultiUsers()

        // Asynchronously notify backend in fire-and-forget background job with 3-second timeout
        if (!refreshTokenToRevoke.isNullOrBlank() && service != null) {
            viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    kotlinx.coroutines.withTimeoutOrNull(3000L) {
                        service.logoutMobileSession(MobileRefreshRequest(refreshTokenToRevoke))
                    }
                } catch (_: Exception) {}
            }
        }
    }

    /**
     * Check if the app was recently updated and trigger post-install success notification.
     */
    private fun checkPostInstallSuccess() {
        val currentCode = BuildConfig.VERSION_CODE
        val lastCode = sessionManager.lastInstalledVersionCode

        if (lastCode > 0 && currentCode > lastCode) {
            AppUpdateNotificationManager.showPostInstallSuccessNotification(
                getApplication(),
                BuildConfig.VERSION_NAME,
                currentCode
            )
            AppUpdateUtils.clearCachedApk(getApplication(), sessionManager)
        }
        sessionManager.lastInstalledVersionCode = currentCode
    }

    /**
     * Fetch release lineage history from backend.
     */
    fun fetchUpdateHistory() {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.getAndroidUpdateHistory()
                if (response.isSuccessful) {
                    _updateHistory.value = response.body() ?: emptyList()
                }
            } catch (_: Exception) {}
        }
    }

    /**
     * Toggle background update checker setting.
     */
    fun setAutoUpdateCheckEnabled(enabled: Boolean) {
        sessionManager.autoUpdateCheckEnabled = enabled
        if (!enabled) {
            AppUpdateNotificationManager.dismissAllUpdateNotifications(getApplication())
        }
    }

    /**
     * Silent auto-check on startup with 24-hour cooldown.
     * Posts interactive notification if update is found.
     */
    private fun silentUpdateCheckIfDue() {
        if (!sessionManager.autoUpdateCheckEnabled) return

        val prefs = getApplication<Application>().getSharedPreferences(UPDATE_PREFS_NAME, Context.MODE_PRIVATE)
        val lastCheck = prefs.getLong(KEY_LAST_UPDATE_CHECK, 0L)
        val now = System.currentTimeMillis()

        if (now - lastCheck < UPDATE_CHECK_COOLDOWN_MS) return

        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.getAndroidUpdateManifest()
                if (response.isSuccessful) {
                    val manifest = response.body()
                    val currentVersionCode = BuildConfig.VERSION_CODE
                    val currentVersionName = BuildConfig.VERSION_NAME
                    val remoteVersionCode = manifest?.versionCode ?: 0
                    val remoteVersionName = manifest?.versionName ?: currentVersionName
                    val shouldUpdate = remoteVersionCode > currentVersionCode ||
                            AppUpdateUtils.isNewerVersion(remoteVersionName, currentVersionName)

                    if (shouldUpdate && manifest != null) {
                        _updateManifest.value = manifest
                        _updateState.value = AndroidUpdateUiState.Available(manifest)
                        AppUpdateNotificationManager.showUpdateAvailableNotification(
                            getApplication(),
                            manifest
                        )
                    }

                    prefs.edit().putLong(KEY_LAST_UPDATE_CHECK, now).apply()
                }
            } catch (_: Exception) {
                // Silent
            }
        }
    }

    /**
     * Manual update check — evaluates cached APKs, server manifests, and version conflicts.
     */
    fun checkForAndroidUpdate(onComplete: ((Boolean, String?) -> Unit)? = null) {
        viewModelScope.launch {
            _updateState.value = AndroidUpdateUiState.Checking
            fetchUpdateHistory()
            try {
                val currentVersionCode = BuildConfig.VERSION_CODE
                val currentVersionName = BuildConfig.VERSION_NAME

                val service = NetworkClient.getService(sessionManager)
                val response = service.getAndroidUpdateManifest()
                val manifest = if (response.isSuccessful) response.body() else null
                if (manifest != null) {
                    _updateManifest.value = manifest
                }

                // Check cached APK validity & SHA-256 anti-corruption
                val hasCached = AppUpdateUtils.hasValidCachedApk(
                    getApplication(),
                    sessionManager,
                    currentVersionCode,
                    expectedSha256 = if (manifest != null && sessionManager.cachedApkVersionCode == manifest.versionCode) manifest.sha256 else null
                )
                val cachedFile = AppUpdateUtils.getCachedApkFile(sessionManager)
                val cachedCode = sessionManager.cachedApkVersionCode
                val cachedName = sessionManager.cachedApkVersionName ?: "1.0.0"

                if (response.isSuccessful) {
                    val manifest = response.body()
                    _updateManifest.value = manifest

                    val remoteVersionCode = manifest?.versionCode ?: 0
                    val remoteVersionName = manifest?.versionName ?: currentVersionName
                    val serverIsNewerThanCurrent = remoteVersionCode > currentVersionCode ||
                            AppUpdateUtils.isNewerVersion(remoteVersionName, currentVersionName)

                    val serverIsNewerThanCached = hasCached && (
                            remoteVersionCode > cachedCode ||
                                    AppUpdateUtils.isNewerVersion(remoteVersionName, cachedName)
                            )

                    when {
                        // Conflict: cached APK exists, but server has a strictly newer version
                        serverIsNewerThanCached && manifest != null -> {
                            _updateState.value = AndroidUpdateUiState.VersionConflict(
                                cachedVersionName = cachedName,
                                cachedVersionCode = cachedCode,
                                serverManifest = manifest
                            )
                            AppUpdateNotificationManager.showUpdateAvailableNotification(
                                getApplication(),
                                manifest
                            )
                            onComplete?.invoke(true, "A newer update (v${manifest.versionName}) is available than your cached download.")
                        }

                        // Cached download is valid and up to date with server
                        hasCached && cachedFile != null -> {
                            _updateState.value = AndroidUpdateUiState.CachedAvailable(
                                cachedFile = cachedFile,
                                versionName = cachedName,
                                versionCode = cachedCode
                            )
                            onComplete?.invoke(true, "Cached update v$cachedName is ready to install.")
                        }

                        // Server has a newer update (no cached file)
                        serverIsNewerThanCurrent && manifest != null -> {
                            val preflight = AppUpdateUtils.runPreflightChecks(
                                getApplication(),
                                manifest.fileSize,
                                manifest.minSdkVersion
                            )
                            _preflightWarnings.value = preflight.warnings

                            if (!preflight.canProceed) {
                                _updateState.value = AndroidUpdateUiState.Error(
                                    preflight.errors.joinToString("\n"),
                                    retryable = false
                                )
                            } else {
                                _updateState.value = AndroidUpdateUiState.Available(manifest)
                                AppUpdateNotificationManager.showUpdateAvailableNotification(
                                    getApplication(),
                                    manifest
                                )
                            }
                            onComplete?.invoke(true, manifest.releaseNotes)
                        }

                        else -> {
                            _updateState.value = AndroidUpdateUiState.UpToDate
                            onComplete?.invoke(false, null)
                        }
                    }

                    val prefs = getApplication<Application>().getSharedPreferences(UPDATE_PREFS_NAME, Context.MODE_PRIVATE)
                    prefs.edit().putLong(KEY_LAST_UPDATE_CHECK, System.currentTimeMillis()).apply()

                } else if (hasCached && cachedFile != null) {
                    // Offline fallback: use cached APK
                    _updateState.value = AndroidUpdateUiState.CachedAvailable(
                        cachedFile = cachedFile,
                        versionName = cachedName,
                        versionCode = cachedCode
                    )
                    onComplete?.invoke(true, "Server unreachable, but cached update v$cachedName is ready.")
                } else {
                    _updateState.value = AndroidUpdateUiState.Error("Unable to contact update server (HTTP ${response.code()})")
                    onComplete?.invoke(false, null)
                }
            } catch (e: Exception) {
                val hasCached = AppUpdateUtils.hasValidCachedApk(getApplication(), sessionManager, BuildConfig.VERSION_CODE)
                val cachedFile = AppUpdateUtils.getCachedApkFile(sessionManager)
                if (hasCached && cachedFile != null) {
                    _updateState.value = AndroidUpdateUiState.CachedAvailable(
                        cachedFile = cachedFile,
                        versionName = sessionManager.cachedApkVersionName ?: "1.0.0",
                        versionCode = sessionManager.cachedApkVersionCode
                    )
                    onComplete?.invoke(true, "Offline: cached update ready to install.")
                } else {
                    _updateState.value = AndroidUpdateUiState.Error(e.localizedMessage ?: "Update check failed")
                    onComplete?.invoke(false, null)
                }
            }
        }
    }

    /**
     * Download the update APK using the enterprise update engine, verify integrity, and install.
     */
    fun downloadAndInstallAndroidUpdate(context: Context, onComplete: ((Boolean, String?) -> Unit)? = null) {
        viewModelScope.launch {
            _updateState.value = AndroidUpdateUiState.Downloading()
            try {
                val manifest = _updateManifest.value
                if (manifest == null) {
                    _updateState.value = AndroidUpdateUiState.Error("No update manifest available. Check for updates first.")
                    onComplete?.invoke(false, "No manifest")
                    return@launch
                }

                val apkUrl = manifest.apkUrl.takeIf { it.isNotBlank() }
                if (apkUrl == null) {
                    _updateState.value = AndroidUpdateUiState.Error("Update manifest has no download URL.")
                    onComplete?.invoke(false, "No APK URL")
                    return@launch
                }

                // Resolve relative URLs
                val resolvedApkUrl = if (apkUrl.startsWith("http")) {
                    apkUrl
                } else {
                    val base = sessionManager.serverUrl.removeSuffix("/api/").removeSuffix("/")
                    if (apkUrl.startsWith("/")) "$base$apkUrl" else "$base/$apkUrl"
                }

                val outputFile = File(
                    context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    manifest.fileName ?: "latest.apk"
                )

                // Clean up old APKs before downloading
                AppUpdateUtils.cleanupOldApks(context, keepFile = null)

                // Download with progress tracking, SHA-256 verification, and retry
                val result = AppUpdateUtils.downloadApkWithProgress(
                    apkUrl = resolvedApkUrl,
                    outputFile = outputFile,
                    expectedSha256 = manifest.sha256,
                    expectedSize = manifest.fileSize,
                    onProgress = { progress ->
                        _updateState.value = AndroidUpdateUiState.Downloading(
                            progress = progress.progress,
                            downloadedMB = progress.downloadedMB,
                            totalMB = progress.totalMB
                        )
                        // Post ongoing notification
                        val pct = (progress.progress * 100).toInt()
                        AppUpdateNotificationManager.showDownloadingNotification(
                            getApplication(),
                            pct,
                            progress.downloadedMB,
                            progress.totalMB
                        )
                    }
                )

                when (result) {
                    is AppUpdateUtils.DownloadResult.Success -> {
                        _updateState.value = AndroidUpdateUiState.Verifying("Integrity verified ✓")
                        _updateState.value = AndroidUpdateUiState.ReadyToInstall(result.file)

                        // Save cached APK metadata
                        sessionManager.setCachedApkInfo(
                            result.file.absolutePath,
                            manifest.versionCode,
                            manifest.versionName
                        )

                        // Show Ready to Install Notification
                        AppUpdateNotificationManager.showReadyToInstallNotification(
                            getApplication(),
                            result.file,
                            manifest.versionName,
                            manifest.versionCode
                        )

                        // Check install permission before opening prompt
                        if (!AppUpdateUtils.canInstallPackages(context)) {
                            AppUpdateUtils.openInstallPermissionSettings(context)
                        } else {
                            AppUpdateUtils.openInstallPrompt(context, result.file)
                        }
                        onComplete?.invoke(true, "Update downloaded and verified")
                    }
                    is AppUpdateUtils.DownloadResult.Error -> {
                        _updateState.value = AndroidUpdateUiState.Error(
                            result.message,
                            retryable = result.retryable
                        )
                        onComplete?.invoke(false, result.message)
                    }
                }
            } catch (e: Exception) {
                _updateState.value = AndroidUpdateUiState.Error(
                    e.localizedMessage ?: "Download failed unexpectedly"
                )
                onComplete?.invoke(false, e.localizedMessage)
            }
        }
    }

    /**
     * Reset the update state back to Idle (e.g., after dismissing an error).
     */
    fun resetUpdateState() {
        _updateState.value = AndroidUpdateUiState.Idle
        _preflightWarnings.value = emptyList()
    }

    /**
     * Launch installer for a cached APK.
     */
    fun installCachedApk(context: Context) {
        val file = AppUpdateUtils.getCachedApkFile(sessionManager)
        if (file != null) {
            val versionName = sessionManager.cachedApkVersionName ?: "1.0.0"
            val versionCode = sessionManager.cachedApkVersionCode
            _updateState.value = AndroidUpdateUiState.ReadyToInstall(file)
            AppUpdateNotificationManager.showReadyToInstallNotification(context, file, versionName, versionCode)
            if (!AppUpdateUtils.canInstallPackages(context)) {
                AppUpdateUtils.openInstallPermissionSettings(context)
            } else {
                AppUpdateUtils.openInstallPrompt(context, file)
            }
        } else {
            _updateState.value = AndroidUpdateUiState.Error("Cached update file not found.")
        }
    }

    /**
     * Delete cached APK from device storage and reset state.
     */
    fun deleteCachedApk(context: Context) {
        AppUpdateUtils.clearCachedApk(context, sessionManager)
        AppUpdateNotificationManager.dismissAllUpdateNotifications(context)
        _updateState.value = AndroidUpdateUiState.Idle
        checkForAndroidUpdate()
    }

    /**
     * User chooses "Download Newest" during a version conflict.
     * Clears old cached APK and downloads server version.
     */
    fun resolveConflictUseServerVersion(context: Context, serverManifest: AndroidUpdateManifest) {
        AppUpdateUtils.clearCachedApk(getApplication(), sessionManager)
        _updateManifest.value = serverManifest
        _updateState.value = AndroidUpdateUiState.Available(serverManifest)
        downloadAndInstallAndroidUpdate(context)
    }

    /**
     * User chooses "Install Cached" during a version conflict.
     */
    fun resolveConflictUseCachedVersion(context: Context) {
        installCachedApk(context)
    }

    fun loadAllData() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        loadProfile()
        loadDevices()
        loadSecurityStatus()
        loadProducts()
        loadContacts()
        loadBills()
        loadAnalytics()
    }

    // ==================== PROFILE & DEVICES ====================
    fun loadProfile() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getProfile()
                if (res.isSuccessful && res.body()?.profile != null) {
                    val p = res.body()!!.profile!!
                    _profile.value = p
                    val name = p.actualName ?: p.displayName ?: p.fullName ?: p.username
                    val email = p.actualEmail ?: p.displayEmail ?: p.emailId ?: p.email
                    val pic = p.actualPicture ?: p.displayPicture ?: p.profilePicture ?: p.googlePicture

                    if (!name.isNullOrBlank()) sessionManager.userName = name
                    if (!email.isNullOrBlank()) sessionManager.userEmail = email
                    if (!pic.isNullOrBlank()) sessionManager.userPicture = pic

                    // Seamlessly update cached profile in MultiUserManager if anything updated on server
                    val activeId = sessionManager.userId ?: p.id
                    val activeIdent = email ?: sessionManager.userEmail
                    val users = multiUserManager.getUsers()
                    val existing = users.find {
                        (!activeId.isNullOrBlank() && it.id == activeId) ||
                        (!activeIdent.isNullOrBlank() && it.identifier.equals(activeIdent, ignoreCase = true))
                    }
                    if (existing != null) {
                        if (existing.displayName != name || existing.identifier != email || existing.displayPicture != pic) {
                            multiUserManager.saveUser(
                                existing.copy(
                                    displayName = name ?: existing.displayName,
                                    identifier = email ?: existing.identifier,
                                    displayPicture = pic ?: existing.displayPicture
                                )
                            )
                            refreshMultiUsers()
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    fun updateProfile(
        fullName: String,
        email: String,
        profilePicture: String? = null,
        onComplete: (Boolean, String?) -> Unit = { _, _ -> }
    ) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val req = UpdateProfileRequest(
                    full_name = fullName.trim(),
                    email_id = email.trim(),
                    profile_picture = profilePicture
                )
                val res = service.updateProfile(req)
                if (res.isSuccessful && res.body()?.success == true) {
                    sessionManager.userName = fullName.trim()
                    sessionManager.userEmail = email.trim()
                    if (!profilePicture.isNullOrBlank()) {
                        sessionManager.userPicture = profilePicture
                    }
                    val activeUser = multiUserManager.getActiveUser()
                    if (activeUser != null) {
                        multiUserManager.saveUser(
                            activeUser.copy(
                                displayName = fullName.trim(),
                                identifier = email.trim(),
                                displayPicture = profilePicture ?: activeUser.displayPicture
                            )
                        )
                        refreshMultiUsers()
                    }
                    loadProfile()
                    onComplete(true, null)
                } else {
                    val errStr = res.errorBody()?.string()
                    val msg = try {
                        if (!errStr.isNullOrBlank()) org.json.JSONObject(errStr).optString("error") else null
                    } catch (_: Exception) { null } ?: "Failed to update profile"
                    onComplete(false, msg)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun updateProfile(fullName: String, email: String, onComplete: (Boolean) -> Unit) {
        updateProfile(fullName, email, null) { success, _ -> onComplete(success) }
    }

    fun changePassword(newPassword: String, onResult: (Boolean, String?) -> Unit) {
        changePassword("", newPassword, onResult)
    }

    fun changePassword(oldPassword: String, newPassword: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val req = ResetPasswordSecurityRequest(
                    newPassword = newPassword,
                    identifier = sessionManager.userEmail
                )
                val response = service.updateSecurity(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    _passwordSet.value = true
                    onResult(true, null)
                } else {
                    val errorStr = response.errorBody()?.string()
                    val parsedMsg = try {
                        if (!errorStr.isNullOrBlank()) {
                            val obj = org.json.JSONObject(errorStr)
                            obj.optString("error").ifBlank { obj.optString("message") }
                        } else null
                    } catch (_: Exception) { null }
                    val msg = parsedMsg?.ifBlank { null } ?: response.body()?.message ?: "Failed to update password."
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, e.localizedMessage ?: "Failed to change password")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateSecurityQuestion(question: String, answer: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val req = ResetPasswordSecurityRequest(
                    newPassword = null,
                    securityQuestion = question.trim(),
                    securityAnswer = answer.trim(),
                    identifier = sessionManager.userEmail
                )
                val response = service.updateSecurity(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    _hasSecurityQuestion.value = true
                    onResult(true, null)
                } else {
                    val errorStr = response.errorBody()?.string()
                    val parsedMsg = try {
                        if (!errorStr.isNullOrBlank()) {
                            val obj = org.json.JSONObject(errorStr)
                            obj.optString("error").ifBlank { obj.optString("message") }
                        } else null
                    } catch (_: Exception) { null }
                    val msg = parsedMsg?.ifBlank { null } ?: response.body()?.message ?: "Failed to update security question."
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, e.localizedMessage ?: "Failed to update security question")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun registerMobileBiometric(
        deviceId: String? = null,
        deviceName: String? = null,
        deviceModel: String? = null,
        credentialPayload: Map<String, Any>? = null,
        onResult: (Boolean, String?) -> Unit
    ) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val resolvedName = deviceName ?: deviceModel ?: "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
                val req = MobileBiometricRegisterRequest(
                    deviceId = deviceId ?: sessionManager.userId ?: android.os.Build.MODEL,
                    deviceName = resolvedName,
                    biometricType = "biometric"
                )
                val response = service.registerMobileBiometric(req)
                if (response.isSuccessful && response.body()?.success == true) {
                    sessionManager.biometricEnabled = true
                    _biometricEnabled.value = true
                    val activeUser = multiUserManager.getActiveUser()
                    if (activeUser != null) {
                        multiUserManager.saveUser(activeUser.copy(isBiometricEnabled = true))
                        refreshMultiUsers()
                    }
                    onResult(true, null)
                } else {
                    val errStr = response.errorBody()?.string()
                    val msg = try {
                        if (!errStr.isNullOrBlank()) org.json.JSONObject(errStr).optString("error") else null
                    } catch (_: Exception) { null } ?: response.body()?.message ?: "Failed to register biometrics on server"
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, e.localizedMessage ?: "Failed to register biometrics")
            }
        }
    }

    fun revokeMobileBiometric(deviceId: String? = null, onResult: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                service.revokeMobileBiometric()
            } catch (_: Exception) {}
            sessionManager.biometricEnabled = false
            _biometricEnabled.value = false
            val activeUser = multiUserManager.getActiveUser()
            if (activeUser != null) {
                multiUserManager.saveUser(activeUser.copy(isBiometricEnabled = false))
                refreshMultiUsers()
            }
            onResult(true, null)
        }
    }

    fun switchActiveUser(user: RememberedUser) {
        multiUserManager.setActiveUserId(user.id)
        refreshMultiUsers()

        // Atomic teardown of prior user state
        NetworkClient.resetClient()
        _profile.value = null
        _contacts.value = emptyList()
        _products.value = emptyList()
        _bills.value = emptyList()
        _devices.value = emptyList()
        _errorMessage.value = null

        if (!user.savedAuthToken.isNullOrBlank()) {
            sessionManager.userId = user.id
            sessionManager.userName = user.displayName
            sessionManager.userEmail = user.identifier
            sessionManager.userRole = user.role
            sessionManager.userStatus = "active"
            sessionManager.authToken = user.savedAuthToken
            sessionManager.refreshToken = user.savedRefreshToken
            sessionManager.biometricEnabled = user.isBiometricEnabled

            // Immediately populate _profile from target user credentials
            _profile.value = ProfileData(
                id = user.id,
                username = user.displayName,
                role = user.role,
                fullName = user.displayName,
                emailId = user.identifier,
                email = user.identifier,
                displayName = user.displayName,
                displayEmail = user.identifier,
                displayPicture = user.displayPicture
            )

            sessionManager.isLoggedIn = true
            _isLoggedIn.value = true
            loadAllData()
        } else {
            sessionManager.clearSession()
            sessionManager.userId = user.id
            sessionManager.userName = user.displayName
            sessionManager.userEmail = user.identifier
            sessionManager.userRole = user.role
            sessionManager.biometricEnabled = user.isBiometricEnabled
            _isLoggedIn.value = false
        }
    }

    fun disconnectGoogle(onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val response = service.disconnectGoogle()
                if (response.isSuccessful && response.body()?.success == true) {
                    loadProfile()
                    onResult(true, null)
                } else {
                    val errStr = response.errorBody()?.string()
                    val msg = try {
                        if (!errStr.isNullOrBlank()) org.json.JSONObject(errStr).optString("error") else null
                    } catch (_: Exception) { null } ?: "Failed to disconnect Google account"
                    onResult(false, msg)
                }
            } catch (e: Exception) {
                onResult(false, e.localizedMessage)
            }
        }
    }

    fun loadDevices() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getDevices()
                if (res.isSuccessful) {
                    _devices.value = res.body()?.devices ?: emptyList()
                }
            } catch (_: Exception) {}
        }
    }

    fun logoutDevice(deviceId: String) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.logoutDevice(deviceId)
                if (res.isSuccessful) {
                    loadDevices()
                }
            } catch (_: Exception) {}
        }
    }

    fun logoutAllDevices() {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.logoutAllDevices()
                if (res.isSuccessful) {
                    logout()
                }
            } catch (_: Exception) {}
        }
    }

    // ==================== SECURITY & AUTH ====================
    fun loadSecurityStatus() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getAuthStatus()
                if (res.isSuccessful) {
                    val status = res.body()
                    _passwordSet.value = status?.passwordSet == true
                    _hasSecurityQuestion.value = status?.hasSecurityQuestion == true
                }
            } catch (_: Exception) {}
        }
    }

    // ==================== PRODUCTS ====================
    fun loadProducts(query: String? = null) {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getProducts(search = query)
                if (res.isSuccessful) {
                    val prevCount = _products.value.size
                    val newProducts = res.body() ?: emptyList()
                    if (_isDataCached.value && prevCount != newProducts.size) {
                        addChangedMetric("products_count")
                    }
                    _products.value = newProducts
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveProducts(tId, newProducts)
                    }
                    _isDataCached.value = false
                    _isSyncingLive.value = false
                    _lastSyncTimestamp.value = System.currentTimeMillis()
                }
                val catRes = service.getCategories()
                if (catRes.isSuccessful) {
                    _categories.value = catRes.body() ?: emptyList()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Products load error: ${e.localizedMessage}"
                }
            }
        }
    }

    fun createProduct(product: Product, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.createProduct(product)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun updateProduct(productId: String, product: Product, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.updateProduct(productId, product)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun deleteProduct(productId: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.deleteProduct(productId)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    // ==================== CATEGORIES ====================
    fun createCategory(name: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.createCategory(mapOf("name" to name))
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun updateCategory(categoryId: String, newName: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.updateCategory(categoryId, mapOf("name" to newName))
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun deleteCategory(categoryId: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.deleteCategory(categoryId)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    // ==================== VARIANTS & BATCHES ====================
    fun createVariant(productId: String, packSizeValue: Double, packSizeType: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val payload = mapOf<String, Any>(
                    "product_id" to productId,
                    "pack_size_value" to packSizeValue,
                    "pack_size_type" to packSizeType
                )
                val res = service.createVariant(payload)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun createBatch(variantId: String, batchNo: String, mrp: Double, mfgDate: String?, expDate: String?, unitsSold: Int = 0, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val payload = mutableMapOf<String, Any>(
                    "variant_id" to variantId,
                    "batch_no" to batchNo,
                    "mrp" to mrp,
                    "units_sold" to unitsSold
                )
                mfgDate?.let { payload["mfg_date"] = it }
                expDate?.let { payload["exp_date"] = it }

                val res = service.createBatch(payload)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun deleteBatch(batchId: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.deleteBatch(batchId)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun updateVariant(variantId: String, packSizeValue: Double, packSizeType: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val payload = mapOf<String, Any>(
                    "pack_size_value" to packSizeValue,
                    "pack_size_type" to packSizeType
                )
                val res = service.updateVariant(variantId, payload)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    fun updateBatch(batchId: String, batchNo: String, mrp: Double, mfgDate: String?, expDate: String?, unitsSold: Int = 0, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val payload = mutableMapOf<String, Any>(
                    "batch_no" to batchNo,
                    "mrp" to mrp,
                    "units_sold" to unitsSold
                )
                mfgDate?.let { payload["mfg_date"] = it }
                expDate?.let { payload["exp_date"] = it }

                val res = service.updateBatch(batchId, payload)
                if (res.isSuccessful) {
                    loadProducts()
                    onComplete(true, null)
                } else {
                    val err = res.errorBody()?.string() ?: "HTTP ${res.code()}"
                    onComplete(false, err)
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    // ==================== CONTACTS ====================
    fun loadContacts() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getContacts()
                if (res.isSuccessful && res.body() != null) {
                    val body = res.body()!!
                    val array = if (body.isJsonArray) body.asJsonArray else body.asJsonObject?.get("data")?.asJsonArray ?: body.asJsonObject?.get("contacts")?.asJsonArray
                    val listType = object : com.google.gson.reflect.TypeToken<List<Contact>>() {}.type
                    val prevCount = _contacts.value.size
                    val newContacts: List<Contact> = array?.let { com.google.gson.Gson().fromJson(it, listType) } ?: emptyList()
                    if (_isDataCached.value && prevCount != newContacts.size) {
                        addChangedMetric("contacts_count")
                    }
                    _contacts.value = newContacts
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveContacts(tId, newContacts)
                    }
                    _isDataCached.value = false
                    _isSyncingLive.value = false
                    _lastSyncTimestamp.value = System.currentTimeMillis()
                } else {
                    val rawErr = res.errorBody()?.string()
                    val errMsg = try {
                        if (!rawErr.isNullOrBlank()) {
                            org.json.JSONObject(rawErr).optString("error", rawErr)
                        } else null
                    } catch (_: Exception) {
                        rawErr
                    } ?: "HTTP ${res.code()}"
                    if (res.code() == 401 || !sessionManager.isLoggedIn) {
                        android.util.Log.w("MainViewModel", "Contacts unauthorized or logged out: $errMsg")
                    } else {
                        _errorMessage.value = "Failed to load contacts: $errMsg"
                    }
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Contacts load error: ${e.localizedMessage}"
                }
            }
        }
    }

    fun createContact(contact: Contact, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.createContact(contact)
                if (res.isSuccessful) {
                    loadContacts()
                    onComplete(true, null)
                } else {
                    val rawErr = res.errorBody()?.string()
                    val errMsg = if (!rawErr.isNullOrEmpty()) rawErr else "HTTP ${res.code()} ${res.message()}"
                    _errorMessage.value = "Create contact error: $errMsg"
                    onComplete(false, errMsg)
                }
            } catch (e: Exception) {
                val errMsg = e.localizedMessage ?: "Connection error"
                _errorMessage.value = "Create contact exception: $errMsg"
                onComplete(false, errMsg)
            }
        }
    }

    fun updateContact(contact: Contact, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.updateContact(contact.id, contact)
                if (res.isSuccessful) {
                    loadContacts()
                    onComplete(true, null)
                } else {
                    val rawErr = res.errorBody()?.string()
                    val errMsg = if (!rawErr.isNullOrEmpty()) rawErr else "HTTP ${res.code()} ${res.message()}"
                    _errorMessage.value = "Update contact error: $errMsg"
                    onComplete(false, errMsg)
                }
            } catch (e: Exception) {
                val errMsg = e.localizedMessage ?: "Connection error"
                _errorMessage.value = "Update contact exception: $errMsg"
                onComplete(false, errMsg)
            }
        }
    }

    fun deleteContact(id: String, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.deleteContact(id)
                if (res.isSuccessful) {
                    loadContacts()
                    onComplete(true, null)
                } else {
                    val rawErr = res.errorBody()?.string()
                    val errMsg = if (!rawErr.isNullOrEmpty()) rawErr else "HTTP ${res.code()} ${res.message()}"
                    _errorMessage.value = "Delete contact error: $errMsg"
                    onComplete(false, errMsg)
                }
            } catch (e: Exception) {
                val errMsg = e.localizedMessage ?: "Connection error"
                _errorMessage.value = "Delete contact exception: $errMsg"
                onComplete(false, errMsg)
            }
        }
    }

    // ==================== BILLING ====================
    fun loadBills() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getBills()
                if (res.isSuccessful) {
                    val gson = Gson()
                    val body = res.body()
                    val array = if (body?.isJsonArray == true) body.asJsonArray else body?.asJsonObject?.get("data")?.asJsonArray ?: body?.asJsonObject?.get("transactions")?.asJsonArray
                    val listType = object : TypeToken<List<Bill>>() {}.type
                    val newBills: List<Bill> = array?.let { gson.fromJson(it, listType) } ?: emptyList()
                    _bills.value = newBills
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveBills(tId, newBills)
                    }
                }
                val sumRes = service.getBillingSummary()
                if (sumRes.isSuccessful) {
                    try {
                        val body = sumRes.body()
                        val gson = Gson()
                        val obj = when {
                            body?.isJsonObject == true -> body.asJsonObject
                            else -> null
                        }
                        val dataElem = obj?.get("data") ?: body
                        val summary = dataElem?.let { gson.fromJson(it, BillingSummary::class.java) }
                        _billingSummary.value = summary
                        val currentUserId = sessionManager.userId
                        val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                        val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                        if (summary != null) {
                            for (tId in targetIds) {
                                cacheManager.saveBillingSummary(tId, summary)
                            }
                        }
                    } catch (_: Exception) {
                        _billingSummary.value = null
                    }
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Bills load error: ${e.localizedMessage}"
                }
            }
        }
    }

    fun createBill(request: CreateBillRequest, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.createBill(request)
                if (res.isSuccessful) {
                    loadBills()
                    loadProducts()
                    loadAnalytics()
                    onComplete(true, null)
                } else {
                    onComplete(false, "Failed to create bill: ${res.code()}")
                }
            } catch (e: Exception) {
                onComplete(false, e.localizedMessage)
            }
        }
    }

    // ==================== ANALYTICS ====================
    fun loadAnalytics() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val uid = sessionManager.userId
                val dashRes = service.getDashboardSummary()
                if (dashRes.isSuccessful) {
                    val newSummary = dashRes.body()
                    if (_isDataCached.value && newSummary != null && _analyticsSummary.value != null) {
                        if (_analyticsSummary.value?.totalRevenue != newSummary.totalRevenue) {
                            addChangedMetric("analytics_revenue")
                        }
                        if (_analyticsSummary.value?.totalOrders != newSummary.totalOrders) {
                            addChangedMetric("analytics_orders")
                        }
                    }
                    _analyticsSummary.value = newSummary
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    if (newSummary != null) {
                        for (tId in targetIds) {
                            cacheManager.saveAnalyticsSummary(tId, newSummary)
                        }
                    }
                }

                val kpiRes = service.getExecutiveKPI()
                if (kpiRes.isSuccessful) {
                    val newKPI = kpiRes.body()
                    _executiveKPI.value = newKPI
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    if (newKPI != null) {
                        for (tId in targetIds) {
                            cacheManager.saveExecutiveKPI(tId, newKPI)
                        }
                    }
                }

                val trendRes = service.getSalesTrend()
                if (trendRes.isSuccessful) {
                    val trends = trendRes.body() ?: emptyList()
                    _salesTrends.value = trends
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveSalesTrends(tId, trends)
                    }
                }

                val topProdRes = service.getTopProducts()
                if (topProdRes.isSuccessful) {
                    val topProds = topProdRes.body() ?: emptyList()
                    _topProducts.value = topProds
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveTopProducts(tId, topProds)
                    }
                }

                val topCustRes = service.getTopCustomers()
                if (topCustRes.isSuccessful) {
                    val topCusts = topCustRes.body() ?: emptyList()
                    _topCustomers.value = topCusts
                    val currentUserId = sessionManager.userId
                    val currentEmail = sessionManager.userEmail?.takeIf { it.isNotBlank() }
                    val targetIds = listOfNotNull(currentUserId, currentEmail).distinct()
                    for (tId in targetIds) {
                        cacheManager.saveTopCustomers(tId, topCusts)
                    }
                }

                _isDataCached.value = false
                _isSyncingLive.value = false
                _lastSyncTimestamp.value = System.currentTimeMillis()

            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Analytics load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadSalesDeepDive(period: String = "monthly") {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getSalesDeepDive(period)
                if (res.isSuccessful) {
                    _salesDeepDive.value = res.body()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Sales deep dive load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadOrderFunnel() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getOrderFunnel()
                if (res.isSuccessful) {
                    _orderFunnel.value = res.body()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Order funnel load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadARAgingAndRFM() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val agingRes = service.getARAging()
                if (agingRes.isSuccessful) {
                    _arAging.value = agingRes.body()
                }
                val rfmRes = service.getRFMSegmentation()
                if (rfmRes.isSuccessful) {
                    _rfmSegmentation.value = rfmRes.body() ?: emptyList()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Aging & RFM load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadProductVelocity() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val velRes = service.getProductVelocity()
                if (velRes.isSuccessful) {
                    _productVelocity.value = velRes.body()
                }
                val catRes = service.getCategoryPerformance()
                if (catRes.isSuccessful) {
                    _categoryPerformance.value = catRes.body() ?: emptyList()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Product velocity load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadComparativeYoY() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getComparativeYoY("yoy")
                if (res.isSuccessful) {
                    _comparativeYoY.value = res.body()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "YoY analysis load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadComparativeMoM() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getComparativeMoM("mom")
                if (res.isSuccessful) {
                    _comparativeMoM.value = res.body() ?: emptyList()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "MoM analysis load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadComparativeQoQ() {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getComparativeQoQ("qoq")
                if (res.isSuccessful) {
                    _comparativeQoQ.value = res.body() ?: emptyList()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "QoQ analysis load error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun runCustomComparison(sA: String, eA: String, sB: String, eB: String) {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val res = service.getComparativeCustom("custom", sA, eA, sB, eB)
                if (res.isSuccessful) {
                    _comparativeCustom.value = res.body()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Custom comparison error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadCustomerStats(customerId: String) {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) return@launch
            _analyticsLoading.value = true
            try {
                val service = NetworkClient.getService(sessionManager)
                val statsRes = service.getCustomerStats(customerId)
                if (statsRes.isSuccessful) {
                    _selectedCustomerStats.value = statsRes.body()
                }
                val contactRes = service.getContact(customerId)
                if (contactRes.isSuccessful) {
                    _selectedCustomer.value = contactRes.body()
                }
            } catch (e: Exception) {
                if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
                    _errorMessage.value = "Customer stats error: ${e.localizedMessage}"
                }
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun clearSelectedCustomer() {
        _selectedCustomer.value = null
        _selectedCustomerStats.value = null
    }

    fun refreshAllAnalyticsData(onComplete: () -> Unit = {}) {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) {
            onComplete()
            return
        }
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) {
                onComplete()
                return@launch
            }
            _analyticsLoading.value = true
            try {
                loadAnalytics()
                loadContacts()
            } finally {
                _analyticsLoading.value = false
                onComplete()
            }
        }
    }
}

