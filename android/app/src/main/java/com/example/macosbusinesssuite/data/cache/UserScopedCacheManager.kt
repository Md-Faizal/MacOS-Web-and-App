package com.example.macosbusinesssuite.data.cache

import android.content.Context
import android.content.SharedPreferences
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.model.*
import com.google.gson.reflect.TypeToken

class UserScopedCacheManager private constructor(private val context: Context) {

    private val gson = NetworkClient.customGson

    companion object {
        @Volatile
        private var instance: UserScopedCacheManager? = null

        fun getInstance(context: Context): UserScopedCacheManager {
            return instance ?: synchronized(this) {
                instance ?: UserScopedCacheManager(context.applicationContext).also { instance = it }
            }
        }

        private const val PREF_PREFIX = "macos_user_cache_"
        private const val KEY_PRODUCTS = "cached_products"
        private const val KEY_CONTACTS = "cached_contacts"
        private const val KEY_BILLS = "cached_bills"
        private const val KEY_PAYMENTS = "cached_payments"
        private const val KEY_ORDERS = "cached_orders"
        private const val KEY_BILLING_SUMMARY = "cached_billing_summary"
        private const val KEY_ANALYTICS_SUMMARY = "cached_analytics_summary"
        private const val KEY_EXECUTIVE_KPI = "cached_executive_kpi"
        private const val KEY_SALES_TRENDS = "cached_sales_trends"
        private const val KEY_TOP_PRODUCTS = "cached_top_products"
        private const val KEY_TOP_CUSTOMERS = "cached_top_customers"
        private const val KEY_LAST_SYNC_PREFIX = "last_sync_"
    }

    private fun getPrefs(userId: String): SharedPreferences {
        val safeId = userId.replace("[^a-zA-Z0-9_-]".toRegex(), "_")
        return context.getSharedPreferences("$PREF_PREFIX$safeId", Context.MODE_PRIVATE)
    }

    // ==================== PRODUCTS ====================
    fun saveProducts(userId: String, products: List<Product>) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(products)
            getPrefs(userId).edit()
                .putString(KEY_PRODUCTS, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_PRODUCTS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getProducts(userId: String): List<Product> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_PRODUCTS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Product>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ==================== CONTACTS ====================
    fun saveContacts(userId: String, contacts: List<Contact>) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(contacts)
            getPrefs(userId).edit()
                .putString(KEY_CONTACTS, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_CONTACTS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getContacts(userId: String): List<Contact> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_CONTACTS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Contact>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ==================== BILLS ====================
    fun saveBills(userId: String, bills: List<Bill>) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(bills)
            getPrefs(userId).edit()
                .putString(KEY_BILLS, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_BILLS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getBills(userId: String): List<Bill> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_BILLS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Bill>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ==================== PAYMENTS ====================
    fun savePayments(userId: String, payments: List<PaymentRecord>) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(payments)
            getPrefs(userId).edit()
                .putString(KEY_PAYMENTS, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_PAYMENTS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getPayments(userId: String): List<PaymentRecord> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_PAYMENTS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<PaymentRecord>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ==================== ORDERS ====================
    fun saveOrders(userId: String, orders: List<OrderRecord>) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(orders)
            getPrefs(userId).edit()
                .putString(KEY_ORDERS, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_ORDERS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getOrders(userId: String): List<OrderRecord> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_ORDERS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<OrderRecord>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ==================== BILLING SUMMARY ====================
    fun saveBillingSummary(userId: String, summary: BillingSummary) {
        if (userId.isBlank()) return
        try {
            val json = gson.toJson(summary)
            getPrefs(userId).edit()
                .putString(KEY_BILLING_SUMMARY, json)
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_BILLING_SUMMARY", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun getBillingSummary(userId: String): BillingSummary? {
        if (userId.isBlank()) return null
        val json = getPrefs(userId).getString(KEY_BILLING_SUMMARY, null) ?: return null
        return try {
            gson.fromJson(json, BillingSummary::class.java)
        } catch (_: Exception) {
            null
        }
    }

    // ==================== ANALYTICS ====================
    fun saveAnalyticsSummary(userId: String, summary: AnalyticsSummary) {
        if (userId.isBlank()) return
        try {
            getPrefs(userId).edit()
                .putString(KEY_ANALYTICS_SUMMARY, gson.toJson(summary))
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_ANALYTICS_SUMMARY", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun saveExecutiveKPI(userId: String, kpi: ExecutiveKPI) {
        if (userId.isBlank()) return
        try {
            getPrefs(userId).edit()
                .putString(KEY_EXECUTIVE_KPI, gson.toJson(kpi))
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_EXECUTIVE_KPI", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun saveSalesTrends(userId: String, salesTrends: List<SalesTrendPoint>) {
        if (userId.isBlank()) return
        try {
            getPrefs(userId).edit()
                .putString(KEY_SALES_TRENDS, gson.toJson(salesTrends))
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_SALES_TRENDS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun saveTopProducts(userId: String, topProducts: List<TopProductItem>) {
        if (userId.isBlank()) return
        try {
            getPrefs(userId).edit()
                .putString(KEY_TOP_PRODUCTS, gson.toJson(topProducts))
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_TOP_PRODUCTS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun saveTopCustomers(userId: String, topCustomers: List<TopCustomerItem>) {
        if (userId.isBlank()) return
        try {
            getPrefs(userId).edit()
                .putString(KEY_TOP_CUSTOMERS, gson.toJson(topCustomers))
                .putLong("$KEY_LAST_SYNC_PREFIX$KEY_TOP_CUSTOMERS", System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
    }

    fun saveAnalytics(
        userId: String,
        summary: AnalyticsSummary?,
        kpi: ExecutiveKPI?,
        salesTrends: List<SalesTrendPoint>?,
        topProducts: List<TopProductItem>?,
        topCustomers: List<TopCustomerItem>?
    ) {
        if (userId.isBlank()) return
        try {
            val editor = getPrefs(userId).edit()
            if (summary != null) editor.putString(KEY_ANALYTICS_SUMMARY, gson.toJson(summary))
            if (kpi != null) editor.putString(KEY_EXECUTIVE_KPI, gson.toJson(kpi))
            if (salesTrends != null) editor.putString(KEY_SALES_TRENDS, gson.toJson(salesTrends))
            if (topProducts != null) editor.putString(KEY_TOP_PRODUCTS, gson.toJson(topProducts))
            if (topCustomers != null) editor.putString(KEY_TOP_CUSTOMERS, gson.toJson(topCustomers))
            editor.putLong("$KEY_LAST_SYNC_PREFIX" + "analytics", System.currentTimeMillis())
            editor.apply()
        } catch (_: Exception) {}
    }

    fun getAnalyticsSummary(userId: String): AnalyticsSummary? {
        if (userId.isBlank()) return null
        val json = getPrefs(userId).getString(KEY_ANALYTICS_SUMMARY, null) ?: return null
        return try {
            gson.fromJson(json, AnalyticsSummary::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun getExecutiveKPI(userId: String): ExecutiveKPI? {
        if (userId.isBlank()) return null
        val json = getPrefs(userId).getString(KEY_EXECUTIVE_KPI, null) ?: return null
        return try {
            gson.fromJson(json, ExecutiveKPI::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun getSalesTrends(userId: String): List<SalesTrendPoint> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_SALES_TRENDS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<SalesTrendPoint>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun getTopProducts(userId: String): List<TopProductItem> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_TOP_PRODUCTS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<TopProductItem>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun getTopCustomers(userId: String): List<TopCustomerItem> {
        if (userId.isBlank()) return emptyList()
        val json = getPrefs(userId).getString(KEY_TOP_CUSTOMERS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<TopCustomerItem>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun clearUserCache(userId: String) {
        if (userId.isBlank()) return
        getPrefs(userId).edit().clear().apply()
    }
}
