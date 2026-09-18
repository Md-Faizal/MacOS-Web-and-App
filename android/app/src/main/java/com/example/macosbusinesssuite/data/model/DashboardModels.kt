package com.example.macosbusinesssuite.data.model

import java.util.Date

enum class MetricsDatePreset(val displayName: String) {
    ALL("All Time"),
    THIS_MONTH("This Month"),
    LAST_MONTH("Last Month"),
    THIS_QUARTER("This Quarter"),
    THIS_YEAR("This Year"),
    CUSTOM("Custom Range")
}

enum class AvgChartPreset(val displayName: String) {
    DAYS_7("Last 7 Days"),
    DAYS_30("Last 30 Days"),
    DAYS_90("Last 90 Days"),
    THIS_YEAR("This Year"),
    ALL_TIME("All Time"),
    CUSTOM("Custom Range")
}

data class DashboardKeyMetrics(
    val totalBilled: Double = 0.0,
    val totalBillsCount: Int = 0,
    val totalCollected: Double = 0.0,
    val paymentsCount: Int = 0,
    val amountDue: Double = 0.0,
    val overdueAmount: Double = 0.0,
    val activeCustomersCount: Int = 0,
    val collectionRatePercent: Double = 0.0,
    val rangeText: String = ""
)

data class DashboardOrderMetrics(
    val totalOrders: Int = 0,
    val fulfilledOrdersCount: Int = 0,
    val pendingOrdersCount: Int = 0,
    val draftCount: Int = 0,
    val qualityCheckCount: Int = 0,
    val fulfillmentQtyRatio: Double = 0.0,
    val totalDeliveredQty: Int = 0,
    val totalOrderedQty: Int = 0,
    val settlementPaidRatio: Double = 0.0,
    val totalPaidOnOrders: Double = 0.0,
    val totalDeliveredValue: Double = 0.0,
    val totalOrderedValue: Double = 0.0,
    val avgOrderValue: Double = 0.0,
    val totalLostValue: Double = 0.0,
    val fulfillmentSpeedDaysText: String = "N/A",
    val rangeText: String = ""
)

data class ReceivablesAging(
    val outstanding0to30: Double = 0.0,
    val outstanding31to60: Double = 0.0,
    val outstanding61Plus: Double = 0.0,
    val totalOutstanding: Double = 0.0
)

data class SalesMetricDetail(
    val title: String = "",
    val periodLabel: String = "",
    val currentSales: Double = 0.0,
    val percentageChange: Double = 0.0
)

data class SalesMetricsSummary(
    val monthly: SalesMetricDetail = SalesMetricDetail(),
    val quarterly: SalesMetricDetail = SalesMetricDetail(),
    val yearly: SalesMetricDetail = SalesMetricDetail(),
    val averageBill: Double = 0.0,
    val avgBillChange: Double = 0.0
)

data class TopProductPerformer(
    val name: String = "",
    val quantity: Int = 0,
    val revenue: Double = 0.0
)

data class TopCustomerPerformer(
    val id: String = "",
    val name: String = "",
    val ordersCount: Int = 0,
    val billed: Double = 0.0,
    val dueBalance: Double = 0.0
)

data class OverdueBillReminder(
    val billId: String = "",
    val referenceNo: String = "",
    val customerName: String = "",
    val invoiceDate: String = "",
    val remainingAmount: Double = 0.0,
    val daysOverdue: Int = 0,
    val isCritical: Boolean = false // >60 days old from invoice date (daysOverdue > 30)
)

data class TopbarTickerItem(
    val text: String = "",
    val targetSection: String? = null
)

data class DashboardUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val selectedPreset: MetricsDatePreset = MetricsDatePreset.ALL,
    val customStartDate: String = "",
    val customEndDate: String = "",
    val selectedAvgPreset: AvgChartPreset = AvgChartPreset.DAYS_30,
    val avgCustomStartDate: String = "",
    val avgCustomEndDate: String = "",
    val keyMetrics: DashboardKeyMetrics = DashboardKeyMetrics(),
    val orderMetrics: DashboardOrderMetrics = DashboardOrderMetrics(),
    val receivablesAging: ReceivablesAging = ReceivablesAging(),
    val salesMetrics: SalesMetricsSummary = SalesMetricsSummary(),
    val topProducts: List<TopProductPerformer> = emptyList(),
    val topCustomers: List<TopCustomerPerformer> = emptyList(),
    val reminders: List<OverdueBillReminder> = emptyList(),
    val orderStageCounts: Map<String, Int> = emptyMap(),
    val paymentMediumSplits: Map<String, Double> = emptyMap(),
    val tickerItems: List<TopbarTickerItem> = emptyList()
)

data class DashboardMetricsResponse(
    val success: Boolean = true,
    val keyMetrics: DashboardKeyMetrics? = null,
    val orderMetrics: DashboardOrderMetrics? = null,
    val receivablesAging: ReceivablesAging? = null,
    val salesMetrics: SalesMetricsSummary? = null,
    val topProducts: List<TopProductPerformer> = emptyList(),
    val topCustomers: List<TopCustomerPerformer> = emptyList(),
    val overdueReminders: List<OverdueBillReminder> = emptyList()
)
