package com.example.macosbusinesssuite.ui.viewmodels

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.macosbusinesssuite.data.api.ApiService
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.domain.calculation.DashboardCalculator
import com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.reflect.TypeToken
import com.example.macosbusinesssuite.util.RemoteLogger

enum class MetricsPeriod(val label: String) {
    ALL("All Time"),
    THIS_MONTH("This Month"),
    LAST_MONTH("Last Month"),
    THIS_QUARTER("This Quarter"),
    THIS_YEAR("This Year")
}

enum class SalesTrendPeriod(val label: String) {
    MONTHLY("Monthly"),
    QUARTERLY("Quarterly"),
    YEARLY("Yearly")
}

data class DashboardMetricsState(
    val totalBilled: Double = 0.0,
    val totalPaid: Double = 0.0,
    val amountDue: Double = 0.0,
    val overdueAmount: Double = 0.0,
    val activeCustomersCount: Int = 0,
    val collectionRatePercent: Double = 0.0,
    val totalBillsCount: Int = 0,
    val totalPaymentsCount: Int = 0,
    val rangeText: String = ""
)

data class OrderMetricsState(
    val totalOrders: Int = 0,
    val fulfilledOrdersCount: Int = 0,
    val pendingOrdersCount: Int = 0,
    val stage1DraftCount: Int = 0,
    val stage2QcCount: Int = 0,
    val stage3CompleteCount: Int = 0,
    val totalDeliveredQty: Int = 0,
    val totalOrderedQty: Int = 0,
    val totalPaidOnOrders: Double = 0.0,
    val totalDeliveredValue: Double = 0.0,
    val totalOrderedValue: Double = 0.0,
    val avgOrderValue: Double = 0.0,
    val totalLostValue: Double = 0.0,
    val fulfillmentQtyRatio: Double = 0.0,
    val settlementPaidRatio: Double = 0.0,
    val fulfillmentSpeedDaysText: String = "N/A",
    val rangeText: String = ""
)

data class TopProductSummary(
    val name: String,
    val quantity: Double,
    val revenue: Double
)

data class TopCustomerSummary(
    val id: String,
    val name: String,
    val ordersCount: Int,
    val billedAmount: Double,
    val dueBalance: Double
)

data class OverdueReminderItem(
    val billId: String,
    val customerName: String,
    val amount: Double,
    val daysOverdue: Int,
    val isCritical: Boolean // true if > 60 days
)

class BillingViewModel(application: Application) : AndroidViewModel(application) {

    val sessionManager = com.example.macosbusinesssuite.data.api.SessionManager(application)
    private val api: ApiService get() = NetworkClient.getService(sessionManager)

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    // Data sources
    private val _bills = MutableStateFlow<List<Bill>>(emptyList())
    val bills: StateFlow<List<Bill>> = _bills.asStateFlow()

    private val _payments = MutableStateFlow<List<PaymentRecord>>(emptyList())
    val payments: StateFlow<List<PaymentRecord>> = _payments.asStateFlow()

    private val _orders = MutableStateFlow<List<OrderRecord>>(emptyList())
    val orders: StateFlow<List<OrderRecord>> = _orders.asStateFlow()

    private val _contacts = MutableStateFlow<List<Contact>>(emptyList())
    val contacts: StateFlow<List<Contact>> = _contacts.asStateFlow()

    private val _billingSummary = MutableStateFlow<BillingSummary?>(null)
    val billingSummary: StateFlow<BillingSummary?> = _billingSummary.asStateFlow()

    private var _totalCollectedFallback = 0.0

    private val _ledgerCustomers = MutableStateFlow<List<LedgerCustomer>>(emptyList())
    val ledgerCustomers: StateFlow<List<LedgerCustomer>> = _ledgerCustomers.asStateFlow()

    private val _detailedLedger = MutableStateFlow<DetailedLedgerData?>(null)
    val detailedLedger: StateFlow<DetailedLedgerData?> = _detailedLedger.asStateFlow()

    // Dashboard State Controls
    private val _selectedPeriod = MutableStateFlow(MetricsPeriod.ALL)
    val selectedPeriod: StateFlow<MetricsPeriod> = _selectedPeriod.asStateFlow()

    private val _selectedSalesTrendPeriod = MutableStateFlow(SalesTrendPeriod.MONTHLY)
    val selectedSalesTrendPeriod: StateFlow<SalesTrendPeriod> = _selectedSalesTrendPeriod.asStateFlow()

    // Dynamic Computed Dashboard State
    private val _dashboardMetrics = MutableStateFlow(DashboardMetricsState())
    val dashboardMetrics: StateFlow<DashboardMetricsState> = _dashboardMetrics.asStateFlow()

    private val _orderMetrics = MutableStateFlow(OrderMetricsState())
    val orderMetrics: StateFlow<OrderMetricsState> = _orderMetrics.asStateFlow()

    private val _receivablesAging = MutableStateFlow(ReceivablesAging())
    val receivablesAging: StateFlow<ReceivablesAging> = _receivablesAging.asStateFlow()

    private val _topProducts = MutableStateFlow<List<TopProductSummary>>(emptyList())
    val topProducts: StateFlow<List<TopProductSummary>> = _topProducts.asStateFlow()

    private val _topCustomers = MutableStateFlow<List<TopCustomerSummary>>(emptyList())
    val topCustomers: StateFlow<List<TopCustomerSummary>> = _topCustomers.asStateFlow()

    private val _overdueReminders = MutableStateFlow<List<OverdueReminderItem>>(emptyList())
    val overdueReminders: StateFlow<List<OverdueReminderItem>> = _overdueReminders.asStateFlow()

    private val _tickerInsights = MutableStateFlow<List<String>>(emptyList())
    val tickerInsights: StateFlow<List<String>> = _tickerInsights.asStateFlow()

    init {
        if (sessionManager.isLoggedIn && !sessionManager.authToken.isNullOrBlank()) {
            loadBillingData()
        }
    }

    fun setMetricsPeriod(period: MetricsPeriod) {
        _selectedPeriod.value = period
        recalculateDashboard()
    }

    fun setSalesTrendPeriod(period: SalesTrendPeriod) {
        _selectedSalesTrendPeriod.value = period
    }

    fun clearData() {
        _bills.value = emptyList()
        _payments.value = emptyList()
        _orders.value = emptyList()
        _contacts.value = emptyList()
        _billingSummary.value = null
        _ledgerCustomers.value = emptyList()
        _detailedLedger.value = null
        _dashboardMetrics.value = DashboardMetricsState()
        _orderMetrics.value = OrderMetricsState()
        _receivablesAging.value = ReceivablesAging()
        _topProducts.value = emptyList()
        _topCustomers.value = emptyList()
        _overdueReminders.value = emptyList()
        _tickerInsights.value = emptyList()
        _errorMessage.value = null
        _isLoading.value = false
    }

    fun loadBillingData(onComplete: () -> Unit = {}) {
        if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) {
            _isLoading.value = false
            onComplete()
            return
        }
        viewModelScope.launch {
            if (!sessionManager.isLoggedIn || sessionManager.authToken.isNullOrBlank()) {
                _isLoading.value = false
                onComplete()
                return@launch
            }
            _isLoading.value = true
            _errorMessage.value = null
            try {
                val gson = NetworkClient.customGson

                // 1. Bills
                try {
                    val billsResp = api.getBills()
                    if (billsResp.isSuccessful && billsResp.body() != null) {
                        _bills.value = parseJsonArray(billsResp.body()!!, gson, object : TypeToken<List<Bill>>() {}.type)
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading bills", e)
                }

                // 2. Billing Summary
                try {
                    val summaryResp = api.getBillingSummary()
                    if (summaryResp.isSuccessful && summaryResp.body() != null) {
                        val summaryJson = summaryResp.body()!!
                        val dataElement = if (summaryJson.isJsonObject && summaryJson.asJsonObject.has("data")) {
                            summaryJson.asJsonObject.get("data")
                        } else summaryJson
                        _billingSummary.value = gson.fromJson(dataElement, object : TypeToken<BillingSummary>() {}.type)
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading summary", e)
                }

                // 3. Ledger Customers
                try {
                    val ledgerResp = api.getLedgerCustomers()
                    if (ledgerResp.isSuccessful) {
                        _ledgerCustomers.value = ledgerResp.body() ?: emptyList()
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading ledger customers", e)
                }

                // 4. Contacts
                try {
                    val contactsResp = api.getContacts()
                    if (contactsResp.isSuccessful && contactsResp.body() != null) {
                        _contacts.value = parseJsonArray(contactsResp.body()!!, gson, object : TypeToken<List<Contact>>() {}.type)
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading contacts", e)
                }

                // 5. Payments
                try {
                    val paymentsResp = api.getPayments()
                    if (paymentsResp.isSuccessful && paymentsResp.body() != null) {
                        _payments.value = parseJsonArray(paymentsResp.body()!!, gson, object : TypeToken<List<PaymentRecord>>() {}.type)
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading payments", e)
                }

                // 6. Total collected fallback from billing invoices payments endpoint
                try {
                    val collectedResp = api.getTotalCollected()
                    if (collectedResp.isSuccessful && collectedResp.body() != null) {
                        _totalCollectedFallback = collectedResp.body()!!.totalCollected
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading total collected fallback", e)
                }

                // 7. Orders
                try {
                    val ordersResp = api.getOrders()
                    if (ordersResp.isSuccessful && ordersResp.body() != null) {
                        _orders.value = parseJsonArray(ordersResp.body()!!, gson, object : TypeToken<List<OrderRecord>>() {}.type)
                    }
                } catch (e: Exception) {
                    Log.e("BillingViewModel", "Error loading orders", e)
                }

                recalculateDashboard()
                recalculateLedgerCustomers()
            } catch (e: Exception) {
                _errorMessage.value = "Network error: ${e.message}"
            } finally {
                _isLoading.value = false
                onComplete()
            }
        }
    }

    fun recalculateLedgerCustomers() {
        val currentApiLedger = _ledgerCustomers.value
        val currentBills = _bills.value
        val currentPayments = _payments.value
        val currentContacts = _contacts.value

        val apiMap = currentApiLedger.associateBy { com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator.getCustomerKey(it.customerId, it.customerName, currentContacts) }
        val mergedMap = mutableMapOf<String, com.example.macosbusinesssuite.data.model.LedgerCustomer>()

        val billsByCust = currentBills.groupBy { com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator.getCustomerKey(it.customerId, it.customerName, currentContacts) }
        val paymentsByCust = currentPayments.groupBy { com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator.getCustomerKey(it.customerId, it.safeCustomerName, currentContacts) }

        val allKeys = (apiMap.keys + currentContacts.map { it.id } + currentContacts.map { it.name.trim().lowercase(java.util.Locale.US) } + billsByCust.keys + paymentsByCust.keys).filter { it.isNotBlank() }.toSet()

        allKeys.forEach { key ->
            val contact = currentContacts.find { it.id == key || it.name.trim().lowercase(java.util.Locale.US) == key }
            val cBills = billsByCust[key] ?: (contact?.let { c -> currentBills.filter { it.customerId == c.id || it.customerName.trim().equals(c.name.trim(), ignoreCase = true) } } ?: emptyList())
            val cPayments = paymentsByCust[key] ?: (contact?.let { c -> currentPayments.filter { it.customerId == c.id || it.safeCustomerName.trim().equals(c.name.trim(), ignoreCase = true) } } ?: emptyList())

            val customerName = contact?.name ?: cBills.firstOrNull()?.customerName ?: cPayments.firstOrNull()?.safeCustomerName ?: apiMap[key]?.customerName ?: "Customer"
            val customerId = contact?.id ?: cBills.firstOrNull()?.customerId ?: cPayments.firstOrNull()?.customerId ?: apiMap[key]?.customerId ?: key
            val phone = contact?.phone ?: apiMap[key]?.phone

            val openingBalance = contact?.openingBalance ?: 0.0
            val totalBilled = cBills.sumOf { it.grandTotal }
            val totalPaid = cPayments.filter { it.safeType.equals("PAYMENT", ignoreCase = true) }.sumOf { it.amount }
            val totalCredits = cPayments.filter { it.safeType.contains("CREDIT", ignoreCase = true) }.sumOf { it.creditAmount }
            val totalCollected = totalPaid + totalCredits

            val calculatedBalance = openingBalance + totalBilled - totalCollected

            val status = when {
                calculatedBalance < 0 -> "CREDIT"
                calculatedBalance > 0 -> {
                    val hasOverdue = cBills.any { b ->
                        val date = com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator.parseDate(b.date)
                        if (date != null) {
                            val diffDays = (System.currentTimeMillis() - date.time) / (1000 * 60 * 60 * 24)
                            diffDays > 30
                        } else false
                    }
                    if (hasOverdue) "OVERDUE" else "DUE"
                }
                else -> "CLEAR"
            }

            mergedMap[key] = com.example.macosbusinesssuite.data.model.LedgerCustomer(
                customerId = customerId,
                customerName = customerName,
                phone = phone,
                balance = calculatedBalance,
                status = status
            )
        }

        _ledgerCustomers.value = mergedMap.values.sortedBy { it.customerName.lowercase() }
    }

    // Search Query State
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        recalculateDashboard()
    }

    private fun <T> parseJsonArray(body: JsonElement, gson: Gson, type: java.lang.reflect.Type): List<T> {
        return try {
            val array = if (body.isJsonArray) {
                body.asJsonArray
            } else if (body.isJsonObject) {
                val obj = body.asJsonObject
                obj.get("data")?.asJsonArray
                    ?: obj.get("bills")?.asJsonArray
                    ?: obj.get("transactions")?.asJsonArray
                    ?: obj.get("invoices")?.asJsonArray
                    ?: obj.get("payments")?.asJsonArray
                    ?: obj.get("creditNotes")?.asJsonArray
                    ?: obj.get("credit_notes")?.asJsonArray
                    ?: obj.get("orders")?.asJsonArray
                    ?: obj.get("records")?.asJsonArray
                    ?: obj.get("items")?.asJsonArray
            } else null

            if (array == null || array.size() == 0) return emptyList()

            // Extract raw item class type from parameterized List type if possible
            val rawType = if (type is java.lang.reflect.ParameterizedType) {
                type.actualTypeArguments.firstOrNull() ?: type
            } else type

            val list = mutableListOf<T>()
            for (element in array) {
                try {
                    val item: T? = gson.fromJson(element, rawType)
                    if (item != null) {
                        list.add(item)
                    }
                } catch (e: Exception) {
                    Log.w("BillingViewModel", "Skipping single unparseable item in array", e)
                }
            }
            list
        } catch (e: Exception) {
            Log.e("BillingViewModel", "JSON parse error", e)
            emptyList()
        }
    }

    private fun parseDate(dateStr: String?): Date? {
        if (dateStr.isNullOrBlank()) return null
        val trimmed = dateStr.trim()
        trimmed.toLongOrNull()?.let { return Date(it) }

        val formattedStr = if (trimmed.contains(" ") && !trimmed.contains("T")) {
            trimmed.replace(" ", "T")
        } else trimmed

        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd",
            "dd/MM/yyyy",
            "MM/dd/yyyy"
        )
        for (format in formats) {
            try {
                val sdf = SimpleDateFormat(format, Locale.US)
                return sdf.parse(formattedStr)
            } catch (_: Exception) {}
        }
        return null
    }

    private fun getDateRange(period: MetricsPeriod): Pair<Date?, Date?> {
        val cal = Calendar.getInstance()
        val now = cal.time
        return when (period) {
            MetricsPeriod.ALL -> Pair(null, null)
            MetricsPeriod.THIS_MONTH -> {
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                Pair(cal.time, now)
            }
            MetricsPeriod.LAST_MONTH -> {
                cal.add(Calendar.MONTH, -1)
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val start = cal.time
                cal.set(Calendar.DAY_OF_MONTH, cal.getActualMaximum(Calendar.DAY_OF_MONTH))
                cal.set(Calendar.HOUR_OF_DAY, 23)
                cal.set(Calendar.MINUTE, 59)
                cal.set(Calendar.SECOND, 59)
                cal.set(Calendar.MILLISECOND, 999)
                val end = cal.time
                Pair(start, end)
            }
            MetricsPeriod.THIS_QUARTER -> {
                val currentMonth = cal.get(Calendar.MONTH)
                val qStartMonth = (currentMonth / 3) * 3
                cal.set(Calendar.MONTH, qStartMonth)
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                Pair(cal.time, now)
            }
            MetricsPeriod.THIS_YEAR -> {
                cal.set(Calendar.DAY_OF_YEAR, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                Pair(cal.time, now)
            }
        }
    }

    private fun MetricsPeriod.toDatePreset(): MetricsDatePreset = when (this) {
        MetricsPeriod.ALL -> MetricsDatePreset.ALL
        MetricsPeriod.THIS_MONTH -> MetricsDatePreset.THIS_MONTH
        MetricsPeriod.LAST_MONTH -> MetricsDatePreset.LAST_MONTH
        MetricsPeriod.THIS_QUARTER -> MetricsDatePreset.THIS_QUARTER
        MetricsPeriod.THIS_YEAR -> MetricsDatePreset.THIS_YEAR
    }

    /**
     * Complete calculation engine mirroring web dashboard.js
     */
    private fun recalculateDashboard() {
        val preset = _selectedPeriod.value.toDatePreset()
        val excludedContactIds = _contacts.value.filter { it.excludeFromStats == 1 }.map { it.id }.toSet()
        val validContacts = _contacts.value.filter { it.excludeFromStats != 1 }

        val contactMap = validContacts.associateBy { it.id }
        val rawBills = _bills.value.filter { it.customerId == null || !excludedContactIds.contains(it.customerId) }
        val rawPayments = _payments.value.filter { it.customerId == null || !excludedContactIds.contains(it.customerId) }
        val rawOrders = _orders.value.filter { it.customerId == null || !excludedContactIds.contains(it.customerId) }
            .map { order ->
                if (order.customerName.isBlank() && order.customerId != null) {
                    val contact = contactMap[order.customerId]
                    if (contact != null && contact.name.isNotBlank()) order.copy(customerName = contact.name) else order
                } else order
            }

        val query = _searchQuery.value.trim()
        val allBills = if (query.isEmpty()) rawBills else rawBills.filter {
            it.billNumber.contains(query, true) || it.customerName.contains(query, true) || it.id.contains(query, true)
        }
        val allPayments = if (query.isEmpty()) rawPayments else rawPayments.filter {
            it.customerName.contains(query, true) || it.id.contains(query, true) || it.referenceNo?.contains(query, true) == true
        }
        val allOrders = if (query.isEmpty()) rawOrders else rawOrders.filter {
            it.orderNumber.contains(query, true) || it.customerName.contains(query, true) || it.id.contains(query, true)
        }

        val keyMetrics = DashboardCalculator.calculateKeyMetrics(allBills, allPayments, validContacts, preset)
        val fallbackPaid = if (keyMetrics.totalCollected <= 0.0 && _totalCollectedFallback > 0.0) {
            _totalCollectedFallback
        } else 0.0
        val totalPaid = if (keyMetrics.totalCollected <= 0.0 && fallbackPaid > 0.0) {
            fallbackPaid
        } else keyMetrics.totalCollected

        val fallbackBilled = _billingSummary.value?.totalSales ?: 0.0
        val totalBilled = if (keyMetrics.totalBilled <= 0.0 && fallbackBilled > 0.0) {
            fallbackBilled
        } else keyMetrics.totalBilled

        val calculatedAmountDue = Math.max(0.0, totalBilled - totalPaid)
        val calculatedCollectionRate = if (totalBilled > 0.0) (totalPaid / totalBilled) * 100.0 else 0.0

        _dashboardMetrics.value = DashboardMetricsState(
            totalBilled = totalBilled,
            totalPaid = totalPaid,
            amountDue = calculatedAmountDue,
            overdueAmount = keyMetrics.overdueAmount,
            activeCustomersCount = keyMetrics.activeCustomersCount,
            collectionRatePercent = calculatedCollectionRate,
            totalBillsCount = keyMetrics.totalBillsCount,
            totalPaymentsCount = keyMetrics.paymentsCount,
            rangeText = keyMetrics.rangeText
        )

        val (orderMetrics, receivablesAging) = DashboardCalculator.calculateOrderMetrics(
            allOrders,
            allBills,
            allPayments,
            validContacts,
            preset
        )

        _orderMetrics.value = OrderMetricsState(
            totalOrders = orderMetrics.totalOrders,
            fulfilledOrdersCount = orderMetrics.fulfilledOrdersCount,
            pendingOrdersCount = orderMetrics.pendingOrdersCount,
            stage1DraftCount = orderMetrics.draftCount,
            stage2QcCount = orderMetrics.qualityCheckCount,
            fulfillmentQtyRatio = orderMetrics.fulfillmentQtyRatio,
            totalDeliveredQty = orderMetrics.totalDeliveredQty,
            totalOrderedQty = orderMetrics.totalOrderedQty,
            settlementPaidRatio = orderMetrics.settlementPaidRatio,
            totalPaidOnOrders = orderMetrics.totalPaidOnOrders,
            totalDeliveredValue = orderMetrics.totalDeliveredValue,
            totalOrderedValue = orderMetrics.totalOrderedValue,
            avgOrderValue = orderMetrics.avgOrderValue,
            totalLostValue = orderMetrics.totalLostValue,
            fulfillmentSpeedDaysText = orderMetrics.fulfillmentSpeedDaysText,
            rangeText = orderMetrics.rangeText
        )

        _receivablesAging.value = receivablesAging

        val (topProdList, topCustList) = DashboardCalculator.calculateTopPerformers(
            allBills,
            allOrders,
            allPayments,
            validContacts,
            preset
        )
        _topProducts.value = topProdList.map { TopProductSummary(it.name, it.quantity.toDouble(), it.revenue) }
        _topCustomers.value = topCustList.map { TopCustomerSummary(it.id, it.name, it.ordersCount, it.billed, it.dueBalance) }

        _overdueReminders.value = FifoSettlementCalculator.getOverdueBills(allBills, allPayments, validContacts)
            .map { overdue ->
                OverdueReminderItem(
                    billId = overdue.referenceNo.ifEmpty { overdue.billId },
                    customerName = overdue.customerName,
                    amount = overdue.remainingAmount,
                    daysOverdue = overdue.daysOverdue,
                    isCritical = overdue.isCritical
                )
            }

        val tickerList = mutableListOf<String>()
        tickerList.add("Revenue: ₹${String.format(Locale.US, "%.0f", totalBilled)}")
        tickerList.add("Collected: ₹${String.format(Locale.US, "%.0f", totalPaid)}")
        if (_overdueReminders.value.isNotEmpty()) {
            tickerList.add("Alert: ${_overdueReminders.value.size} overdue invoices pending")
        }
        _topCustomers.value.firstOrNull()?.let {
            tickerList.add("Top Customer: ${it.name}")
        }
        _tickerInsights.value = tickerList
    }

    fun createBill(request: CreateBillRequest, onComplete: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.createBill(request)
                if (response.isSuccessful) {
                    loadBillingData()
                    onComplete(true, null)
                } else {
                    onComplete(false, "Failed to create bill")
                }
            } catch (e: Exception) {
                onComplete(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun recordPayment(request: RecordPaymentRequest, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.recordPayment(request)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "✓ Payment recorded successfully")
                } else {
                    val err = response.errorBody()?.string() ?: "Failed to record payment"
                    onResult(false, err)
                }
            } catch (e: Exception) {
                onResult(false, e.message ?: "Network error recording payment")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun recordCreditNote(request: RecordCreditNoteRequest, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.recordCreditNote(request)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "✓ Credit note issued successfully")
                } else {
                    val err = response.errorBody()?.string() ?: "Failed to issue credit note"
                    onResult(false, err)
                }
            } catch (e: Exception) {
                onResult(false, e.message ?: "Network error issuing credit note")
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun fetchCustomerOutstanding(customerName: String, onResult: (CustomerOutstandingResponse?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = api.getCustomerOutstanding(customerName)
                if (response.isSuccessful) {
                    onResult(response.body())
                } else {
                    onResult(null)
                }
            } catch (e: Exception) {
                onResult(null)
            }
        }
    }

    fun fetchNextPaymentReference(customerId: String?, paymentDate: String?, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = api.getNextPaymentReference(customerId, paymentDate)
                if (response.isSuccessful) {
                    onResult(response.body()?.referenceNumber)
                } else {
                    onResult(null)
                }
            } catch (e: Exception) {
                onResult(null)
            }
        }
    }

    fun fetchNextCreditReference(customerId: String?, paymentDate: String?, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = api.getNextCreditReference(customerId, paymentDate)
                if (response.isSuccessful) {
                    onResult(response.body()?.referenceNumber)
                } else {
                    onResult(null)
                }
            } catch (e: Exception) {
                onResult(null)
            }
        }
    }

    fun fetchDetailedLedger(customerId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            val fallbackData = buildFallbackDetailedLedger(customerId)
            _detailedLedger.value = fallbackData
            try {
                val response = api.getDetailedLedger(customerId)
                if (response.isSuccessful && response.body()?.success == true && response.body()?.data != null) {
                    _detailedLedger.value = response.body()?.data
                }
            } catch (e: Exception) {
                Log.w("BillingViewModel", "API detailed ledger unavailable, using cached state: ${e.message}")
            } finally {
                _isLoading.value = false
            }
        }
    }

    private fun buildFallbackDetailedLedger(customerId: String): com.example.macosbusinesssuite.data.model.DetailedLedgerData {
        val contactsList = _contacts.value
        val billsList = _bills.value
        val paymentsList = _payments.value

        val contact = contactsList.find { it.id == customerId }
            ?: contactsList.find { it.name.trim().equals(customerId.trim(), ignoreCase = true) }
        val custName = contact?.name ?: customerId

        val custBills = billsList.filter { 
            (it.customerId != null && it.customerId == customerId) || 
            it.customerName.trim().equals(custName.trim(), ignoreCase = true) 
        }
        val custPayments = paymentsList.filter { 
            (it.customerId != null && it.customerId == customerId) || 
            it.customerName.trim().equals(custName.trim(), ignoreCase = true) 
        }

        val dummyContact = contact ?: com.example.macosbusinesssuite.data.model.Contact(id = customerId, name = custName)
        val dummyBank = com.example.macosbusinesssuite.data.model.BankDetails()
        val stats = com.example.macosbusinesssuite.data.model.LedgerStats(
            totalBills = custBills.size,
            totalPayments = custPayments.size,
            totalBilled = custBills.sumOf { it.grandTotal },
            totalCollected = custPayments.sumOf { it.effectiveAmount }
        )
        return com.example.macosbusinesssuite.data.model.DetailedLedgerData(
            customer = dummyContact,
            bank = dummyBank,
            stats = stats,
            bills = custBills,
            payments = custPayments
        )
    }

    fun deleteBill(id: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.deleteBill(id)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Bill deleted successfully")
                } else {
                    onResult(false, "Failed to delete bill")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteOrder(id: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.deleteOrder(id)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Order deleted successfully")
                } else {
                    onResult(false, "Failed to delete order")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun fetchNextOrderNumber(onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = api.getNextOrderNumber()
                if (response.isSuccessful) {
                    onResult(response.body()?.referenceNumber)
                } else {
                    onResult(null)
                }
            } catch (e: Exception) {
                onResult(null)
            }
        }
    }

    fun createOrder(request: CreateOrderRequest, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.createOrder(request)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Order created successfully")
                } else {
                    onResult(false, "Failed to create order")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deletePayment(paymentId: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = api.deletePayment(paymentId)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Payment deleted successfully")
                } else {
                    onResult(false, "Failed to delete payment")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateOpeningBalance(contactId: String, newBalance: Double, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val contact = _contacts.value.find { it.id == contactId } ?: api.getContact(contactId).body()
                if (contact != null) {
                    val updated = contact.copy(openingBalance = newBalance)
                    val response = api.updateContact(contactId, updated)
                    if (response.isSuccessful) {
                        loadBillingData()
                        onResult(true, "Opening balance updated successfully")
                    } else {
                        onResult(false, "Failed to update opening balance")
                    }
                } else {
                    onResult(false, "Customer not found")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateBillDate(billId: String, newDate: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val req = UpdateBillRequest(invoiceDate = newDate)
                val response = api.updateBill(billId, req)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Bill date updated successfully")
                } else {
                    onResult(false, "Failed to update bill date")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updatePaymentDate(paymentId: String, newDate: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val req = mapOf<String, Any>("payment_date" to newDate, "date" to newDate)
                val response = api.updatePayment(paymentId, req)
                if (response.isSuccessful) {
                    loadBillingData()
                    onResult(true, "Payment date updated successfully")
                } else {
                    onResult(false, "Failed to update payment date")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun fetchPreviewBytes(
        docType: String,
        idOrNo: String,
        customerName: String,
        onResult: (ByteArray?, String?) -> Unit
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val requestMap = mutableMapOf<String, Any>()
                val response = when (docType) {
                    "invoice" -> {
                        requestMap["invoiceNo"] = idOrNo
                        idOrNo.toIntOrNull()?.let { requestMap["invoiceId"] = it }
                        api.previewInvoicePdf(requestMap)
                    }
                    "payment" -> {
                        requestMap["paymentId"] = idOrNo
                        api.previewPaymentPdf(requestMap)
                    }
                    "opening-balance" -> {
                        requestMap["customerName"] = customerName
                        api.previewOpeningBalancePdf(requestMap)
                    }
                    else -> null
                }
                if (response != null && response.isSuccessful && response.body() != null) {
                    val bytes = response.body()!!.bytes()
                    onResult(bytes, null)
                } else {
                    onResult(null, "Failed to fetch document preview")
                }
            } catch (e: Exception) {
                onResult(null, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun exportPdfBytes(
        docType: String,
        idOrNo: String,
        customerName: String,
        onResult: (ByteArray?, String?) -> Unit
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val requestMap = mutableMapOf<String, Any>()
                val response = when (docType) {
                    "invoice" -> {
                        requestMap["invoiceNo"] = idOrNo
                        idOrNo.toIntOrNull()?.let { requestMap["invoiceId"] = it }
                        api.exportInvoicePdf(requestMap)
                    }
                    "payment" -> {
                        requestMap["paymentId"] = idOrNo
                        api.exportPaymentPdf(requestMap)
                    }
                    "opening-balance" -> {
                        requestMap["customerName"] = customerName
                        api.exportOpeningBalancePdf(requestMap)
                    }
                    else -> null
                }
                if (response != null && response.isSuccessful && response.body() != null) {
                    val bytes = response.body()!!.bytes()
                    onResult(bytes, null)
                } else {
                    onResult(null, "Failed to generate PDF")
                }
            } catch (e: Exception) {
                onResult(null, e.message)
            } finally {
                _isLoading.value = false
            }
        }
    }
}

