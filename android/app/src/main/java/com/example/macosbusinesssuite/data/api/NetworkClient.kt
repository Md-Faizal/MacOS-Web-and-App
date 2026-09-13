package com.example.macosbusinesssuite.data.api

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkClient {

    private var currentBaseUrl: String? = null
    private var apiService: ApiService? = null
    private var activeOkHttpClient: OkHttpClient? = null
    @Volatile
    private var activeSessionManager: SessionManager? = null

    // Simple in-memory cookie storage for session preservation across API calls
    private val cookieStore = mutableMapOf<String, List<Cookie>>()

    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            synchronized(cookieStore) {
                cookieStore[url.host] = cookies
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            return synchronized(cookieStore) {
                cookieStore[url.host] ?: emptyList()
            }
        }
    }

    private val refreshLock = Any()

    val customGson: com.google.gson.Gson = com.google.gson.GsonBuilder()
        .registerTypeAdapter(Double::class.java, com.example.macosbusinesssuite.util.FlexibleDoubleAdapter())
        .registerTypeAdapter(Double::class.javaObjectType, com.example.macosbusinesssuite.util.FlexibleDoubleAdapter())
        .registerTypeAdapter(Int::class.java, com.example.macosbusinesssuite.util.FlexibleIntAdapter())
        .registerTypeAdapter(Int::class.javaObjectType, com.example.macosbusinesssuite.util.FlexibleIntAdapter())
        .registerTypeAdapter(String::class.java, com.example.macosbusinesssuite.util.FlexibleStringAdapter())
        .create()

    fun getService(sessionManager: SessionManager): ApiService {
        activeSessionManager = sessionManager
        val baseUrl = sessionManager.serverUrl

        if (apiService == null || currentBaseUrl != baseUrl) {
            currentBaseUrl = baseUrl

            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.NONE
            }

            val okHttpClient = OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .addInterceptor(logging)
                .addInterceptor { chain ->
                    val sm = activeSessionManager ?: sessionManager
                    val request = chain.request()
                    val path = request.url.encodedPath

                    val isPublicEndpoint = path.endsWith("/auth/login") ||
                            path.endsWith("/auth/google/worker-login") ||
                            path.endsWith("/auth/worker/status") ||
                            path.endsWith("/auth/check-username") ||
                            path.endsWith("/auth/challenge") ||
                            path.endsWith("/auth/challenge-question") ||
                            path.endsWith("/auth/status") ||
                            path.endsWith("/auth/username") ||
                            path.endsWith("/auth/mobile/refresh") ||
                            path.endsWith("/auth/mobile/logout") ||
                            path.endsWith("/auth/logout") ||
                            path.endsWith("/auth/verify-answer") ||
                            path.endsWith("/health")

                    val token = sm.authToken
                    if (!isPublicEndpoint && token.isNullOrBlank()) {
                        return@addInterceptor okhttp3.Response.Builder()
                            .request(request)
                            .protocol(okhttp3.Protocol.HTTP_1_1)
                            .code(401)
                            .message("Unauthorized: No token provided in session")
                            .body("{\"error\":\"Unauthorized: No token provided\"}".toResponseBody("application/json".toMediaType()))
                            .build()
                    }

                    val requestBuilder = request.newBuilder()
                    requestBuilder.header("X-API-Key", "test-api-key-1234")
                    requestBuilder.header("X-Client-Platform", "android")
                    requestBuilder.header("X-App-Type", "native_android")

                    if (!token.isNullOrBlank()) {
                        requestBuilder.header("Authorization", "Bearer $token")
                    }

                    chain.proceed(requestBuilder.build())
                }
                .authenticator { _, response ->
                    val path = response.request.url.encodedPath
                    if (path.endsWith("/auth/mobile/refresh") ||
                        path.endsWith("/auth/mobile/logout") ||
                        path.endsWith("/auth/logout") ||
                        path.endsWith("/auth/login")
                    ) {
                        return@authenticator null
                    }

                    if (responseCount(response) >= 3) {
                        return@authenticator null
                    }

                    val sm = activeSessionManager ?: sessionManager
                    val refreshToken = sm.refreshToken ?: return@authenticator null
                    synchronized(refreshLock) {
                        val currentToken = sm.authToken
                        val requestToken = response.request.header("Authorization")?.removePrefix("Bearer ")
                        if (!currentToken.isNullOrEmpty() && requestToken != currentToken) {
                            return@synchronized response.request.newBuilder()
                                .header("Authorization", "Bearer $currentToken")
                                .build()
                        }

                        val refreshBody = JSONObject().put("refreshToken", refreshToken)
                            .toString()
                            .toRequestBody("application/json".toMediaType())
                        val refreshRequest = Request.Builder()
                            .url(baseUrl + "auth/mobile/refresh")
                            .post(refreshBody)
                            .header("Content-Type", "application/json")
                            .build()
                        val refreshResponse = okHttpClientForRefresh(baseUrl).newCall(refreshRequest).execute()
                        refreshResponse.use { refreshed ->
                            if (!refreshed.isSuccessful) {
                                return@synchronized null
                            }
                            val payload = JSONObject(refreshed.body?.string() ?: return@synchronized null)
                            val accessToken = payload.optString("token").takeIf { it.isNotEmpty() }
                            val replacementRefresh = payload.optString("refreshToken").takeIf { it.isNotEmpty() }
                            if (accessToken == null || replacementRefresh == null) {
                                return@synchronized null
                            }
                            sm.authToken = accessToken
                            sm.refreshToken = replacementRefresh
                            response.request.newBuilder()
                                .header("Authorization", "Bearer $accessToken")
                                .build()
                        }
                    }
                }
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .build()

            activeOkHttpClient = okHttpClient

            val retrofit = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create(customGson))
                .build()

            apiService = retrofit.create(ApiService::class.java)
        }

        return apiService!!
    }

    fun clearCookies() {
        synchronized(cookieStore) {
            cookieStore.clear()
        }
    }

    fun resetClient() {
        apiService = null
        currentBaseUrl = null
        activeSessionManager = null
        clearCookies()
        try {
            activeOkHttpClient?.connectionPool?.evictAll()
        } catch (_: Exception) {}
        activeOkHttpClient = null
    }

    private fun responseCount(response: okhttp3.Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    private fun okHttpClientForRefresh(baseUrl: String): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()
}
