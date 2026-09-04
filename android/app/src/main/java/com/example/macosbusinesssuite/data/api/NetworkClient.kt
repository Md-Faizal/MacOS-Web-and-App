package com.example.macosbusinesssuite.data.api

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkClient {

    private var currentBaseUrl: String? = null
    private var apiService: ApiService? = null

    // Simple in-memory cookie storage for session preservation across API calls
    private val cookieStore = mutableMapOf<String, List<Cookie>>()

    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            cookieStore[url.host] = cookies
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            return cookieStore[url.host] ?: emptyList()
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
                    val requestBuilder = chain.request().newBuilder()

                    requestBuilder.addHeader("X-API-Key", "test-api-key-1234")
                    requestBuilder.addHeader("X-Client-Platform", "android")
                    requestBuilder.addHeader("X-App-Type", "native_android")

                    sessionManager.authToken?.let { token ->
                        if (token.isNotEmpty()) {
                            requestBuilder.addHeader("Authorization", "Bearer $token")
                        }
                    }

                    val cookie = sessionManager.authCookie ?: sessionManager.authToken?.let { "auth_token=$it" }
                    cookie?.let { c ->
                        requestBuilder.addHeader("Cookie", c)
                    }

                    val response = chain.proceed(requestBuilder.build())

                    // Capture Set-Cookie headers
                    try {
                        val setCookieHeaders = response.headers("Set-Cookie")
                        if (setCookieHeaders.isNotEmpty()) {
                            sessionManager.authCookie = setCookieHeaders.joinToString("; ")
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("NetworkClient", "Failed to save Set-Cookie header", e)
                    }

                    response
                }
                .authenticator { _, response ->
                    if (response.request.url.encodedPath.endsWith("/auth/mobile/refresh")) {
                        return@authenticator null
                    }

                    val refreshToken = sessionManager.refreshToken ?: return@authenticator null
                    synchronized(refreshLock) {
                        val currentToken = sessionManager.authToken
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
                                sessionManager.clearSession()
                                return@synchronized null
                            }
                            val payload = JSONObject(refreshed.body?.string() ?: return@synchronized null)
                            val accessToken = payload.optString("token").takeIf { it.isNotEmpty() }
                            val replacementRefresh = payload.optString("refreshToken").takeIf { it.isNotEmpty() }
                            if (accessToken == null || replacementRefresh == null) {
                                sessionManager.clearSession()
                                return@synchronized null
                            }
                            sessionManager.authToken = accessToken
                            sessionManager.refreshToken = replacementRefresh
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

            val retrofit = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create(customGson))
                .build()

            apiService = retrofit.create(ApiService::class.java)
        }

        return apiService!!
    }

    fun resetClient() {
        apiService = null
        currentBaseUrl = null
    }

    private fun okHttpClientForRefresh(baseUrl: String): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()
}
