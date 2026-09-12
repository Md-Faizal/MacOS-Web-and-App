package com.example.macosbusinesssuite.ui.viewmodels

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.api.SessionManager
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.domain.calculation.DashboardCalculator
import com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BillingDashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val sessionManager = SessionManager.getInstance(application)
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private val gson = NetworkClient.customGson
    private var rawBills = listOf<Bill>()
    private var rawPayments = listOf<PaymentRecord>()
    private var rawContacts = listOf<Contact>()
    private var rawOrders = listOf<OrderRecord>()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                withContext(Dispatchers.IO) {
                    val api = NetworkClient.getService(sessionManager)

                    // 1. Fetch Bills
                    try {
                        val billsResp = api.getBills()
                        if (billsResp.isSuccessful && billsResp.body() != null) {
                            val element = billsResp.body()!!
                            rawBills = parseJsonList(element, object : TypeToken<List<Bill>>() {}.type)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BillingDashboardVM", "Error fetching bills", e)
                    }

                    // 2. Fetch Payments
                    try {
                        val paymentsResp = api.getPayments()
                        if (paymentsResp.isSuccessful && paymentsResp.body() != null) {
                            val element = paymentsResp.body()!!
                            rawPayments = parseJsonList(element, object : TypeToken<List<PaymentRecord>>() {}.type)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BillingDashboardVM", "Error fetching payments", e)
                    }

                    // 3. Fetch Contacts
                    try {
                        val contactsResp = api.getContacts()
                        if (contactsResp.isSuccessful && contactsResp.body() != null) {
                            val element = contactsResp.body()!!
                            rawContacts = parseJsonList(element, object : TypeToken<List<Contact>>() {}.type)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BillingDashboardVM", "Error fetching contacts", e)
                    }

                    // 4. Fetch Orders
                    try {
                        val ordersResp = api.getOrders()
                        if (ordersResp.isSuccessful && ordersResp.body() != null) {
                            val element = ordersResp.body()!!
                            rawOrders = parseJsonList(element, object : TypeToken<List<OrderRecord>>() {}.type)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BillingDashboardVM", "Error fetching orders", e)
                    }
                }

                recalculateAllMetrics()

            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = e.localizedMessage ?: "Failed to load dashboard data"
                    )
                }
            }
        }
    }

    private fun <T> parseJsonList(element: com.google.gson.JsonElement, type: java.lang.reflect.Type): List<T> {
        return try {
            val array = if (element.isJsonArray) {
                element.asJsonArray
            } else if (element.isJsonObject) {
                val obj = element.asJsonObject
                obj.get("data")?.asJsonArray
                    ?: obj.get("bills")?.asJsonArray
                    ?: obj.get("payments")?.asJsonArray
                    ?: obj.get("orders")?.asJsonArray
                    ?: obj.get("contacts")?.asJsonArray
            } else null

            if (array == null || array.size() == 0) return emptyList()

            val rawType = if (type is java.lang.reflect.ParameterizedType) {
                type.actualTypeArguments.firstOrNull() ?: type
            } else type

            val list = mutableListOf<T>()
            for (itemElem in array) {
                try {
                    val item: T? = gson.fromJson(itemElem, rawType)
                    if (item != null) list.add(item)
                } catch (e: Exception) {
                    android.util.Log.w("BillingDashboardVM", "Skipping single unparseable JSON item", e)
                }
            }
            list
        } catch (e: Exception) {
            android.util.Log.e("BillingDashboardVM", "Error parsing list JSON", e)
            emptyList()
        }
    }

    fun setMetricsPreset(preset: MetricsDatePreset) {
        _uiState.update { it.copy(selectedPreset = preset) }
        recalculateAllMetrics()
    }

    fun setCustomDateRange(start: String, end: String) {
        _uiState.update {
            it.copy(
                selectedPreset = MetricsDatePreset.CUSTOM,
                customStartDate = start,
                customEndDate = end
            )
        }
        recalculateAllMetrics()
    }

    fun setAvgChartPreset(preset: AvgChartPreset) {
        _uiState.update { it.copy(selectedAvgPreset = preset) }
    }

    fun setAvgCustomDateRange(start: String, end: String) {
        _uiState.update {
            it.copy(
                selectedAvgPreset = AvgChartPreset.CUSTOM,
                avgCustomStartDate = start,
                avgCustomEndDate = end
            )
        }
    }

    private fun recalculateAllMetrics() {
        val currentState = _uiState.value
        val preset = currentState.selectedPreset

        // 1. Calculate Key Metrics
        val keyMetrics = DashboardCalculator.calculateKeyMetrics(
            bills = rawBills,
            payments = rawPayments,
            contacts = rawContacts,
            preset = preset,
            customStart = currentState.customStartDate,
            customEnd = currentState.customEndDate
        )

        // 2. Calculate Order Metrics & Receivables Aging
        val (orderMetrics, aging) = DashboardCalculator.calculateOrderMetrics(
            orders = rawOrders,
            bills = rawBills,
            payments = rawPayments,
            contacts = rawContacts,
            preset = preset,
            customStart = currentState.customStartDate,
            customEnd = currentState.customEndDate
        )

        // 3. Calculate Top Performers
        val (topProducts, topCustomers) = DashboardCalculator.calculateTopPerformers(
            bills = rawBills,
            orders = rawOrders,
            payments = rawPayments,
            contacts = rawContacts,
            preset = preset,
            customStart = currentState.customStartDate,
            customEnd = currentState.customEndDate
        )

        // 4. Overdue Payment Reminders
        val reminders = FifoSettlementCalculator.getOverdueBills(
            bills = rawBills,
            payments = rawPayments,
            contacts = rawContacts
        )

        // 5. Order Stage Counts
        val stageCounts = mapOf(
            "Draft (Stage 1)" to rawOrders.count { it.currentStage == "stage1" },
            "Quality Check (Stage 2)" to rawOrders.count { it.currentStage == "stage2" },
            "Completed (Stage 3)" to rawOrders.count { it.currentStage == "stage3" || it.status == "complete" }
        )

        // 6. Payment Medium Split
        val mediumMap = mutableMapOf<String, Double>()
        rawPayments.forEach { p ->
            val medium = p.safePaymentMedium
            val amt = p.effectiveAmount
            mediumMap[medium] = (mediumMap[medium] ?: 0.0) + amt
        }

        // 7. Ticker Items
        val ticker = DashboardCalculator.generateTickerItems(
            keyMetrics = keyMetrics,
            reminders = reminders,
            topProducts = topProducts,
            topCustomers = topCustomers
        )

        _uiState.update {
            it.copy(
                isLoading = false,
                keyMetrics = keyMetrics,
                orderMetrics = orderMetrics,
                receivablesAging = aging,
                topProducts = topProducts,
                topCustomers = topCustomers,
                reminders = reminders,
                orderStageCounts = stageCounts,
                paymentMediumSplits = mediumMap,
                tickerItems = ticker
            )
        }
    }
}
